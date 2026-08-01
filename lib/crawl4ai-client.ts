import "server-only";

import { assertSafePublicUrl, isPublicWebCrawlAllowed, normalizePublicWebsiteUrl, sameRegistrableHost } from "@/lib/public-web";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

export type Crawl4AIPage = {
  url: string;
  title?: string;
  text: string;
  links: string[];
  success: boolean;
};

export type Crawl4AIResult = {
  status: "completed" | "unavailable" | "not_eligible" | "robots_disallowed" | "error";
  pages: Crawl4AIPage[];
  safeErrorCode?: "browser_fallback_unavailable" | "browser_fallback_failed";
};

let healthCache: { healthy: boolean; expiresAt: number } | null = null;
const BLOCKED_CRAWLER_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "google.com",
  "googleusercontent.com",
];

function isProtectedPlatform(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  return BLOCKED_CRAWLER_HOSTS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function configuration() {
  const enabled = process.env.CRAWL4AI_ENABLED === "true";
  const baseValue = process.env.CRAWL4AI_BASE_URL?.trim();
  const token = process.env.CRAWL4AI_API_TOKEN?.trim();
  if (!enabled || !baseValue || !token) return null;
  try {
    const baseUrl = new URL(baseValue);
    if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) return null;
    return { baseUrl, token };
  } catch {
    return null;
  }
}

async function readBoundedJson(response: Response) {
  const maxBytes = WORKLOAD_LIMITS.durableEnrichment.crawlerMaxResponseBytes;
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new Error("Crawl4AI response exceeded the safe size limit.");
  if (!response.body) return {};
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("Crawl4AI response exceeded the safe size limit.");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(output)) as unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function markdownText(value: unknown) {
  if (typeof value === "string") return value;
  const data = record(value);
  return typeof data?.raw_markdown === "string"
    ? data.raw_markdown
    : typeof data?.fit_markdown === "string"
      ? data.fit_markdown
      : "";
}

function linkValues(value: unknown) {
  const data = record(value);
  const groups = data ? [data.internal, data.external] : [];
  return groups.flatMap((group) => Array.isArray(group) ? group : []).map((entry) => {
    if (typeof entry === "string") return entry;
    const item = record(entry);
    return typeof item?.href === "string" ? item.href : "";
  }).filter(Boolean).slice(0, 100);
}

function parsePages(payload: unknown, requestedOrigin: URL) {
  const root = record(payload);
  const rawResults = Array.isArray(root?.results)
    ? root.results
    : Array.isArray(root?.result)
      ? root.result
      : root?.result
        ? [root.result]
        : [];
  const pages: Crawl4AIPage[] = [];
  for (const raw of rawResults) {
    const item = record(raw);
    const urlValue = typeof item?.url === "string"
      ? item.url
      : typeof item?.redirected_url === "string"
        ? item.redirected_url
        : "";
    const url = normalizePublicWebsiteUrl(urlValue);
    if (!url || !sameRegistrableHost(url, requestedOrigin)) continue;
    const text = markdownText(item?.markdown).slice(0, 300_000);
    const metadata = record(item?.metadata);
    pages.push({
      url: url.href,
      title: typeof metadata?.title === "string" ? metadata.title.slice(0, 300) : undefined,
      text,
      links: linkValues(item?.links).filter((link) => {
        const linked = normalizePublicWebsiteUrl(link);
        return Boolean(linked && sameRegistrableHost(linked, requestedOrigin));
      }),
      success: item?.success !== false && Boolean(text.trim()),
    });
  }
  return pages.slice(0, WORKLOAD_LIMITS.durableEnrichment.maxCrawlerPagesPerLead);
}

export function isCrawl4AIConfigured() {
  return Boolean(configuration());
}

export async function checkCrawl4AIHealth() {
  const config = configuration();
  if (!config) return false;
  if (healthCache && healthCache.expiresAt > Date.now()) return healthCache.healthy;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(new URL("/health", config.baseUrl), {
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const healthy = response.ok;
    healthCache = { healthy, expiresAt: Date.now() + 30_000 };
    return healthy;
  } catch {
    healthCache = { healthy: false, expiresAt: Date.now() + 10_000 };
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function crawlPublicBusinessPages(website: string, candidateUrls: string[]): Promise<Crawl4AIResult> {
  const config = configuration();
  const origin = normalizePublicWebsiteUrl(website);
  if (!config || !origin || isProtectedPlatform(origin)) return { status: "not_eligible", pages: [] };
  if (!(await checkCrawl4AIHealth())) {
    return { status: "unavailable", pages: [], safeErrorCode: "browser_fallback_unavailable" };
  }

  const urls: URL[] = [];
  for (const value of candidateUrls) {
    const url = normalizePublicWebsiteUrl(value);
    if (!url || !sameRegistrableHost(url, origin) || urls.some((item) => item.href === url.href)) continue;
    await assertSafePublicUrl(url);
    if (!(await isPublicWebCrawlAllowed(url))) {
      if (!urls.length) return { status: "robots_disallowed", pages: [] };
      continue;
    }
    urls.push(url);
    if (urls.length >= WORKLOAD_LIMITS.durableEnrichment.maxCrawlerPagesPerLead) break;
  }
  if (!urls.length) return { status: "not_eligible", pages: [] };

  const controller = new AbortController();
  const timeoutMs = Math.min(
    Math.max(Number(process.env.CRAWL4AI_TIMEOUT_MS) || WORKLOAD_LIMITS.durableEnrichment.crawlerTimeoutMs, 5_000),
    WORKLOAD_LIMITS.durableEnrichment.crawlerTimeoutMs,
  );
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL("/crawl", config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        urls: urls.map((url) => url.href),
        browser_config: { type: "BrowserConfig", params: { headless: true } },
        crawler_config: {
          type: "CrawlerRunConfig",
          params: {
            stream: false,
            cache_mode: "bypass",
            check_robots_txt: true,
            page_timeout: timeoutMs,
            remove_overlay_elements: true,
            scan_full_page: false,
          },
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return response.status >= 500
        ? { status: "unavailable", pages: [], safeErrorCode: "browser_fallback_unavailable" }
        : { status: "error", pages: [], safeErrorCode: "browser_fallback_failed" };
    }
    const pages = parsePages(await readBoundedJson(response), origin);
    return { status: "completed", pages };
  } catch {
    return { status: "unavailable", pages: [], safeErrorCode: "browser_fallback_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
