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
const GOOGLE_PLACES_DETAIL_CONCURRENCY = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index] as T) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, worker));
  return results;
}

export async function scrapeGoogleMaps(query: string, location: string, numResults: number): Promise<Lead[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY is not configured.");
  }

  const safeNumResults = Math.min(Math.max(Math.floor(numResults), 1), 50);
  const sourceUrl = `maps:${query} ${location}`;
  const places: Array<{ id: string }> = [];
  let pageToken: string | undefined;

  while (places.length < safeNumResults) {
    if (pageToken) {
      await sleep(GOOGLE_PLACES_PAGE_DELAY_MS);
    }

    const textSearchResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,nextPageToken",
      },
      body: JSON.stringify({
        textQuery: `${query} in ${location}`,
        pageSize: Math.min(GOOGLE_PLACES_PAGE_SIZE, safeNumResults - places.length),
        ...(pageToken ? { pageToken } : {}),
      }),
    });

    if (!textSearchResponse.ok) {
      throw new Error(`Google Places text search failed with status ${textSearchResponse.status}`);
    }

    const textSearchData = (await textSearchResponse.json()) as {
      places?: Array<{ id?: string }>;
      nextPageToken?: string;
      error?: { message?: string };
    };

    if (textSearchData.error?.message) {
      throw new Error(textSearchData.error.message);
    }

    const pagePlaces = (textSearchData.places ?? []).filter(
      (place): place is { id: string } => typeof place.id === "string" && place.id.length > 0,
    );

    places.push(...pagePlaces);
    pageToken = textSearchData.nextPageToken;

    if (!pageToken || !pagePlaces.length) {
      break;
    }
  }

  const detailResults = await mapWithConcurrency(places.slice(0, safeNumResults), GOOGLE_PLACES_DETAIL_CONCURRENCY, async (place) => {
    const detailsResponse = await fetch(`https://places.googleapis.com/v1/places/${place.id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,nationalPhoneNumber,websiteUri,types,businessStatus",
      },
    });

    if (!detailsResponse.ok) {
      throw new Error(`Google Places details failed with status ${detailsResponse.status}`);
    }

    const detailsData = (await detailsResponse.json()) as {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      websiteUri?: string;
      types?: string[];
      businessStatus?: string;
      error?: { message?: string };
    };

    if (detailsData.error?.message) {
      throw new Error(detailsData.error.message);
    }

    return {
      company_name: detailsData.displayName?.text ?? "Unknown",
      phone: detailsData.nationalPhoneNumber,
      website: detailsData.websiteUri,
      location: detailsData.formattedAddress,
      industry: Array.isArray(detailsData.types) ? detailsData.types.join(", ") : undefined,
      source: "google_maps" as const,
      source_external_id: detailsData.id,
      source_url: sourceUrl,
      raw_metadata: {
        google_place_id: detailsData.id,
        business_status: detailsData.businessStatus,
        types: detailsData.types,
      },
      scraped_at: new Date().toISOString(),
    } satisfies Lead;
  });

  return detailResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

export async function scrapeDirectory(url: string): Promise<Lead[]> {
  const response = await extractWithSgai(url, DIRECTORY_PROMPT);

  return getLeadItems(response).map((item) => normalizeLead(item, "directory", url));
}

export async function scrapeMultiple(urls: string[]): Promise<Lead[]> {
  const results = await Promise.allSettled(urls.map((url) => scrapeWebsite(url)));

  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}
