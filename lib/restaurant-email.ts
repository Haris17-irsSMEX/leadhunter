import "server-only";

import { isSafePublicEmail } from "@/lib/email-safety";
import type { DeliveryPlatformStatus } from "@/lib/types";

export type RestaurantEmailResult = {
  email?: string | null;
  sourceUrl?: string;
  confidence?: number;
  status: Extract<DeliveryPlatformStatus, "found" | "not_found" | "error" | "not_checked">;
  error?: string;
};

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const REQUEST_TIMEOUT_MS = 8_000;
const PAGE_PATHS = ["", "/contact", "/contact-us", "/about", "/about-us", "/locations"] as const;
const PREFERRED_PREFIXES = ["info", "hello", "contact", "reservations", "booking", "manager", "events", "catering"];

function normalizeWebsiteUrl(website?: string) {
  const trimmed = website?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

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
    .replace(/&commat;/g, "@")
    .replace(/&period;/g, ".")
    .replace(/\s*\[\s*at\s*\]\s*/gi, "@")
    .replace(/\s*\(\s*at\s*\)\s*/gi, "@")
    .replace(/\s+\bat\b\s+/gi, "@")
    .replace(/\s*\[\s*dot\s*\]\s*/gi, ".")
    .replace(/\s*\(\s*dot\s*\)\s*/gi, ".")
    .replace(/\s+\bdot\b\s+/gi, ".");
}

function confidenceForEmail(email: string, sourceUrl: string) {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  let confidence = 60;

  if (PREFERRED_PREFIXES.includes(local)) {
    confidence += 25;
  }

  if (/\/(contact|contact-us|about|about-us|locations)/i.test(sourceUrl)) {
    confidence += 10;
  }

  return Math.min(100, confidence);
}

async function fetchPublicPage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html, text/plain;q=0.9",
        "User-Agent": "LeadHunter/1.0 RestaurantEnrichment",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Website request failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return "";
    }

    return (await response.text()).slice(0, 250_000);
  } finally {
    clearTimeout(timeout);
  }
}

function extractEmails(html: string) {
  const decoded = decodeHtml(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/\s(?:src|srcset|data-src)=["'][^"']*["']/gi, " ");
  const candidates: Array<{ email: string; context: string }> = [];

  for (const match of decoded.matchAll(/mailto:([^"'?<>\s]+)/gi)) {
    const email = match[1]?.trim();
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

export async function findRestaurantPublicEmail(website?: string): Promise<RestaurantEmailResult> {
  const baseUrl = normalizeWebsiteUrl(website);

  if (!baseUrl) {
    return { status: "not_checked" };
  }

  let attempted = false;

  for (const path of PAGE_PATHS) {
    const targetUrl = pageUrl(baseUrl, path);

    try {
      attempted = true;
      const html = await fetchPublicPage(targetUrl);
      const [email] = extractEmails(html);

      if (email) {
        return {
          email,
          sourceUrl: targetUrl,
          confidence: confidenceForEmail(email, targetUrl),
          status: "found",
        };
      }
    } catch {
      continue;
    }
  }

  return attempted ? { status: "not_found", email: null } : { status: "error", email: null, error: "Unable to check restaurant website." };
}
