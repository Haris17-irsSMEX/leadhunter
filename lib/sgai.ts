import type { Lead } from "@/lib/types";

export const SGAI_BASE = "https://v2-api.scrapegraphai.com/api";
const SGAI_KEY = process.env.SGAI_API_KEY!;

type JsonRecord = Record<string, unknown>;

export const LEAD_SCHEMA = {
  type: "object",
  properties: {
    company_name: { type: "string" },
    description: { type: "string" },
    founder_name: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    linkedin_url: { type: "string" },
    twitter_handle: { type: "string" },
    location: { type: "string" },
    country: { type: "string" },
    industry: { type: "string" },
    employee_count: { type: "string" },
    pricing_model: { type: "string" },
    tech_stack: { type: "array", items: { type: "string" } },
  },
} as const;

const WEBSITE_PROMPT =
  "Extract all available lead info: company name, what they do (2 sentence description), founder/CEO name, contact email, phone, LinkedIn URL, Twitter handle, city and country, industry, approximate employee count range (e.g. 1-10, 10-50, 50-200), pricing model (free/freemium/paid/enterprise), and any tech stack signals";

const DIRECTORY_PROMPT =
  "This is a business directory page. Extract ALL companies listed. For each one get: name, website, description, location, industry, founder name if shown, employee count if visible, any contact info";

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function firstString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeTechStack(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const stack = value
    .map((item) => stringValue(item))
    .filter((item): item is string => Boolean(item));

  return stack.length ? stack : undefined;
}

function normalizeLead(value: unknown, source: Lead["source"], sourceUrl: string): Lead {
  const record = isRecord(value) ? value : {};

  return {
    company_name: firstString(record, ["company_name", "name", "business_name", "title"]) ?? "Unknown",
    website: firstString(record, ["website", "website_url", "url", "link"]) ?? undefined,
    description: firstString(record, ["description", "brief_description", "summary", "about"]) ?? undefined,
    founder_name: firstString(record, ["founder_name", "founder", "ceo_name", "owner_name", "ceo"]) ?? undefined,
    email: firstString(record, ["email", "email_address", "contact_email"]) ?? undefined,
    phone: firstString(record, ["phone", "phone_number", "telephone"]) ?? undefined,
    linkedin_url: firstString(record, ["linkedin_url", "linkedin", "linkedin_profile"]) ?? undefined,
    twitter_handle: firstString(record, ["twitter_handle", "twitter", "x_handle", "twitter_url"]) ?? undefined,
    location: firstString(record, ["location", "address", "city"]) ?? undefined,
    country: firstString(record, ["country", "country_name"]) ?? undefined,
    industry: firstString(record, ["industry", "business_type", "category", "type"]) ?? undefined,
    employee_count: firstString(record, ["employee_count", "employees", "employee_count_range", "team_size"]) ?? undefined,
    pricing_model: firstString(record, ["pricing_model", "pricing", "plan_type"]) ?? undefined,
    tech_stack: normalizeTechStack(record.tech_stack),
    source,
    source_url: sourceUrl,
    scraped_at: new Date().toISOString(),
  };
}

function getResult(response: unknown) {
  if (isRecord(response) && "result" in response) {
    return response.result;
  }

  return response;
}

function getLeadItems(response: unknown) {
  const result = getResult(response);

  if (Array.isArray(result)) {
    return result;
  }

  if (isRecord(result) && Array.isArray(result.results)) {
    return result.results;
  }

  if (isRecord(response) && Array.isArray(response.results)) {
    return response.results;
  }

  if (isRecord(result)) {
    return [result];
  }

  return [];
}

