import "server-only";

import type { DeliveryPlatformId, DeliveryPlatformStatus } from "@/lib/types";

export type PlatformPresenceResult = {
  status: DeliveryPlatformStatus;
  menuUrl?: string;
  confidence?: number;
  matchedTitle?: string;
  matchedSnippet?: string;
};

export type DeliveryPresenceResult = {
  results: Record<DeliveryPlatformId, PlatformPresenceResult>;
  ubereats: PlatformPresenceResult;
  doordash: PlatformPresenceResult;
  grubhub: PlatformPresenceResult;
  deliveroo: PlatformPresenceResult;
  justeat: PlatformPresenceResult;
  warnings: string[];
};

type DeliverySearchProvider = "serper" | "google_cse";

type SearchItem = {
  title?: string;
  link?: string;
  snippet?: string;
};

type SearchResponse = {
  items?: SearchItem[];
  error?: {
    message?: string;
  };
};

type SerperResponse = {
  organic?: SearchItem[];
  message?: string;
};

type PlatformCheckResult = {
  result: PlatformPresenceResult;
  warning?: string;
};

type ProviderConfig =
  | {
      provider: DeliverySearchProvider;
      configured: true;
      apiKey: string;
      cx?: string;
    }
  | {
      provider?: DeliverySearchProvider;
      configured: false;
      warning: string;
    };

type PlatformConfig = {
  id: DeliveryPlatformId;
  label: string;
  domains: string[];
  siteQuery: string;
};

export const DELIVERY_PLATFORM_IDS: DeliveryPlatformId[] = ["ubereats", "doordash", "grubhub", "deliveroo", "justeat"];

export const DELIVERY_PLATFORM_CONFIGS: Record<DeliveryPlatformId, PlatformConfig> = {
  ubereats: {
    id: "ubereats",
    label: "Uber Eats",
    domains: ["ubereats.com", "www.ubereats.com"],
    siteQuery: "site:ubereats.com/store",
  },
  doordash: {
    id: "doordash",
    label: "DoorDash",
    domains: ["doordash.com", "www.doordash.com"],
    siteQuery: "site:doordash.com/store",
  },
  grubhub: {
    id: "grubhub",
    label: "Grubhub",
    domains: ["grubhub.com", "www.grubhub.com"],
    siteQuery: "site:grubhub.com/restaurant",
  },
  deliveroo: {
    id: "deliveroo",
    label: "Deliveroo",
    domains: ["deliveroo.co.uk", "www.deliveroo.co.uk", "deliveroo.com", "www.deliveroo.com"],
    siteQuery: "site:deliveroo.co.uk/menu",
  },
  justeat: {
    id: "justeat",
    label: "Just Eat",
    domains: ["just-eat.co.uk", "www.just-eat.co.uk", "justeat.com", "www.justeat.com"],
    siteQuery: "site:just-eat.co.uk/restaurants",
  },
};

const REQUEST_TIMEOUT_MS = 10_000;
const NOT_CHECKED: PlatformPresenceResult = { status: "not_checked" };
const RATE_LIMIT_WARNING = "Delivery search provider limit reached. Some platform checks were not completed.";

class SearchProviderError extends Error {
  constructor(
    message: string,
    readonly warning: string,
  ) {
    super(message);
    this.name = "SearchProviderError";
  }
}

function providerConfig(): ProviderConfig {
  const requestedProvider = process.env.DELIVERY_SEARCH_PROVIDER?.trim().toLowerCase();
  const serperApiKey = process.env.SERPER_API_KEY?.trim();
  const googleApiKey = process.env.GOOGLE_CSE_API_KEY?.trim();
  const googleCx = process.env.GOOGLE_CSE_CX?.trim();

  if (requestedProvider === "serper") {
    if (!serperApiKey) {
      return { provider: "serper", configured: false, warning: "Serper API key is missing." };
    }

    return { provider: "serper", configured: true, apiKey: serperApiKey };
  }

  if (requestedProvider === "google_cse") {
    if (!googleApiKey || !googleCx) {
      return { provider: "google_cse", configured: false, warning: "Delivery-platform search is not configured." };
    }

    return { provider: "google_cse", configured: true, apiKey: googleApiKey, cx: googleCx };
  }

  if (serperApiKey) {
    return { provider: "serper", configured: true, apiKey: serperApiKey };
  }

  if (googleApiKey && googleCx) {
    return { provider: "google_cse", configured: true, apiKey: googleApiKey, cx: googleCx };
  }

  return { configured: false, warning: "Delivery-platform search is not configured." };
}

