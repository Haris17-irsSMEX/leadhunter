import type { Lead } from "@/lib/types";
import { getPublicDataCache, PUBLIC_DATA_FRESHNESS, publicCacheKey, setPublicDataCache } from "@/lib/public-data-cache";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

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

type GooglePlacesStage = "configuration" | "text_search" | "autocomplete" | "place_details" | "nearby_search";

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
    providerMessage: (providerMessage ?? response.statusText ?? "Unknown provider error").slice(0, 500),
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

export type GoogleGeoPoint = {
  latitude: number;
  longitude: number;
};

export type GoogleGeoBounds = {
  southwest: GoogleGeoPoint;
  northeast: GoogleGeoPoint;
};

export type GoogleCitySuggestion = {
  placeId: string;
  label: string;
};

export type ResolvedGoogleCity = {
  placeId: string;
  name: string;
  label: string;
  country?: string;
  center: GoogleGeoPoint;
  bounds: GoogleGeoBounds;
};

export type PublicProviderResult<T> = {
  value: T;
  cached: boolean;
  providerCalls: number;
};

export type GoogleNearbyPlace = {
  id: string;
  name: string;
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  types: string[];
  primaryType?: string;
  primaryTypeDisplayName?: string;
  businessStatus?: string;
  location: GoogleGeoPoint;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  websiteFieldRequested: true;
};

export class GoogleCityAmbiguousError extends Error {
  readonly code = "AMBIGUOUS_CITY";

  constructor(readonly suggestions: GoogleCitySuggestion[]) {
    super("Several cities match that name. Choose the correct city to continue.");
    this.name = "GoogleCityAmbiguousError";
  }
}

function googlePlacesApiKey() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    throw new GooglePlacesProviderError("configuration", 0, "MISSING_API_KEY", "GOOGLE_PLACES_API_KEY is not configured.");
  }
  return apiKey;
}

function validPoint(value: unknown): value is GoogleGeoPoint {
  if (!isRecord(value)) return false;
  return typeof value.latitude === "number" && typeof value.longitude === "number";
}

export async function resolveGoogleCityWithMeta(
  cityInput: string,
  selectedPlaceId?: string,
): Promise<PublicProviderResult<ResolvedGoogleCity>> {
  const apiKey = googlePlacesApiKey();
  const input = cityInput.trim();
  const cacheKey = publicCacheKey("google-city", `${input}|${selectedPlaceId ?? "auto"}`, "v1");
  const cached = await getPublicDataCache<ResolvedGoogleCity>(cacheKey);
  if (cached) return { value: cached, cached: true, providerCalls: 0 };
  const response = await fetchGooglePlaces(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.types",
      },
      body: JSON.stringify({ input, includedPrimaryTypes: ["(cities)"] }),
    },
    "autocomplete",
  );
  const payload = (await response.json()) as {
    suggestions?: Array<{
      placePrediction?: { placeId?: string; text?: { text?: string }; types?: string[] };
    }>;
  };
  const suggestions = (payload.suggestions ?? [])
    .map((item) => item.placePrediction)
    .filter((item): item is NonNullable<typeof item> & { placeId: string } => Boolean(item?.placeId))
    .map((item) => ({ placeId: item.placeId, label: item.text?.text?.trim() || input }))
    .slice(0, 5);

  if (!suggestions.length) {
    throw new GooglePlacesProviderError("autocomplete", 404, "CITY_NOT_FOUND", "The city could not be resolved.");
  }

  let selected = selectedPlaceId ? suggestions.find((item) => item.placeId === selectedPlaceId) : undefined;
  if (selectedPlaceId && !selected) {
    throw new GooglePlacesProviderError("autocomplete", 400, "INVALID_CITY_SELECTION", "The selected city is no longer valid.");
  }

  if (!selected) {
    if (suggestions.length > 1 && !input.includes(",")) {
      throw new GoogleCityAmbiguousError(suggestions);
    }
    selected = suggestions[0];
  }

  const detailsResponse = await fetchGooglePlaces(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(selected.placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location,viewport,types,addressComponents",
      },
    },
    "place_details",
  );
  const details = (await detailsResponse.json()) as {
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: unknown;
    viewport?: { low?: unknown; high?: unknown };
    types?: string[];
    addressComponents?: Array<{ longText?: string; types?: string[] }>;
  };

  if (!validPoint(details.location) || !validPoint(details.viewport?.low) || !validPoint(details.viewport?.high)) {
    throw new GooglePlacesProviderError("place_details", 422, "UNSUPPORTED_AREA", "The city boundary is unavailable.");
  }

  const cityTypes = new Set(["locality", "postal_town", "administrative_area_level_3"]);
  if (!(details.types ?? []).some((type) => cityTypes.has(type))) {
    throw new GooglePlacesProviderError("place_details", 422, "UNSUPPORTED_AREA", "The selected place is not a supported city.");
  }

  const city: ResolvedGoogleCity = {
    placeId: details.id ?? selected.placeId,
    name: details.displayName?.text?.trim() || input,
    label: details.formattedAddress?.trim() || selected.label,
    country: details.addressComponents?.find((part) => part.types?.includes("country"))?.longText,
    center: details.location,
    bounds: { southwest: details.viewport.low, northeast: details.viewport.high },
  };
  await setPublicDataCache(cacheKey, city, PUBLIC_DATA_FRESHNESS.cityResolutionMs);
  return { value: city, cached: false, providerCalls: 2 };
}

