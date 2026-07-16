import { scoreCommunityIntent } from "@/lib/community-intent";
import type { CommunityConfig } from "@/lib/community-config";
import { extractWithSgai } from "@/lib/sgai";
import type { Lead } from "@/lib/types";

export type HackerNewsMode = "show_hn" | "ask_hn" | "jobs" | "who_is_hiring";
export type RedditMode = "subreddit" | "search";
export type IndieHackersMode = "products";
export type ProductHuntMode = "front_page";

type ScrapeResult = {
  leads: Lead[];
  errors: string[];
};

type HnItem = {
  id: number;
  deleted?: boolean;
  dead?: boolean;
  type?: string;
  by?: string;
  time?: number;
  text?: string;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  kids?: number[];
};

type AlgoliaHit = {
  objectID?: string;
  title?: string;
  story_title?: string;
};

type RedditPost = {
  id?: string;
  author?: string;
  title?: string;
  selftext?: string;
  subreddit?: string;
  permalink?: string;
  url?: string;
  created_utc?: number;
  score?: number;
  num_comments?: number;
};

type IndieHackersProduct = {
  product_name?: string;
  name?: string;
  founder_name?: string;
  founder?: string;
  website?: string;
  website_url?: string;
  url?: string;
  product_url?: string;
  indie_hackers_url?: string;
  profile_url?: string;
  description?: string;
  monthly_revenue?: string;
  mrr?: string;
  revenue?: string;
  twitter_handle?: string;
  twitter?: string;
  x_handle?: string;
  email?: string;
  category?: string;
  tags?: string[] | string;
};

type ProductHuntProduct = {
  product_name?: string;
  name?: string;
  tagline?: string;
  description?: string;
  founder_name?: string;
  maker_name?: string;
  maker?: string;
  website?: string;
  website_url?: string;
  product_url?: string;
  product_hunt_url?: string;
  url?: string;
  upvotes?: string;
  upvote_count?: string;
  launch_date?: string;
  date?: string;
  category?: string;
  tags?: string[] | string;
  twitter_handle?: string;
  twitter?: string;
  x_handle?: string;
  email?: string;
};

const HN_BASE = "https://hacker-news.firebaseio.com/v0";
const INDIE_HACKERS_PRODUCTS_URL = "https://www.indiehackers.com/products";
const PRODUCT_HUNT_FRONT_PAGE_URL = "https://www.producthunt.com/";
const HN_FEEDS: Record<Exclude<HackerNewsMode, "who_is_hiring">, string> = {
  show_hn: "showstories",
  ask_hn: "askstories",
  jobs: "jobstories",
};

const INDIE_HACKERS_PRODUCTS_PROMPT = `
Extract public Indie Hackers product listings from this page.
For each listing, return:
- product name
- founder name if visible
- product website URL if visible
- Indie Hackers product/profile URL if visible
- description
- monthly revenue/MRR if visible
- founder Twitter/X handle if visible
- founder email only if visibly public on the page
- category/tags if visible

Return structured JSON only as { "products": [...] }. Do not invent missing values.
`;

const PRODUCT_HUNT_FRONT_PAGE_PROMPT = `
Extract public Product Hunt product listings from this page.
For each product, return:
- product name
- tagline or short description
- maker/founder name if visible
- product website URL if visible
- Product Hunt product URL if visible
- upvote count if visible
- launch date if visible
- category/tags if visible
- maker Twitter/X handle only if visibly public
- maker email only if visibly public

Return structured JSON only as { "products": [...] }. Do not invent missing values.
`;

type JsonRecord = Record<string, unknown>;

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

function formatRedditError(error: unknown) {
  const message = error instanceof Error ? error.message : "request failed";

  if (message.startsWith("403")) {
    return "Reddit blocked the public request. Reddit OAuth is required for reliable access.";
  }

  return `Reddit request failed: ${message}`;
}

