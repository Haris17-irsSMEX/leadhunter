import "server-only";

import { isSafePublicEmail } from "@/lib/email-safety";
import {
  fetchPublicWebPage,
  normalizePublicWebsiteUrl,
  type PublicWebResearchContext,
} from "@/lib/public-web";
import {
  deletePublicDataCache,
  getPublicDataCache,
  PUBLIC_DATA_FRESHNESS,
  publicCacheKey,
  setPublicDataCache,
} from "@/lib/public-data-cache";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";
import { extractStructuredPublicData } from "@/lib/structured-data";
import type { DeliveryPlatformStatus } from "@/lib/types";

export type PublicEmailResult = {
  email?: string | null;
  sourceUrl?: string;
  contactPageUrl?: string;
  confidence?: number;
  status: Extract<DeliveryPlatformStatus, "found" | "not_found" | "error" | "not_checked">;
  error?: string;
  cached?: boolean;
};

export type RestaurantEmailResult = PublicEmailResult;

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PAGE_PATHS = ["", "/contact", "/contact-us", "/about", "/about-us", "/team", "/locations"] as const;
const PREFERRED_PREFIXES = [
  "info",
  "hello",
  "contact",
  "sales",
  "support",
  "team",
  "admin",
  "reservations",
  "booking",
  "manager",
  "events",
  "catering",
  "marketing",
];
const CONSUMER_EMAIL_DOMAINS = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com"]);

function pageUrl(baseUrl: string, path: string) {
  const url = new URL(baseUrl);
  url.pathname = path || url.pathname || "/";
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/, "") || url.toString();
}

function decodeHtml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&commat;/g, "@")
    .replace(/&period;/g, ".")
    .replace(/\s*\[\s*at\s*\]\s*/gi, "@")
    .replace(/\s*\(\s*at\s*\)\s*/gi, "@")
    .replace(/\s+\bat\b\s+/gi, "@")
    .replace(/\s*\[\s*dot\s*\]\s*/gi, ".")
    .replace(/\s*\(\s*dot\s*\)\s*/gi, ".")
    .replace(/\s+\bdot\b\s+/gi, ".");
}

function safeDecodeUriComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function confidenceForEmail(email: string, sourceUrl: string) {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  let confidence = 60;

  if (PREFERRED_PREFIXES.includes(local)) {
    confidence += 25;
  }

  if (/\/(contact|contact-us|about|about-us|team|locations)/i.test(sourceUrl)) {
    confidence += 10;
  }

  if (CONSUMER_EMAIL_DOMAINS.has(domain)) {
    confidence -= 15;
  }

  return Math.min(100, confidence);
}

async function fetchPublicPage(url: string, context?: PublicWebResearchContext) {
  const page = await fetchPublicWebPage(url, {
    timeoutMs: WORKLOAD_LIMITS.websiteResearch.requestTimeoutMs,
    maxBytes: WORKLOAD_LIMITS.websiteResearch.maxResponseBytes,
    maxRedirects: WORKLOAD_LIMITS.websiteResearch.maxRedirects,
    userAgent: "LeadHunter/1.0 CompletePublicResearch",
  }, context);
  return page.html;
}

function extractEmails(html: string, sourceUrl: string) {
  const decoded = decodeHtml(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/\s(?:src|srcset|data-src)=["'][^"']*["']/gi, " ");
  const candidates: Array<{ email: string; context: string }> = [];
  for (const email of extractStructuredPublicData(html, sourceUrl).emails) {
    candidates.push({ email, context: "structured public business data" });
  }

  for (const match of decoded.matchAll(/mailto:([^"'?<>\s]+)/gi)) {
    const email = safeDecodeUriComponent(match[1]?.trim() ?? "");
    if (email) {
      candidates.push({ email, context: "mailto" });
    }
  }

  for (const match of decoded.matchAll(EMAIL_REGEX)) {
    const email = match[0];
    const start = Math.max(0, match.index - 80);
    const end = Math.min(decoded.length, match.index + email.length + 80);
    candidates.push({ email, context: decoded.slice(start, end) });
  }

  return [...new Set(
    candidates
      .map(({ email, context }) => ({
        email: email.trim().replace(/^mailto:/i, "").replace(/[),.;:]+$/g, ""),
        context,
      }))
      .filter(({ email, context }) => isSafePublicEmail(email, context))
      .map(({ email }) => email),
  )];
}

function isContactLikePath(value: string) {
  return /contact|contact-us|about|about-us|team|locations?/i.test(value);
}

function discoverUsefulLinks(baseUrl: string, html: string) {
  const decoded = decodeHtml(html);
  const links: string[] = [];

  for (const match of decoded.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1]?.trim();
    const label = match[2]?.replace(/<[^>]+>/g, " ").trim() ?? "";

    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) {
      continue;
    }

    if (!isContactLikePath(`${href} ${label}`)) {
      continue;
    }

    try {
      const resolved = new URL(href, baseUrl);
      const base = new URL(baseUrl);
      if (resolved.hostname.replace(/^www\./i, "") !== base.hostname.replace(/^www\./i, "")) {
        continue;
      }
      resolved.hash = "";
      resolved.search = "";
      links.push(resolved.toString().replace(/\/+$/, ""));
    } catch {
      continue;
    }
  }

  return [...new Set(links)].slice(0, 4);
}