export async function resolveGoogleCity(cityInput: string, selectedPlaceId?: string): Promise<ResolvedGoogleCity> {
  return (await resolveGoogleCityWithMeta(cityInput, selectedPlaceId)).value;
}

const CITY_NEARBY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.types",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "places.location",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
].join(",");

export async function searchGooglePlacesNearbyWithMeta(
  includedTypes: string[],
  center: GoogleGeoPoint,
  radiusMeters: number,
): Promise<PublicProviderResult<GoogleNearbyPlace[]>> {
  const apiKey = googlePlacesApiKey();
  const normalizedTypes = [...new Set(includedTypes)].sort().slice(0, 50);
  const normalizedRadius = Math.min(Math.max(radiusMeters, 1), 50_000);
  const cacheKey = publicCacheKey(
    "google-nearby",
    `${normalizedTypes.join(",")}|${center.latitude.toFixed(5)},${center.longitude.toFixed(5)}|${Math.round(normalizedRadius)}`,
    "v1",
  );
  const cached = await getPublicDataCache<GoogleNearbyPlace[]>(cacheKey);
  if (cached) return { value: cached, cached: true, providerCalls: 0 };
  const response = await fetchGooglePlaces(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": CITY_NEARBY_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: normalizedTypes,
        maxResultCount: 20,
        rankPreference: "POPULARITY",
        locationRestriction: { circle: { center, radius: normalizedRadius } },
      }),
    },
    "nearby_search",
  );
  const payload = (await response.json()) as { places?: Array<Record<string, unknown>> };

  if (payload.places !== undefined && !Array.isArray(payload.places)) {
    throw new GooglePlacesProviderError("nearby_search", response.status, "INVALID_RESPONSE", "Google Places returned an unexpected result structure.");
  }

  const places = (payload.places ?? []).flatMap((place) => {
    const id = stringValue(place.id);
    const displayName = isRecord(place.displayName) ? stringValue(place.displayName.text) : undefined;
    if (!id || !displayName || !validPoint(place.location)) return [];

    return [{
      id,
      name: displayName,
      formattedAddress: stringValue(place.formattedAddress),
      nationalPhoneNumber: stringValue(place.nationalPhoneNumber),
      websiteUri: stringValue(place.websiteUri),
      types: Array.isArray(place.types) ? place.types.filter((type): type is string => typeof type === "string") : [],
      primaryType: stringValue(place.primaryType),
      primaryTypeDisplayName: isRecord(place.primaryTypeDisplayName) ? stringValue(place.primaryTypeDisplayName.text) : undefined,
      businessStatus: stringValue(place.businessStatus),
      location: place.location,
      googleMapsUri: stringValue(place.googleMapsUri),
      rating: typeof place.rating === "number" ? place.rating : undefined,
      userRatingCount: typeof place.userRatingCount === "number" ? place.userRatingCount : undefined,
      websiteFieldRequested: true as const,
    }];
  });
  await setPublicDataCache(cacheKey, places, PUBLIC_DATA_FRESHNESS.googlePlacesMs);
  return { value: places, cached: false, providerCalls: 1 };
}

export async function searchGooglePlacesNearby(
  includedTypes: string[],
  center: GoogleGeoPoint,
  radiusMeters: number,
): Promise<GoogleNearbyPlace[]> {
  return (await searchGooglePlacesNearbyWithMeta(includedTypes, center, radiusMeters)).value;
}

export async function scrapeGoogleMapsWithMeta(
  query: string,
  location: string,
  numResults: number,
): Promise<PublicProviderResult<Lead[]>> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  const safeNumResults = Math.min(
    Math.max(Math.floor(numResults), 1),
    WORKLOAD_LIMITS.nicheSearch.maxRequestedLeads,
  );
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

  const cacheKey = publicCacheKey("google-text-search", `${query.trim()}|${location.trim()}|${safeNumResults}`, "v2");
  const cached = await getPublicDataCache<Lead[]>(cacheKey);
  if (cached) {
    const now = new Date().toISOString();
    return { value: cached.map((lead) => ({ ...lead, scraped_at: now })), cached: true, providerCalls: 0 };
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
  let providerCalls = 0;

  while (
    places.length < safeNumResults &&
    providerCalls < WORKLOAD_LIMITS.nicheSearch.maxPlacesPages
  ) {
    if (pageToken) {
      await sleep(GOOGLE_PLACES_PAGE_DELAY_MS);
    }

    providerCalls += 1;
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

  const leads = places.slice(0, safeNumResults).map(
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
  await setPublicDataCache(
    cacheKey,
    leads.map(({ scraped_at: _scrapedAt, ...lead }) => lead as Lead),
    PUBLIC_DATA_FRESHNESS.googlePlacesMs,
  );
  return { value: leads, cached: false, providerCalls };
}

export async function scrapeGoogleMaps(query: string, location: string, numResults: number): Promise<Lead[]> {
  return (await scrapeGoogleMapsWithMeta(query, location, numResults)).value;
}

export async function scrapeDirectory(url: string): Promise<Lead[]> {
  const response = await extractWithSgai(url, DIRECTORY_PROMPT);

  return getLeadItems(response).map((item) => normalizeLead(item, "directory", url));
}

export async function scrapeMultiple(urls: string[]): Promise<Lead[]> {
  const results = await Promise.allSettled(urls.map((url) => scrapeWebsite(url)));

  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}