function htmlToText(value?: string) {
  if (!value) {
    return "";
  }

  return value
    .replace(/<p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function matchesQuery(item: HnItem, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [item.title, item.text, item.url].map((value) => htmlToText(value)).join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function cleanHnTitle(title?: string) {
  return htmlToText(title).replace(/^(show hn|ask hn):\s*/i, "").trim();
}

function firstMeaningfulLine(text: string) {
  return (
    text
      .split(/\n|\.| - |\|/)
      .map((line) => line.trim())
      .find((line) => line.length >= 3) ?? ""
  );
}

function postedAtFromUnix(seconds?: number) {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : undefined;
}

async function fetchJson<T>(url: string, timeoutMs: number, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`.trim());
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function allSettledWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function hnItemUrl(id: number) {
  return `https://news.ycombinator.com/item?id=${id}`;
}

function mapHnStoryToLead(item: HnItem, mode: HackerNewsMode): Lead | null {
  if (item.deleted || item.dead || !item.id) {
    return null;
  }

  const title = cleanHnTitle(item.title);
  const text = htmlToText(item.text);
  const posted_at = postedAtFromUnix(item.time);
  const description = truncate(text || title, 300);
  const intent = scoreCommunityIntent({
    text: [title, text].join(" "),
    mode,
    source: "hackernews",
    postedAt: posted_at,
    hasExternalUrl: Boolean(item.url),
    engagement: (item.score ?? 0) + (item.descendants ?? 0),
  });

  return {
    company_name: title || "Hacker News Lead",
    website: item.url,
    description,
    founder_name: item.by,
    location: "Hacker News",
    industry: "Tech / SaaS",
    source: "hackernews",
    source_external_id: String(item.id),
    source_url: hnItemUrl(item.id),
    user_id: "default",
    posted_at,
    author_handle: item.by,
    community_name: "Hacker News",
    signal_type: intent.signal_type,
    intent_score: intent.intent_score,
    intent_reason: intent.intent_reason,
    raw_metadata: {
      id: item.id,
      by: item.by,
      score: item.score,
      descendants: item.descendants,
      type: item.type,
      url: item.url,
      sourceMode: mode,
    },
    scraped_at: new Date().toISOString(),
  };
}

function mapHnHiringCommentToLead(item: HnItem, storyId: number, mode: HackerNewsMode): Lead | null {
  if (item.deleted || item.dead || !item.id || !item.text) {
    return null;
  }

  const text = htmlToText(item.text);
  if (!text) {
    return null;
  }

  const posted_at = postedAtFromUnix(item.time);
  const companyName = truncate(firstMeaningfulLine(text) || "HN Hiring Lead", 100);
  const intent = scoreCommunityIntent({
    text,
    mode,
    source: "hackernews",
    postedAt: posted_at,
    engagement: 1,
  });

  return {
    company_name: companyName,
    description: truncate(text, 300),
    founder_name: item.by,
    location: "Hacker News",
    industry: "Tech / SaaS",
    source: "hackernews",
    source_external_id: String(item.id),
    source_url: hnItemUrl(item.id),
    user_id: "default",
    posted_at,
    author_handle: item.by,
    community_name: "Hacker News",
    signal_type: intent.signal_type,
    intent_score: intent.intent_score,
    intent_reason: intent.intent_reason,
    raw_metadata: {
      id: item.id,
      by: item.by,
      type: item.type,
      parentStoryId: storyId,
      sourceMode: mode,
    },
    scraped_at: new Date().toISOString(),
  };
}

async function fetchHnItem(id: number, config: CommunityConfig) {
  return fetchJson<HnItem | null>(`${HN_BASE}/item/${id}.json`, config.requestTimeoutMs);
}

export async function scrapeHackerNews(mode: HackerNewsMode, query: string, limit: number, config: CommunityConfig): Promise<ScrapeResult> {
  const errors: string[] = [];

  if (mode === "who_is_hiring") {
    return scrapeHnWhoIsHiring(query, limit, config);
  }

  const feed = HN_FEEDS[mode];
  let ids: number[];

  try {
    ids = await fetchJson<number[]>(`${HN_BASE}/${feed}.json`, config.requestTimeoutMs);
  } catch (error) {
    return {
      leads: [],
      errors: [`Failed to fetch HN ${mode} feed: ${error instanceof Error ? error.message : "request failed"}`],
    };
  }

  const fetchLimit = query ? Math.min(ids.length, limit * 3) : Math.min(ids.length, limit);
  const itemIds = ids.slice(0, fetchLimit);
  const settled = await allSettledWithConcurrency(itemIds, config.concurrency, async (id) => fetchHnItem(id, config));
  const leads: Lead[] = [];

  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      errors.push(`Failed to fetch HN item ${itemIds[index]}`);
      return;
    }

    const item = result.value;
    if (!item || !matchesQuery(item, query)) {
      return;
    }

    const lead = mapHnStoryToLead(item, mode);
    if (lead && leads.length < limit) {
      leads.push(lead);
    }
  });

  return { leads, errors };
}