async function postSgai<T>(path: string, body: JsonRecord): Promise<T> {
  const response = await fetch(`${SGAI_BASE}${path}`, {
    method: "POST",
    headers: {
      "SGAI-APIKEY": SGAI_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`ScrapeGraphAI ${path} failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function extractWithSgai(url: string, prompt: string): Promise<unknown> {
  return postSgai<unknown>("/extract", {
    url,
    prompt,
    mode: "normal",
  });
}

export async function scrapeWebsite(url: string, prompt = WEBSITE_PROMPT): Promise<Lead> {
  try {
    const response = await extractWithSgai(url, prompt);

    return normalizeLead(getResult(response), "website", url);
  } catch (error) {
    console.log(`[scrapeWebsite] Error for ${url}:`, error instanceof Error ? error.message : error);
    return {
      company_name: "SCRAPE_FAILED",
      source: "website",
      source_url: url,
    };
  }
}

const GOOGLE_PLACES_PAGE_SIZE = 20;
const GOOGLE_PLACES_PAGE_DELAY_MS = 2000;
const GOOGLE_PLACES_REQUEST_TIMEOUT_MS = 15000;
const GOOGLE_PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.types",
  "places.businessStatus",
  "nextPageToken",
].join(",");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GooglePlacesStage = "configuration" | "text_search";

export class GooglePlacesProviderError extends Error {
  constructor(
    readonly stage: GooglePlacesStage,
    readonly httpStatus: number,
    readonly providerStatus?: string,
    readonly providerMessage?: string,
  ) {
    super(providerMessage || "Google Places provider request failed.");
    this.name = "GooglePlacesProviderError";
  }
}

async function googlePlacesError(response: Response, stage: GooglePlacesStage) {
  let providerStatus: string | undefined;
  let providerMessage: string | undefined;

  try {
    const payload = (await response.json()) as {
      error?: {
        status?: string;
        message?: string;
      };
    };
    providerStatus = payload.error?.status;
    providerMessage = payload.error?.message;
  } catch {
    // A non-JSON provider response is still a provider failure, never a valid empty search.
  }

  console.error("[google-places] provider request failed", {
    stage,
    httpStatus: response.status,
    providerStatus: providerStatus ?? "UNKNOWN",
    providerMessage: providerMessage ?? response.statusText ?? "Unknown provider error",
  });

  return new GooglePlacesProviderError(stage, response.status, providerStatus, providerMessage);
}

async function fetchGooglePlaces(url: string, init: RequestInit, stage: GooglePlacesStage) {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(GOOGLE_PLACES_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw await googlePlacesError(response, stage);
    }

    return response;
  } catch (error) {
    if (error instanceof GooglePlacesProviderError) {
      throw error;
    }

    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const providerStatus = timedOut ? "TIMEOUT" : "NETWORK_ERROR";
    const providerMessage = timedOut
      ? "Google Places request timed out."
      : "Google Places could not be reached.";

    console.error("[google-places] provider request failed", {
      stage,
      httpStatus: 0,
      providerStatus,
      providerMessage,
    });

    throw new GooglePlacesProviderError(stage, 0, providerStatus, providerMessage);
  }
}

export async function scrapeGoogleMaps(query: string, location: string, numResults: number): Promise<Lead[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  const safeNumResults = Math.min(Math.max(Math.floor(numResults), 1), 50);
  const searchQuery = `${query} in ${location}`;

  console.info("[google-places] search started", {
    apiKeyPresent: Boolean(apiKey),
    query: searchQuery,
    requested: safeNumResults,
  });

  if (!apiKey) {
    throw new GooglePlacesProviderError(
      "configuration",
      0,
      "MISSING_API_KEY",
      "GOOGLE_PLACES_API_KEY is not configured.",
    );
  }

  const sourceUrl = `maps:${query} ${location}`;
  const places: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    websiteUri?: string;
    types?: string[];
    businessStatus?: string;
  }> = [];
  let pageToken: string | undefined;
  const pageSize = Math.min(GOOGLE_PLACES_PAGE_SIZE, safeNumResults);

  while (places.length < safeNumResults) {
    if (pageToken) {
      await sleep(GOOGLE_PLACES_PAGE_DELAY_MS);
    }

    const textSearchResponse = await fetchGooglePlaces("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: searchQuery,
        pageSize,
        ...(pageToken ? { pageToken } : {}),
      }),
    }, "text_search");

    let textSearchData: {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        nationalPhoneNumber?: string;
        websiteUri?: string;
        types?: string[];
        businessStatus?: string;
      }>;
      nextPageToken?: string;
      error?: {
        status?: string;
        message?: string;
      };
    };

    try {
      textSearchData = (await textSearchResponse.json()) as typeof textSearchData;
    } catch {
      console.error("[google-places] provider request failed", {
        stage: "text_search",
        httpStatus: textSearchResponse.status,
        providerStatus: "INVALID_RESPONSE",
        providerMessage: "Google Places returned an unreadable response.",
      });
      throw new GooglePlacesProviderError(
        "text_search",
        textSearchResponse.status,
        "INVALID_RESPONSE",
        "Google Places returned an unreadable response.",
      );
    }

    if (textSearchData.error?.message) {
      throw new GooglePlacesProviderError(
        "text_search",
        textSearchResponse.status,
        textSearchData.error.status,
        textSearchData.error.message,
      );
    }

    if (textSearchData.places !== undefined && !Array.isArray(textSearchData.places)) {
      console.error("[google-places] provider request failed", {
        stage: "text_search",
        httpStatus: textSearchResponse.status,
        providerStatus: "INVALID_RESPONSE",
        providerMessage: "Google Places returned an unexpected result structure.",
      });
      throw new GooglePlacesProviderError(
        "text_search",
        textSearchResponse.status,
        "INVALID_RESPONSE",
        "Google Places returned an unexpected result structure.",
      );
    }

    const rawPagePlaces = textSearchData.places ?? [];
    const pagePlaces = rawPagePlaces.filter(
      (place) =>
        typeof place?.id === "string" &&
        place.id.length > 0 &&
        typeof place.displayName?.text === "string" &&
        place.displayName.text.length > 0,
    );

    if (rawPagePlaces.length > 0 && pagePlaces.length === 0) {
      console.error("[google-places] provider request failed", {
        stage: "text_search",
        httpStatus: textSearchResponse.status,
        providerStatus: "INVALID_RESPONSE",
        providerMessage: "Google Places returned results without required business fields.",
      });
      throw new GooglePlacesProviderError(
        "text_search",
        textSearchResponse.status,
        "INVALID_RESPONSE",
        "Google Places returned results without required business fields.",
      );
    }

    places.push(...pagePlaces);
    pageToken = textSearchData.nextPageToken;

    console.info("[google-places] text search response", {
      query: searchQuery,
      requested: safeNumResults,
      httpStatus: textSearchResponse.status,
      pageResultCount: pagePlaces.length,
      accumulatedResultCount: Math.min(places.length, safeNumResults),
      hasNextPage: Boolean(pageToken),
    });

    if (!pageToken || !pagePlaces.length) {
      break;
    }
  }

  return places.slice(0, safeNumResults).map(
    (place) =>
      ({
      company_name: place.displayName?.text ?? "Unknown",
      phone: place.nationalPhoneNumber,
      website: place.websiteUri,
      location: place.formattedAddress,
      industry: Array.isArray(place.types) ? place.types.join(", ") : undefined,
      source: "google_maps" as const,
      source_external_id: place.id,
      source_url: sourceUrl,
      raw_metadata: {
        google_place_id: place.id,
        business_status: place.businessStatus,
        types: place.types,
      },
      scraped_at: new Date().toISOString(),
      }) satisfies Lead,
  );
}

export async function scrapeDirectory(url: string): Promise<Lead[]> {
  const response = await extractWithSgai(url, DIRECTORY_PROMPT);

  return getLeadItems(response).map((item) => normalizeLead(item, "directory", url));
}

export async function scrapeMultiple(urls: string[]): Promise<Lead[]> {
  const results = await Promise.allSettled(urls.map((url) => scrapeWebsite(url)));

  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}
