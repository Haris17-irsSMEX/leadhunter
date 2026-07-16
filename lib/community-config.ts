export type CommunityConfig = {
  communitiesEnabled: boolean;
  hackerNewsEnabled: boolean;
  redditEnabled: boolean;
  indieHackersEnabled: boolean;
  productHuntEnabled: boolean;
  redditUserAgent: string;
  maxResults: number;
  requestTimeoutMs: number;
  concurrency: number;
};

function envBoolean(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value == null || value.trim() === "") {
    return fallback;
  }

  return value.trim().toLowerCase() === "true";
}

function envNumber(name: string, fallback: number, options: { min: number; max: number }) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(parsed), options.min), options.max);
}

export function getCommunityConfig(): CommunityConfig {
  return {
    communitiesEnabled: envBoolean("COMMUNITIES_ENABLED", false),
    hackerNewsEnabled: envBoolean("HACKERNEWS_ENABLED", true),
    redditEnabled: envBoolean("REDDIT_ENABLED", true),
    indieHackersEnabled: envBoolean("INDIEHACKERS_ENABLED", false),
    productHuntEnabled: envBoolean("PRODUCTHUNT_ENABLED", false),
    redditUserAgent: process.env.REDDIT_USER_AGENT?.trim() || "LeadHunter/1.0",
    maxResults: envNumber("COMMUNITIES_MAX_RESULTS", 20, { min: 1, max: 50 }),
    requestTimeoutMs: envNumber("COMMUNITIES_REQUEST_TIMEOUT_MS", 15000, { min: 1000, max: 60000 }),
    concurrency: envNumber("COMMUNITIES_CONCURRENCY", 5, { min: 1, max: 20 }),
  };
}

export function clampCommunityLimit(value: unknown, maxResults: number) {
  const parsed = Number(value);
  const requested = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : maxResults;
  return Math.min(Math.max(requested, 1), Math.min(maxResults, 50));
}