async function scrapeHnWhoIsHiring(query: string, limit: number, config: CommunityConfig): Promise<ScrapeResult> {
  const errors: string[] = [];
  const algoliaUrl = "https://hn.algolia.com/api/v1/search_by_date?query=who%20is%20hiring&tags=story";
  let response: { hits?: AlgoliaHit[] };

  try {
    response = await fetchJson<{ hits?: AlgoliaHit[] }>(algoliaUrl, config.requestTimeoutMs);
  } catch (error) {
    return {
      leads: [],
      errors: [`Failed to fetch HN Who is Hiring search: ${error instanceof Error ? error.message : "request failed"}`],
    };
  }

  const hit = response.hits?.find((item) => /who is hiring/i.test(item.title ?? item.story_title ?? ""));
  const storyId = Number(hit?.objectID);

  if (!Number.isFinite(storyId)) {
    return { leads: [], errors: ["Unable to find a recent HN Who is Hiring story"] };
  }

  let story: HnItem | null;

  try {
    story = await fetchHnItem(storyId, config);
  } catch (error) {
    return {
      leads: [],
      errors: [`Failed to fetch HN item ${storyId}: ${error instanceof Error ? error.message : "request failed"}`],
    };
  }

  const commentIds = story?.kids?.slice(0, Math.max(limit * 2, limit)) ?? [];
  const settled = await allSettledWithConcurrency(commentIds, config.concurrency, async (id) => fetchHnItem(id, config));
  const leads: Lead[] = [];

  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      errors.push(`Failed to fetch HN item ${commentIds[index]}`);
      return;
    }

    const item = result.value;
    if (!item || !matchesQuery(item, query)) {
      return;
    }

    const lead = mapHnHiringCommentToLead(item, storyId, "who_is_hiring");
    if (lead && leads.length < limit) {
      leads.push(lead);
    }
  });

  return { leads, errors };
}