function orderedPages(baseUrl: string, discoveredLinks: string[]) {
  const fixedUrls = PAGE_PATHS.map((path) => pageUrl(baseUrl, path));
  return [...new Set([...fixedUrls, ...discoveredLinks])].slice(0, WORKLOAD_LIMITS.websiteResearch.maxPages);
}

export async function findPublicBusinessEmail(
  website?: string,
  context?: PublicWebResearchContext,
  options: { forceRefresh?: boolean } = {},
): Promise<PublicEmailResult> {
  const normalizedWebsite = normalizePublicWebsiteUrl(website);
  const baseUrl = normalizedWebsite?.toString().replace(/\/+$/, "");

  if (!baseUrl) {
    return { status: "not_checked" };
  }

  const origin = new URL(baseUrl).origin;
  const cacheKey = publicCacheKey("website-contact", origin, "v2");
  if (options.forceRefresh) {
    await deletePublicDataCache(cacheKey);
  } else {
    const cached = await getPublicDataCache<PublicEmailResult>(cacheKey);
    if (cached) return { ...cached, cached: true };
  }

  let attempted = false;
  let contactPageUrl: string | undefined;
  let discoveredLinks: string[] = [];
  const homepageUrl = pageUrl(baseUrl, "");

  try {
    attempted = true;
    const html = await fetchPublicPage(homepageUrl, context);
    discoveredLinks = discoverUsefulLinks(baseUrl, html);
    const [email] = extractEmails(html, homepageUrl);

    if (email) {
      const result: PublicEmailResult = {
        email,
        sourceUrl: homepageUrl,
        contactPageUrl: discoveredLinks.find((link) => isContactLikePath(link)),
        confidence: confidenceForEmail(email, homepageUrl),
        status: "found",
      };
      await setPublicDataCache(cacheKey, result, PUBLIC_DATA_FRESHNESS.websiteContactMs);
      return result;
    }
  } catch {
    // Continue with common public contact/about paths below.
  }

  for (const targetUrl of orderedPages(baseUrl, discoveredLinks).filter((url) => url !== homepageUrl)) {

    try {
      attempted = true;
      const html = await fetchPublicPage(targetUrl, context);
      if (!contactPageUrl && isContactLikePath(new URL(targetUrl).pathname)) {
        contactPageUrl = targetUrl;
      }
      const [email] = extractEmails(html, targetUrl);

      if (email) {
        const result: PublicEmailResult = {
          email,
          sourceUrl: targetUrl,
          contactPageUrl: contactPageUrl ?? targetUrl,
          confidence: confidenceForEmail(email, targetUrl),
          status: "found",
        };
        await setPublicDataCache(cacheKey, result, PUBLIC_DATA_FRESHNESS.websiteContactMs);
        return result;
      }
    } catch {
      continue;
    }
  }

  const result: PublicEmailResult = attempted
    ? { status: "not_found", email: null, contactPageUrl }
    : { status: "error", email: null, error: "Unable to check restaurant website." };
  if (result.status === "not_found") {
    await setPublicDataCache(cacheKey, result, PUBLIC_DATA_FRESHNESS.invalidWebsiteMs);
  }
  return result;
}

export async function findRestaurantPublicEmail(website?: string): Promise<RestaurantEmailResult> {
  return findPublicBusinessEmail(website);
}
