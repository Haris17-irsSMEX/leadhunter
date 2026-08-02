import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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

export type PublicWebErrorCode =
  | "invalid_website"
  | "dns_failure"
  | "tls_failure"
  | "website_timeout"
  | "website_blocked"
  | "website_unavailable"
  | "redirect_failure"
  | "unsupported_content"
  | "response_too_large"
  | "unknown_error";

export class PublicWebFetchError extends Error {
  readonly code: PublicWebErrorCode;
  readonly status?: number;
  readonly url?: string;

  constructor(
    code: PublicWebErrorCode,
    message: string,
    status?: number,
    url?: string,
  ) {
    super(message);
    this.name = "PublicWebFetchError";
    this.code = code;
    this.status = status;
    this.url = url;
  }
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

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const directCode = "code" in error && typeof error.code === "string" ? error.code : "";
  const cause = "cause" in error && error.cause && typeof error.cause === "object" ? error.cause : null;
  const causeCode = cause && "code" in cause && typeof cause.code === "string" ? cause.code : "";
  return directCode || causeCode;
}

function classifyNetworkError(error: unknown, url: URL) {
  if (error instanceof PublicWebFetchError) return error;

  const name = error instanceof Error ? error.name : "";
  const code = errorCode(error);
  if (name === "TimeoutError" || name === "AbortError" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT") {
    return new PublicWebFetchError("website_timeout", "The public website did not respond in time.", undefined, url.toString());
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") {
    return new PublicWebFetchError("dns_failure", "The public website hostname could not be resolved.", undefined, url.toString());
  }
  if (/CERT|TLS|SSL|ERR_TLS|UNABLE_TO_VERIFY/i.test(code)) {
    return new PublicWebFetchError("tls_failure", "The public website could not establish a secure connection.", undefined, url.toString());
  }
  if (["ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_SOCKET"].includes(code)) {
    return new PublicWebFetchError("website_unavailable", "The public website could not be reached.", undefined, url.toString());
  }
  if (/^Z_|DECOMPRESS|CONTENT_DECODING/i.test(code)) {
    return new PublicWebFetchError("unsupported_content", "The public website returned unreadable content.", undefined, url.toString());
  }

  return new PublicWebFetchError("unknown_error", "The public website request failed.", undefined, url.toString());
}

async function lookupPublicHostname(hostname: string, url: URL) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new PublicWebFetchError("website_timeout", "The public website hostname lookup timed out.", undefined, url.toString()));
        }, 5_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
    throw new PublicWebFetchError("invalid_website", "Only public HTTP and HTTPS pages can be researched.", undefined, url.toString());
  }
  if (url.username || url.password) {
    throw new PublicWebFetchError("invalid_website", "Credential-bearing URLs are not allowed.", undefined, url.toString());
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new PublicWebFetchError("invalid_website", "Private network destinations are not allowed.", undefined, url.toString());
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new PublicWebFetchError("invalid_website", "Private network destinations are not allowed.", undefined, url.toString());
    }
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookupPublicHostname(hostname, url);
  } catch (error) {
    throw classifyNetworkError(error, url);
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new PublicWebFetchError("invalid_website", "Private network destinations are not allowed.", undefined, url.toString());
  }
}

async function readBodyWithLimit(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new PublicWebFetchError("response_too_large", "The public page is too large to research safely.", response.status, response.url);
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
        throw new PublicWebFetchError("response_too_large", "The public page is too large to research safely.", response.status, response.url);
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

export async function fetchPublicWebPage(
  input: string | URL,
  options: PublicWebFetchOptions = {},
): Promise<PublicWebPage> {
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 8_000, 1_000), 20_000);
  const maxBytes = Math.min(Math.max(options.maxBytes ?? 300_000, 10_000), 1_000_000);
  const maxRedirects = Math.min(Math.max(options.maxRedirects ?? 3, 0), 5);
  const userAgent = options.userAgent ?? "LeadHunter/1.0 PublicBusinessResearch";
  let current = input instanceof URL ? new URL(input) : normalizePublicWebsiteUrl(input);

  if (!current) {
    throw new PublicWebFetchError("invalid_website", "A valid public website URL is required.");
  }

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    await assertPublicDestination(current);

    let response: Response;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "text/html, text/plain;q=0.9",
          "User-Agent": userAgent,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw classifyNetworkError(error, current);
    }

    if (response.status >= 300 && response.status < 400) {
      const location: string | null = response.headers.get("location");
      if (!location || redirectCount === maxRedirects) {
        throw new PublicWebFetchError("redirect_failure", "The public page could not complete its redirect.", response.status, current.toString());
      }
      try {
        current = new URL(location, current);
      } catch {
        throw new PublicWebFetchError("redirect_failure", "The public page returned an invalid redirect.", response.status, current.toString());
      }
      continue;
    }

    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 || response.status === 429
        ? "website_blocked"
        : "website_unavailable";
      throw new PublicWebFetchError(code, "The public page request was not accepted.", response.status, current.toString());
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new PublicWebFetchError("unsupported_content", "The public page did not return supported text content.", response.status, current.toString());
    }

    try {
      return {
        url: current.toString(),
        html: await readBodyWithLimit(response, maxBytes),
        contentType,
      };
    } catch (error) {
      throw classifyNetworkError(error, current);
    }
  }

  throw new PublicWebFetchError("redirect_failure", "The public page redirected too many times.", undefined, current.toString());
}