function normalizeSubreddit(value: string) {
  return value.trim().replace(/^\/?r\//i, "").replace(/[^A-Za-z0-9_]/g, "");
}

function isExternalRedditUrl(value?: string) {
  if (!value || !/^https?:\/\//i.test(value)) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return !hostname.endsWith("reddit.com") && !hostname.endsWith("redd.it");
  } catch {
    return false;
  }
}

function extractProjectName(title: string) {
  const quoted = title.match(/["']([^"']{3,80})["']/);
  if (quoted?.[1]) {
    return quoted[1].trim();
  }

  const named = title.match(/\b(?:called|named|building|launched|launching)\s+([A-Z][A-Za-z0-9.-]*(?:\s+[A-Z][A-Za-z0-9.-]*){0,2})/);
  return named?.[1]?.trim();
}

function mapRedditPostToLead(post: RedditPost, mode: RedditMode): Lead | null {
  if (!post.id || !post.title) {
    return null;
  }

  const author = post.author && post.author !== "[deleted]" ? post.author : undefined;
  const subreddit = post.subreddit ?? "unknown";
  const posted_at = postedAtFromUnix(post.created_utc);
  const externalUrl = isExternalRedditUrl(post.url) ? post.url : undefined;
  const title = htmlToText(post.title);
  const selftext = htmlToText(post.selftext);
  const description = truncate([title, selftext].filter(Boolean).join(" - "), 300);
  const intent = scoreCommunityIntent({
    text: [title, selftext].join(" "),
    mode,
    source: "reddit",
    postedAt: posted_at,
    hasExternalUrl: Boolean(externalUrl),
    engagement: (post.score ?? 0) + (post.num_comments ?? 0),
  });

  return {
    company_name: extractProjectName(title) ?? (author ? `u/${author}` : truncate(title, 100)),
    website: externalUrl,
    description,
    location: `Reddit - r/${subreddit}`,
    industry: subreddit,
    source: "reddit",
    source_external_id: post.id,
    source_url: post.permalink ? `https://reddit.com${post.permalink}` : `https://reddit.com/comments/${post.id}`,
    user_id: "default",
    posted_at,
    author_handle: author,
    community_name: `Reddit - r/${subreddit}`,
    signal_type: intent.signal_type,
    intent_score: intent.intent_score,
    intent_reason: intent.intent_reason,
    raw_metadata: {
      id: post.id,
      author,
      subreddit,
      score: post.score,
      num_comments: post.num_comments,
      permalink: post.permalink,
      url: post.url,
      mode,
    },
    scraped_at: new Date().toISOString(),
  };
}

export async function scrapeReddit(mode: RedditMode, query: string, limit: number, config: CommunityConfig): Promise<ScrapeResult> {
  const path =
    mode === "subreddit"
      ? `https://www.reddit.com/r/${encodeURIComponent(normalizeSubreddit(query))}/new.json?limit=${limit}`
      : `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=${limit}`;

  let response: { data?: { children?: Array<{ data?: RedditPost }> } };

  try {
    response = await fetchJson<{ data?: { children?: Array<{ data?: RedditPost }> } }>(path, config.requestTimeoutMs, {
      headers: {
        "User-Agent": config.redditUserAgent,
      },
    });
  } catch (error) {
    return {
      leads: [],
      errors: [formatRedditError(error)],
    };
  }

  const posts = response.data?.children?.map((child) => child.data).filter((post): post is RedditPost => Boolean(post)) ?? [];
  return {
    leads: posts.map((post) => mapRedditPostToLead(post, mode)).filter((lead): lead is Lead => Boolean(lead)).slice(0, limit),
    errors: [],
  };
}

function getExtractionResult(response: unknown) {
  if (isRecord(response) && "result" in response) {
    return response.result;
  }

  return response;
}

function getIndieHackersItems(response: unknown) {
  const result = getExtractionResult(response);

  if (Array.isArray(result)) {
    return result;
  }

  if (isRecord(result)) {
    for (const key of ["products", "results", "listings", "items"]) {
      if (Array.isArray(result[key])) {
        return result[key];
      }
    }

    return [result];
  }

  if (isRecord(response) && Array.isArray(response.products)) {
    return response.products;
  }

  return [];
}

function getProductHuntItems(response: unknown) {
  const result = getExtractionResult(response);

  if (Array.isArray(result)) {
    return result;
  }

  if (isRecord(result)) {
    for (const key of ["products", "results", "listings", "items", "posts"]) {
      if (Array.isArray(result[key])) {
        return result[key];
      }
    }

    return [result];
  }

  if (isRecord(response) && Array.isArray(response.products)) {
    return response.products;
  }

  return [];
}

function normalizeUrl(value?: string, baseUrl = INDIE_HACKERS_PRODUCTS_URL) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function normalizeTwitterHandle(value?: string) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const handle = url.pathname.split("/").filter(Boolean)[0];
      return handle ? `@${handle.replace(/^@/, "")}` : undefined;
    } catch {
      return undefined;
    }
  }

  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) {
    const tags = value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item));
    return tags.length ? tags.join(", ") : undefined;
  }

  return stringValue(value);
}