function deliverySearchDelayMs() {
  const configured = Number(process.env.DELIVERY_SEARCH_DELAY_MS ?? 300);
  return Number.isFinite(configured) ? Math.min(Math.max(Math.floor(configured), 0), 5000) : 300;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value?: string) {
  return (
    value
      ?.toLowerCase()
      .replace(/\b(ltd|llc|inc|co|corp|corporation|restaurant|cafe|bar|grill)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

function cityFromLocation(location?: string) {
  return location
    ?.split(",")
    .map((part) => part.trim())
    .find((part) => part.length > 1);
}

function isPlatformUrl(platform: DeliveryPlatformId, link?: string) {
  if (!link) {
    return false;
  }

  try {
    const hostname = new URL(link).hostname.replace(/^www\./i, "").toLowerCase();
    return DELIVERY_PLATFORM_CONFIGS[platform].domains.some((domain) => {
      const normalizedDomain = domain.replace(/^www\./i, "").toLowerCase();
      return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
    });
  } catch {
    return false;
  }
}

function tokenOverlapScore(target: string, candidate: string) {
  const targetTokens = new Set(normalizeText(target).split(" ").filter((token) => token.length > 2));
  const candidateTokens = new Set(normalizeText(candidate).split(" ").filter((token) => token.length > 2));

  if (!targetTokens.size || !candidateTokens.size) {
    return 0;
  }

  const overlap = [...targetTokens].filter((token) => candidateTokens.has(token)).length;
  return overlap / targetTokens.size;
}

function scoreItem(platform: DeliveryPlatformId, item: SearchItem, restaurantName: string, city?: string) {
  const haystack = `${item.title ?? ""} ${item.snippet ?? ""} ${item.link ?? ""}`;
  let score = isPlatformUrl(platform, item.link) ? 40 : 0;
  score += Math.round(tokenOverlapScore(restaurantName, haystack) * 35);

  if (city && normalizeText(haystack).includes(normalizeText(city))) {
    score += 15;
  }

  if (normalizeText(haystack).includes(normalizeText(DELIVERY_PLATFORM_CONFIGS[platform].label))) {
    score += 10;
  }

  return Math.min(100, score);
}

async function googleSearch(query: string, apiKey: string, cx: string) {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", query);
  url.searchParams.set("num", "5");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = (await response.json()) as SearchResponse;

    if (!response.ok) {
      const message = payload.error?.message ?? `Google CSE request failed with status ${response.status}`;
      if (response.status === 403 || message.toLowerCase().includes("permission_denied")) {
        throw new SearchProviderError(message, "Google Custom Search API denied access. Use Serper or another search provider.");
      }

      if (response.status === 429) {
        throw new SearchProviderError(message, RATE_LIMIT_WARNING);
      }

      throw new SearchProviderError(message, `Google CSE request failed with status ${response.status}.`);
    }

    return payload.items ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

async function serperSearch(query: string, apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({ q: query, num: 5 }),
      signal: controller.signal,
    });
    const payload = (await response.json()) as SerperResponse;

    if (!response.ok) {
      const message = payload.message ?? `Serper request failed with status ${response.status}`;
      if (response.status === 401 || response.status === 403) {
        throw new SearchProviderError(message, "Serper API key invalid or unauthorized.");
      }

      if (response.status === 429) {
        throw new SearchProviderError(message, RATE_LIMIT_WARNING);
      }

      throw new SearchProviderError(message, `Serper request failed with status ${response.status}.`);
    }

    return payload.organic ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

async function providerSearch(query: string, config: Extract<ProviderConfig, { configured: true }>) {
  if (config.provider === "serper") {
    return serperSearch(query, config.apiKey);
  }

  return googleSearch(query, config.apiKey, config.cx ?? "");
}

async function checkPlatform(
  platform: DeliveryPlatformId,
  restaurantName: string,
  location: string | undefined,
  provider: Extract<ProviderConfig, { configured: true }>,
): Promise<PlatformCheckResult> {
  const city = cityFromLocation(location);
  const platformDetails = DELIVERY_PLATFORM_CONFIGS[platform];
  const cityPart = city ? ` "${city}"` : "";
  const queries = [
    `${platformDetails.siteQuery} "${restaurantName}"${cityPart}`,
    `"${restaurantName}"${cityPart} "${platformDetails.label}"`,
  ];

  try {
    const results: SearchItem[] = [];
    const delayMs = deliverySearchDelayMs();

    for (const query of queries) {
      if (results.length && delayMs > 0) {
        await sleep(delayMs);
      }

      results.push(...(await providerSearch(query, provider)));
    }
    const best = results
      .map((item) => ({ item, confidence: scoreItem(platform, item, restaurantName, city) }))
      .filter(({ item }) => isPlatformUrl(platform, item.link))
      .sort((left, right) => right.confidence - left.confidence)[0];

    if (!best) {
      return { result: { status: "not_found", confidence: 0 } };
    }

    const status = best.confidence >= 75 ? "found" : best.confidence >= 50 ? "unclear" : "not_found";

    return {
      result: {
        status,
        menuUrl: status === "not_found" ? undefined : best.item.link,
        confidence: best.confidence,
        matchedTitle: best.item.title,
        matchedSnippet: best.item.snippet,
      },
    };
  } catch (error) {
    const isSearchProviderError = error instanceof SearchProviderError;
    const warning = isSearchProviderError ? error.warning : "Delivery-platform search provider failed.";
    const message = isSearchProviderError ? warning : error instanceof Error ? error.message.slice(0, 180) : "Search provider request failed";
    return {
      result: {
        status: "error",
        confidence: 0,
        matchedSnippet: message,
      },
      warning,
    };
  }
}

function emptyResults() {
  return DELIVERY_PLATFORM_IDS.reduce(
    (results, platform) => ({
      ...results,
      [platform]: NOT_CHECKED,
    }),
    {} as Record<DeliveryPlatformId, PlatformPresenceResult>,
  );
}

function normalizeSelectedPlatforms(platforms?: DeliveryPlatformId[]) {
  return [...new Set((platforms ?? []).filter((platform) => DELIVERY_PLATFORM_IDS.includes(platform)))];
}

export async function checkDeliveryPlatforms(
  restaurantName: string,
  location?: string,
  platforms?: DeliveryPlatformId[],
): Promise<DeliveryPresenceResult> {
  const selectedPlatforms = normalizeSelectedPlatforms(platforms);
  const initialResults = emptyResults();

  if (!selectedPlatforms.length) {
    return {
      results: initialResults,
      ubereats: initialResults.ubereats,
      doordash: initialResults.doordash,
      grubhub: initialResults.grubhub,
      deliveroo: initialResults.deliveroo,
      justeat: initialResults.justeat,
      warnings: [],
    };
  }

  const config = providerConfig();

  if (!config.configured) {
    return {
      results: initialResults,
      ubereats: initialResults.ubereats,
      doordash: initialResults.doordash,
      grubhub: initialResults.grubhub,
      deliveroo: initialResults.deliveroo,
      justeat: initialResults.justeat,
      warnings: [config.warning],
    };
  }

  const results = { ...initialResults };
  const warnings: string[] = [];

  for (const platform of selectedPlatforms) {
    const check = await checkPlatform(platform, restaurantName, location, config);
    results[platform] = check.result;
    if (check.warning) {
      warnings.push(check.warning);
    }

    if (check.warning === RATE_LIMIT_WARNING) {
      break;
    }
  }

  return {
    results,
    ubereats: results.ubereats,
    doordash: results.doordash,
    grubhub: results.grubhub,
    deliveroo: results.deliveroo,
    justeat: results.justeat,
    warnings: [...new Set(warnings)],
  };
}
