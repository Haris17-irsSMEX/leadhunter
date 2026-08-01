import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

export type PublicWebPage = {
  url: string;
  html: string;
  contentType: string;
};

export type PublicWebFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
};

export type PublicWebResearchContext = {
  cache: Map<string, Promise<PublicWebPage>>;
  maxPages: number;
  requestsStarted: number;
};

export function createPublicWebResearchContext(maxPages = WORKLOAD_LIMITS.websiteResearch.maxPages): PublicWebResearchContext {
  return {
    cache: new Map(),
    maxPages: Math.min(Math.max(Math.floor(maxPages), 1), WORKLOAD_LIMITS.websiteResearch.maxPages),
    requestsStarted: 0,
  };
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

function ipv4Parts(address: string) {
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

function isPrivateIpv4(address: string) {
  const parts = ipv4Parts(address);
  if (!parts) return true;

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false;
}

function isPrivateAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

export function normalizePublicWebsiteUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function sameRegistrableHost(left: URL | string, right: URL | string) {
  try {
    const leftHost = (left instanceof URL ? left : new URL(left)).hostname.replace(/^www\./i, "").toLowerCase();
    const rightHost = (right instanceof URL ? right : new URL(right)).hostname.replace(/^www\./i, "").toLowerCase();
    return leftHost === rightHost;
  } catch {
    return false;
  }
}

async function assertPublicDestination(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only public HTTP and HTTPS pages can be researched.");
  }
  if (url.username || url.password) {
    throw new Error("Credential-bearing URLs are not allowed.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Private network destinations are not allowed.");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("Private network destinations are not allowed.");
    }
    return;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Private network destinations are not allowed.");
  }
}

async function readBodyWithLimit(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("Public page is too large to research safely.");
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Public page is too large to research safely.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}

async function fetchPublicWebPageUncached(
  input: string | URL,
  options: PublicWebFetchOptions = {},
): Promise<PublicWebPage> {
  const timeoutMs = Math.min(
    Math.max(options.timeoutMs ?? WORKLOAD_LIMITS.websiteResearch.requestTimeoutMs, 1_000),
    WORKLOAD_LIMITS.websiteResearch.requestTimeoutMs,
  );
  const maxBytes = Math.min(
    Math.max(options.maxBytes ?? WORKLOAD_LIMITS.websiteResearch.maxResponseBytes, 10_000),
    WORKLOAD_LIMITS.websiteResearch.maxResponseBytes,
  );
  const maxRedirects = Math.min(
    Math.max(options.maxRedirects ?? WORKLOAD_LIMITS.websiteResearch.maxRedirects, 0),
    WORKLOAD_LIMITS.websiteResearch.maxRedirects,
  );
  const userAgent = options.userAgent ?? "LeadHunter/1.0 PublicBusinessResearch";
  let current = input instanceof URL ? new URL(input) : normalizePublicWebsiteUrl(input);

  if (!current) {
    throw new Error("A valid public website URL is required.");
  }

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    await assertPublicDestination(current);

    const response: Response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "text/html, text/plain;q=0.9",
        "User-Agent": userAgent,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      const location: string | null = response.headers.get("location");
      if (!location || redirectCount === maxRedirects) {
        throw new Error("Public page redirected too many times.");
      }
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Public page request failed with status ${response.status}.`);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error("Public page did not return HTML content.");
    }

    return {
      url: current.toString(),
      html: await readBodyWithLimit(response, maxBytes),
      contentType,
    };
  }

  throw new Error("Public page redirected too many times.");
}

export async function fetchPublicWebPage(
  input: string | URL,
  options: PublicWebFetchOptions = {},
  context?: PublicWebResearchContext,
): Promise<PublicWebPage> {
  if (!context) {
    return fetchPublicWebPageUncached(input, options);
  }

  const normalized = input instanceof URL ? new URL(input) : normalizePublicWebsiteUrl(input);
  if (!normalized) {
    return fetchPublicWebPageUncached(input, options);
  }
  const cacheKey = normalized.toString();

  const cached = context.cache.get(cacheKey);
  if (cached) return cached;
  if (context.requestsStarted >= context.maxPages) {
    throw new Error("The bounded public website page limit was reached.");
  }
  context.requestsStarted += 1;

  const request = fetchPublicWebPageUncached(normalized, options).catch((error) => {
    throw error;
  });
  context.cache.set(cacheKey, request);
  return request;
}