function stableIndieHackersKey(productName: string, founderName?: string, website?: string, sourceUrl?: string) {
  const urlKey = sourceUrl ?? website;
  if (urlKey) {
    try {
      const url = new URL(urlKey);
      return url.hostname.toLowerCase() + url.pathname.replace(/\/$/, "").toLowerCase();
    } catch {
      return urlKey.toLowerCase();
    }
  }

  return [productName, founderName]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stableProductHuntKey(productName: string, makerName?: string, website?: string, sourceUrl?: string) {
  const urlKey = sourceUrl ?? website;
  if (urlKey) {
    try {
      const url = new URL(urlKey);
      return url.hostname.toLowerCase() + url.pathname.replace(/\/$/, "").toLowerCase();
    } catch {
      return urlKey.toLowerCase();
    }
  }

  return [productName, makerName]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseVisibleDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function mapIndieHackersProductToLead(value: unknown, mode: IndieHackersMode): Lead | null {
  if (!isRecord(value)) {
    return null;
  }

  const productName = firstString(value, ["product_name", "name", "company_name", "title"]);
  if (!productName) {
    return null;
  }

  const founderName = firstString(value, ["founder_name", "founder", "maker", "creator"]);
  const website = normalizeUrl(firstString(value, ["website", "website_url", "product_website", "external_url"]));
  const visibleSourceUrl = normalizeUrl(firstString(value, ["indie_hackers_url", "product_url", "profile_url", "source_url", "url"]));
  const sourceUrl = visibleSourceUrl ?? INDIE_HACKERS_PRODUCTS_URL;
  const description = truncate(firstString(value, ["description", "summary", "tagline", "about"]) ?? productName, 300);
  const revenue = firstString(value, ["monthly_revenue", "mrr", "revenue", "pricing_model"]);
  const category = firstString(value, ["category", "industry"]) ?? normalizeTags(value.tags);
  const twitter = normalizeTwitterHandle(firstString(value, ["twitter_handle", "twitter", "x_handle", "x_url"]));
  const email = firstString(value, ["email", "founder_email", "contact_email"]);
  const text = [productName, founderName, description, category, revenue, website, twitter, email].filter(Boolean).join(" ");
  const intent = scoreCommunityIntent({
    text,
    mode,
    source: "indiehackers",
    hasExternalUrl: Boolean(website),
    engagement: [productName, founderName, description, revenue, twitter, email].filter(Boolean).length,
  });
  let intentScore = intent.intent_score;
  const reasons = intent.intent_reason === "no strong intent signals detected" ? [] : [intent.intent_reason];

  if (productName || founderName) {
    intentScore += 20;
    reasons.push("product or founder visible");
  }
  if (revenue) {
    intentScore += 20;
    reasons.push("revenue signal visible");
  }
  if (twitter || email) {
    intentScore += 10;
    reasons.push("public contact or social visible");
  }
  if (description && description !== productName) {
    intentScore += 10;
    reasons.push("product description visible");
  }

  return {
    company_name: productName,
    website,
    description,
    founder_name: founderName,
    email,
    twitter_handle: twitter,
    location: "Indie Hackers",
    industry: category ?? "SaaS / Indie Product",
    pricing_model: revenue,
    source: "indiehackers",
    source_external_id: stableIndieHackersKey(productName, founderName, website, visibleSourceUrl),
    source_url: sourceUrl,
    user_id: "default",
    community_name: "Indie Hackers",
    signal_type: website || revenue ? "recently_launched" : "general_discussion",
    intent_score: Math.min(intentScore, 100),
    intent_reason: reasons.length ? reasons.join("; ") : "public Indie Hackers product listing",
    raw_metadata: {
      ...value,
      sourceMode: mode,
    },
    scraped_at: new Date().toISOString(),
  };
}

function matchesIndieHackersQuery(lead: Lead, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    lead.company_name,
    lead.founder_name,
    lead.description,
    lead.industry,
    lead.website,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export async function scrapeIndieHackers(
  mode: IndieHackersMode,
  query: string,
  limit: number,
  _config: CommunityConfig,
): Promise<ScrapeResult> {
  if (mode !== "products") {
    return { leads: [], errors: ["Invalid Indie Hackers mode."] };
  }

  try {
    const response = await extractWithSgai(INDIE_HACKERS_PRODUCTS_URL, INDIE_HACKERS_PRODUCTS_PROMPT);
    const leads = getIndieHackersItems(response)
      .map((item) => mapIndieHackersProductToLead(item, mode))
      .filter((lead): lead is Lead => Boolean(lead))
      .filter((lead) => matchesIndieHackersQuery(lead, query))
      .slice(0, limit);

    return { leads, errors: [] };
  } catch {
    return {
      leads: [],
      errors: ["Indie Hackers scraping uses ScrapeGraphAI. Check your SGAI_API_KEY and credits."],
    };
  }
}

function mapProductHuntProductToLead(value: unknown, mode: ProductHuntMode): Lead | null {
  if (!isRecord(value)) {
    return null;
  }

  const productName = firstString(value, ["product_name", "name", "company_name", "title"]);
  if (!productName) {
    return null;
  }

  const makerName = firstString(value, ["maker_name", "founder_name", "maker", "founder", "creator"]);
  const website = normalizeUrl(firstString(value, ["website", "website_url", "product_website", "external_url"]), PRODUCT_HUNT_FRONT_PAGE_URL);
  const visibleSourceUrl = normalizeUrl(
    firstString(value, ["product_hunt_url", "product_url", "source_url", "url"]),
    PRODUCT_HUNT_FRONT_PAGE_URL,
  );
  const sourceUrl = visibleSourceUrl ?? PRODUCT_HUNT_FRONT_PAGE_URL;
  const description = truncate(firstString(value, ["tagline", "description", "summary", "about"]) ?? productName, 300);
  const category = firstString(value, ["category", "industry"]) ?? normalizeTags(value.tags);
  const upvotes = firstString(value, ["upvotes", "upvote_count", "votes"]);
  const launchDate = firstString(value, ["launch_date", "date", "posted_at"]);
  const twitter = normalizeTwitterHandle(firstString(value, ["twitter_handle", "twitter", "x_handle", "x_url"]));
  const email = firstString(value, ["email", "maker_email", "founder_email", "contact_email"]);
  const posted_at = parseVisibleDate(launchDate);
  const text = [productName, makerName, description, category, upvotes, launchDate, website, twitter, email].filter(Boolean).join(" ");
  const intent = scoreCommunityIntent({
    text,
    mode,
    source: "producthunt",
    postedAt: posted_at,
    hasExternalUrl: Boolean(website),
    engagement: upvotes ? 1 : 0,
  });
  let intentScore = intent.intent_score;
  const reasons = intent.intent_reason === "no strong intent signals detected" ? [] : [intent.intent_reason];

  if (productName) {
    intentScore += 20;
    reasons.push("product visible");
  }
  if (makerName) {
    intentScore += 10;
    reasons.push("maker visible");
  }
  if (upvotes) {
    intentScore += 10;
    reasons.push("upvote signal visible");
  }
  if (launchDate) {
    intentScore += 10;
    reasons.push("launch context visible");
  }
  if (description && description !== productName) {
    intentScore += 10;
    reasons.push("product description visible");
  }

  return {
    company_name: productName,
    website,
    description,
    founder_name: makerName,
    email,
    twitter_handle: twitter,
    location: "Product Hunt",
    industry: category ?? "SaaS / Product",
    source: "producthunt",
    source_external_id: stableProductHuntKey(productName, makerName, website, visibleSourceUrl),
    source_url: sourceUrl,
    user_id: "default",
    posted_at,
    community_name: "Product Hunt",
    signal_type: "recently_launched",
    intent_score: Math.min(intentScore, 100),
    intent_reason: reasons.length ? reasons.join("; ") : "public Product Hunt product listing",
    raw_metadata: {
      ...value,
      sourceMode: mode,
    },
    scraped_at: new Date().toISOString(),
  };
}

function matchesProductHuntQuery(lead: Lead, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    lead.company_name,
    lead.founder_name,
    lead.description,
    lead.industry,
    lead.website,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export async function scrapeProductHunt(
  mode: ProductHuntMode,
  query: string,
  limit: number,
  _config: CommunityConfig,
): Promise<ScrapeResult> {
  if (mode !== "front_page") {
    return { leads: [], errors: ["Invalid Product Hunt mode."] };
  }

  try {
    const response = await extractWithSgai(PRODUCT_HUNT_FRONT_PAGE_URL, PRODUCT_HUNT_FRONT_PAGE_PROMPT);
    const leads = getProductHuntItems(response)
      .map((item) => mapProductHuntProductToLead(item, mode))
      .filter((lead): lead is Lead => Boolean(lead))
      .filter((lead) => matchesProductHuntQuery(lead, query))
      .slice(0, limit);

    return { leads, errors: [] };
  } catch {
    return {
      leads: [],
      errors: ["Product Hunt scraping uses ScrapeGraphAI. Check your SGAI_API_KEY and credits."],
    };
  }
}
