import "server-only";

import { isSafePublicEmail } from "@/lib/email-safety";
import { classifyPublicEmail } from "@/lib/outreach-intelligence";
import {
  fetchPublicWebPage,
  normalizePublicWebsiteUrl,
  PublicWebFetchError,
  sameRegistrableHost,
  type PublicWebPage,
} from "@/lib/public-web";
import type { DecisionMakerEmailType } from "@/lib/types";

export type ManualEmailSafeErrorCode =
  | "website_unavailable"
  | "website_timeout"
  | "website_blocked"
  | "dns_failure"
  | "tls_failure"
  | "redirect_failure"
  | "invalid_website"
  | "unsupported_content"
  | "response_too_large"
  | "no_public_email"
  | "database_error"
  | "configuration_error"
  | "unknown_error";

export type ManualEmailResearchStatus =
  | "found"
  | "not_found"
  | "website_unavailable"
  | "website_timeout"
  | "website_blocked"
  | "invalid_website"
  | "error";

export type ManualEmailResearchResult = {
  status: ManualEmailResearchStatus;
  email: string | null;
  emailType?: DecisionMakerEmailType;
  confidence?: number;
  sourceUrl?: string;
  contactPageUrl?: string;
  pagesChecked: string[];
  pagesAttempted: number;
  emailCandidateCount: number;
  rejectedCandidateCount: number;
  safeErrorCode?: ManualEmailSafeErrorCode;
  checkedAt: string;
  canonicalOrigin?: string;
  durationMs: number;
};

type PageKind = "home" | "contact" | "about" | "team" | "other";
type CandidateSource = "mailto" | "attribute" | "structured_data" | "visible_text";
type EmailCandidate = {
  email: string;
  sourceUrl: string;
  pageKind: PageKind;
  source: CandidateSource;
  confidence: number;
};
type DiscoveredPage = { url: string; kind: Exclude<PageKind, "home">; rank: number };

const MANUAL_RESEARCH_VERSION = 2;
const MAX_PAGES = 10;
const MAX_PAGE_BYTES = 750_000;
const PAGE_TIMEOUT_MS = 10_000;
const OVERALL_TIMEOUT_MS = 48_000;
const STRONG_CANDIDATE_CONFIDENCE = 88;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const ROLE_PREFIXES = new Set([
  "admin",
  "booking",
  "bookings",
  "contact",
  "hello",
  "info",
  "office",
  "recepcio",
  "reception",
  "reservations",
  "sales",
  "service",
  "support",
]);
const CONSUMER_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "outlook.com",
  "yahoo.com",
]);
const DIRECT_CONTACT_SIGNAL = /(?:contact(?:-us)?|get[-\s]?in[-\s]?touch|contacto|contacta|contacte|atenci[oó]n|kontakt|impressum|contatti|contatto|nous[-\s]?contacter|contato|contactos|klantenservice)/i;
const SUPPORT_SIGNAL = /\bsupport\b/i;
const ABOUT_SIGNAL = /(?:about(?:-us)?|company|who[-\s]?we[-\s]?are|empresa|sobre|uber-uns|ueber-uns|chi-siamo|a-propos|sobre-nos)/i;
const TEAM_SIGNAL = /(?:team|staff|doctors?|people|leadership|management|our-team|meet-the-team|equipo|equipe|personal)/i;
const IGNORED_LINK_SIGNAL = /(?:login|log-in|logout|sign-in|account|cart|checkout|booking|appointment|careers?|jobs?|privacy|terms|cookie|sitemap|wp-admin)/i;
const IGNORED_FILE_EXTENSION = /\.(?:pdf|docx?|xlsx?|zip|rar|jpe?g|png|gif|webp|svg|css|js)(?:$|[?#])/i;
const BUSINESS_SCHEMA_TYPES = new Set([
  "organization",
  "localbusiness",
  "professionalservice",
  "medicalbusiness",
  "dentist",
  "contactpoint",
]);
const FALLBACK_PATHS = [
  "/contact",
  "/contact-us",
  "/get-in-touch",
  "/contacto",
  "/contacta",
  "/contacte",
  "/kontakt",
  "/contatti",
  "/contato",
  "/nous-contacter",
] as const;

export const MANUAL_EMAIL_RESEARCH_METADATA_VERSION = MANUAL_RESEARCH_VERSION;

function decodeHtml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".");
}

function decodeObfuscatedEmailText(value: string) {
  return decodeHtml(value)
    .replace(/\s*\[\s*at\s*\]\s*/gi, "@")
    .replace(/\s*\(\s*at\s*\)\s*/gi, "@")
    .replace(/\s*@\s*/g, "@")
    .replace(/\s*\[\s*dot\s*\]\s*/gi, ".")
    .replace(/\s*\(\s*dot\s*\)\s*/gi, ".")
    .replace(/\s*\.\s*/g, ".");
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizedEmail(value: string) {
  return value
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/[),.;:]+$/g, "")
    .toLowerCase();
}

function pageKind(value: string): PageKind {
  if (DIRECT_CONTACT_SIGNAL.test(value)) return "contact";
  if (ABOUT_SIGNAL.test(value)) return "about";
  if (TEAM_SIGNAL.test(value)) return "team";
  if (SUPPORT_SIGNAL.test(value)) return "contact";
  return "other";
}

function cleanHostname(value: string) {
  return value.toLowerCase().replace(/^www\./, "");
}

function emailDomainMatchesSite(email: string, sourceUrl: string) {
  try {
    const emailDomain = cleanHostname(email.split("@")[1] ?? "");
    const websiteDomain = cleanHostname(new URL(sourceUrl).hostname);
    return emailDomain === websiteDomain || emailDomain.endsWith(`.${websiteDomain}`) || websiteDomain.endsWith(`.${emailDomain}`);
  } catch {
    return false;
  }
}

function candidateConfidence(candidate: Omit<EmailCandidate, "confidence">) {
  const local = candidate.email.split("@")[0] ?? "";
  const domain = candidate.email.split("@")[1] ?? "";
  let score = 38;

  if (candidate.pageKind === "contact") score += 24;
  else if (candidate.pageKind === "home") score += 10;
  else if (candidate.pageKind === "about" || candidate.pageKind === "team") score += 7;

  if (candidate.source === "mailto") score += 28;
  else if (candidate.source === "structured_data") score += 22;
  else if (candidate.source === "attribute") score += 18;
  else score += 12;

  if (ROLE_PREFIXES.has(local)) score += 18;
  if (emailDomainMatchesSite(candidate.email, candidate.sourceUrl)) score += 12;
  if (CONSUMER_DOMAINS.has(domain)) score -= 15;

  return Math.max(25, Math.min(100, score));
}

function candidateFrom(
  value: string,
  sourceUrl: string,
  kind: PageKind,
  source: CandidateSource,
  context: string,
) {
  const email = normalizedEmail(decodeObfuscatedEmailText(value));
  if (!isSafePublicEmail(email, context)) return null;
  const candidate = { email, sourceUrl, pageKind: kind, source };
  return { ...candidate, confidence: candidateConfidence(candidate) } satisfies EmailCandidate;
}

function candidateContext(value: string, index: number) {
  return value.slice(Math.max(0, index - 100), Math.min(value.length, index + 180));
}

function emailsFromMailto(html: string, sourceUrl: string, kind: PageKind) {
  const candidates: Array<EmailCandidate | null> = [];
  for (const match of decodeHtml(html).matchAll(/href=["']mailto:([^"']+)["']/gi)) {
    const decoded = safeDecode(match[1] ?? "").split("?")[0];
    for (const address of decoded.split(/[;,]/)) {
      candidates.push(candidateFrom(address, sourceUrl, kind, "mailto", "public mailto contact"));
    }
  }
  return candidates;
}

function emailsFromAttributes(html: string, sourceUrl: string, kind: PageKind) {
  const candidates: Array<EmailCandidate | null> = [];
  for (const match of decodeHtml(html).matchAll(/(?:data-email|data-mail|aria-label)=["']([^"']+)["']/gi)) {
    const value = decodeObfuscatedEmailText(match[1] ?? "");
    for (const emailMatch of value.matchAll(EMAIL_REGEX)) {
      candidates.push(candidateFrom(emailMatch[0], sourceUrl, kind, "attribute", "public contact attribute"));
    }
  }
  return candidates;
}

function schemaTypes(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase());
}

function schemaNodeMatchesSite(record: Record<string, unknown>, sourceUrl: string) {
  for (const key of ["url", "@id"] as const) {
    const value = record[key];
    if (typeof value !== "string" || !/^https?:\/\//i.test(value)) continue;
    if (!sameRegistrableHost(value, sourceUrl)) return false;
  }
  return true;
}

function emailsFromStructuredData(html: string, sourceUrl: string, kind: PageKind) {
  const candidates: Array<EmailCandidate | null> = [];

  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1] ?? "")) as unknown;
      const queue: Array<{ value: unknown; businessContext: boolean }> = [{ value: parsed, businessContext: false }];

      while (queue.length) {
        const current = queue.shift();
        if (!current) break;
        if (Array.isArray(current.value)) {
          queue.push(...current.value.map((value) => ({ value, businessContext: current.businessContext })));
          continue;
        }
        if (!current.value || typeof current.value !== "object") continue;

        const record = current.value as Record<string, unknown>;
        const types = schemaTypes(record["@type"]);
        const isBusinessNode = types.some((type) => BUSINESS_SCHEMA_TYPES.has(type) || type.endsWith("business"));
        const associated = (current.businessContext || isBusinessNode) && schemaNodeMatchesSite(record, sourceUrl);

        if (associated) {
          const emails = Array.isArray(record.email) ? record.email : [record.email];
          for (const email of emails) {
            if (typeof email === "string") {
              candidates.push(candidateFrom(email, sourceUrl, kind, "structured_data", "business structured contact"));
            }
          }
        }

        for (const [key, value] of Object.entries(record)) {
          if (!value || typeof value !== "object") continue;
          const childContext = associated && (key === "contactPoint" || key === "contactPoints" || key === "department");
          queue.push({ value, businessContext: childContext });
        }
      }
    } catch {
      continue;
    }
  }

  return candidates;
}

function emailsFromVisibleText(html: string, sourceUrl: string, kind: PageKind) {
  const visible = decodeObfuscatedEmailText(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
  const candidates: Array<EmailCandidate | null> = [];

  for (const match of visible.matchAll(EMAIL_REGEX)) {
    candidates.push(candidateFrom(match[0], sourceUrl, kind, "visible_text", candidateContext(visible, match.index)));
  }
  return candidates;
}

function extractPageCandidates(page: PublicWebPage, kind: PageKind) {
  const all = [
    ...emailsFromStructuredData(page.html, page.url, kind),
    ...emailsFromMailto(page.html, page.url, kind),
    ...emailsFromAttributes(page.html, page.url, kind),
    ...emailsFromVisibleText(page.html, page.url, kind),
  ];
  return {
    accepted: all.filter((candidate): candidate is EmailCandidate => Boolean(candidate)),
    rejected: all.filter((candidate) => !candidate).length,
  };
}

function linkKind(value: string) {
  if (DIRECT_CONTACT_SIGNAL.test(value)) return { kind: "contact" as const, rank: 0 };
  if (ABOUT_SIGNAL.test(value)) return { kind: "about" as const, rank: 1 };
  if (TEAM_SIGNAL.test(value)) return { kind: "team" as const, rank: 2 };
  if (SUPPORT_SIGNAL.test(value)) return { kind: "contact" as const, rank: 3 };
  return null;
}

function discoverPages(page: PublicWebPage) {
  const pages = new Map<string, DiscoveredPage>();
  for (const match of decodeHtml(page.html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1]?.trim();
    const label = (match[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!href || /^(?:mailto|tel|javascript|data):/i.test(href) || href.startsWith("#")) continue;
    const classification = linkKind(`${href} ${label}`);
    if (!classification || IGNORED_LINK_SIGNAL.test(href) || IGNORED_FILE_EXTENSION.test(href)) continue;

    try {
      const resolved = new URL(href, page.url);
      if (!sameRegistrableHost(resolved, page.url)) continue;
      resolved.hash = "";
      if ([...resolved.searchParams.keys()].some((key) => /token|logout|session|auth/i.test(key))) continue;
      resolved.search = "";
      const url = resolved.toString();
      const existing = pages.get(url);
      if (!existing || classification.rank < existing.rank) pages.set(url, { url, ...classification });
    } catch {
      continue;
    }
  }
  return [...pages.values()].sort((left, right) => left.rank - right.rank);
}

function pageKey(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value;
  }
}

function websiteCandidates(value?: string | null) {
  const normalized = normalizePublicWebsiteUrl(value);
  if (!normalized) return [];

  const candidates: URL[] = [];
  const add = (url: URL) => {
    url.username = "";
    url.password = "";
    url.hash = "";
    if (!candidates.some((candidate) => candidate.toString() === url.toString())) candidates.push(url);
  };

  add(new URL(normalized));
  const https = new URL(normalized);
  https.protocol = "https:";
  add(https);
  const alternateHost = new URL(https);
  alternateHost.hostname = alternateHost.hostname.startsWith("www.")
    ? alternateHost.hostname.slice(4)
    : `www.${alternateHost.hostname}`;
  add(alternateHost);
  const http = new URL(normalized);
  http.protocol = "http:";
  add(http);
  return candidates;
}

function fallbackPages(origin: string) {
  return FALLBACK_PATHS.map((path, index) => ({
    url: new URL(path, origin).toString(),
    kind: "contact" as const,
    rank: 10 + index,
  }));
}

function failureCode(error: unknown): ManualEmailSafeErrorCode {
  if (error instanceof PublicWebFetchError) return error.code;
  return "unknown_error";
}

function resultStatus(code: ManualEmailSafeErrorCode): ManualEmailResearchStatus {
  if (code === "invalid_website") return "invalid_website";
  if (code === "website_timeout") return "website_timeout";
  if (code === "website_blocked") return "website_blocked";
  if (code === "website_unavailable" || code === "dns_failure" || code === "tls_failure") return "website_unavailable";
  return "error";
}

function primaryFailure(codes: ManualEmailSafeErrorCode[]) {
  const priority: ManualEmailSafeErrorCode[] = [
    "website_blocked",
    "website_timeout",
    "dns_failure",
    "tls_failure",
    "redirect_failure",
    "response_too_large",
    "unsupported_content",
    "invalid_website",
    "website_unavailable",
    "unknown_error",
  ];
  return priority.find((code) => codes.includes(code)) ?? "unknown_error";
}

function bestCandidate(candidates: EmailCandidate[]) {
  const unique = new Map<string, EmailCandidate>();
  for (const candidate of candidates) {
    const existing = unique.get(candidate.email);
    if (!existing || candidate.confidence > existing.confidence) unique.set(candidate.email, candidate);
  }
  return [...unique.values()].sort((left, right) => {
    if (right.confidence !== left.confidence) return right.confidence - left.confidence;
    return left.email.localeCompare(right.email);
  })[0];
}

function fetchPage(url: string, timeoutMs: number) {
  return fetchPublicWebPage(url, {
    timeoutMs,
    maxBytes: MAX_PAGE_BYTES,
    maxRedirects: 5,
    userAgent: "LeadHunter/1.0 ManualPublicEmailResearch",
  });
}

async function fetchWithOneTransientRetry(url: string, deadline: number) {
  const firstTimeout = Math.max(1_000, Math.min(PAGE_TIMEOUT_MS, deadline - Date.now()));
  try {
    return await fetchPage(url, firstTimeout);
  } catch (error) {
    const code = failureCode(error);
    if ((code !== "website_timeout" && code !== "website_unavailable") || Date.now() >= deadline) throw error;
    const retryTimeout = Math.max(1_000, Math.min(PAGE_TIMEOUT_MS, deadline - Date.now()));
    return fetchPage(url, retryTimeout);
  }
}

export async function findPublicEmailForLead(input: {
  leadId: string;
  website?: string | null;
}): Promise<ManualEmailResearchResult> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  const deadline = startedAt + OVERALL_TIMEOUT_MS;
  const homepageCandidates = websiteCandidates(input.website);
  const attemptedUrls = new Set<string>();
  const checkedUrls: string[] = [];
  const failures: ManualEmailSafeErrorCode[] = [];
  const candidates: EmailCandidate[] = [];
  let rejectedCandidateCount = 0;
  let contactPageUrl: string | undefined;
  let canonicalOrigin: string | undefined;
  let discoveredPages: DiscoveredPage[] = [];

  const finish = (result: Omit<ManualEmailResearchResult, "checkedAt" | "durationMs" | "pagesChecked" | "pagesAttempted" | "emailCandidateCount" | "rejectedCandidateCount">) => {
    const completed: ManualEmailResearchResult = {
      ...result,
      pagesChecked: checkedUrls,
      pagesAttempted: attemptedUrls.size,
      emailCandidateCount: new Set(candidates.map((candidate) => candidate.email)).size,
      rejectedCandidateCount,
      checkedAt,
      durationMs: Date.now() - startedAt,
      canonicalOrigin,
    };
    let hostname = "invalid";
    try {
      hostname = homepageCandidates[0]?.hostname ?? "invalid";
    } catch {
      // Keep diagnostics free of the original untrusted URL.
    }
    console.info("[manual-email] research completed", {
      leadId: input.leadId,
      hostname,
      pagesAttempted: completed.pagesAttempted,
      pagesParsed: completed.pagesChecked.length,
      contactLinksDiscovered: discoveredPages.filter((page) => page.kind === "contact").length,
      emailCandidateCount: completed.emailCandidateCount,
      rejectedCandidateCount: completed.rejectedCandidateCount,
      status: completed.status,
      safeErrorCode: completed.safeErrorCode,
      durationMs: completed.durationMs,
    });
    return completed;
  };

  if (!homepageCandidates.length) {
    return finish({ status: "invalid_website", email: null, safeErrorCode: "invalid_website" });
  }

  let homepage: PublicWebPage | undefined;
  for (const candidate of homepageCandidates) {
    if (attemptedUrls.size >= MAX_PAGES || Date.now() >= deadline) break;
    const url = candidate.toString();
    attemptedUrls.add(url);
    try {
      const remaining = Math.max(1_000, Math.min(PAGE_TIMEOUT_MS, deadline - Date.now()));
      homepage = await fetchPage(url, remaining);
      checkedUrls.push(homepage.url);
      canonicalOrigin = new URL(homepage.url).origin;
      break;
    } catch (error) {
      failures.push(failureCode(error));
    }
  }

  if (!homepage && Date.now() < deadline && failures.some((code) => code === "website_timeout" || code === "website_unavailable")) {
    const retryUrl = homepageCandidates[0].toString();
    attemptedUrls.add(retryUrl);
    try {
      const remaining = Math.max(1_000, Math.min(PAGE_TIMEOUT_MS, deadline - Date.now()));
      homepage = await fetchPage(retryUrl, remaining);
      checkedUrls.push(homepage.url);
      canonicalOrigin = new URL(homepage.url).origin;
    } catch (error) {
      failures.push(failureCode(error));
    }
  }

  const processPage = (page: PublicWebPage, kind: PageKind) => {
    const extracted = extractPageCandidates(page, kind);
    candidates.push(...extracted.accepted);
    rejectedCandidateCount += extracted.rejected;
  };

  if (homepage) {
    processPage(homepage, "home");
    discoveredPages = discoverPages(homepage);
    contactPageUrl = discoveredPages.find((page) => page.kind === "contact")?.url;
    const first = bestCandidate(candidates);
    if (first && first.confidence >= STRONG_CANDIDATE_CONFIDENCE) {
      return finish({
        status: "found",
        email: first.email,
        emailType: classifyPublicEmail(first.email),
        confidence: first.confidence,
        sourceUrl: first.sourceUrl,
        contactPageUrl,
      });
    }
  } else {
    canonicalOrigin = homepageCandidates[0].origin;
  }

  const origin = canonicalOrigin ?? homepageCandidates[0].origin;
  const hasDiscoveredContact = discoveredPages.some((page) => page.kind === "contact");
  const queuedPages = homepage
    ? [...discoveredPages, ...(hasDiscoveredContact ? [] : fallbackPages(origin))]
    : [];
  const uniqueQueuedPages = queuedPages
    .filter((page, index, all) => all.findIndex((candidate) => pageKey(candidate.url) === pageKey(page.url)) === index)
    .filter((page) => !checkedUrls.some((checked) => pageKey(checked) === pageKey(page.url)));

  for (const pageToCheck of uniqueQueuedPages) {
    if (attemptedUrls.size >= MAX_PAGES || Date.now() >= deadline) break;
    if (checkedUrls.some((checked) => pageKey(checked) === pageKey(pageToCheck.url))) continue;
    attemptedUrls.add(pageToCheck.url);
    try {
      const page = await fetchWithOneTransientRetry(pageToCheck.url, deadline);
      if (!sameRegistrableHost(page.url, origin)) continue;
      checkedUrls.push(page.url);
      if (!contactPageUrl && pageToCheck.kind === "contact") contactPageUrl = page.url;
      processPage(page, pageToCheck.kind);
      const first = bestCandidate(candidates);
      if (first && first.confidence >= STRONG_CANDIDATE_CONFIDENCE) break;
    } catch (error) {
      failures.push(failureCode(error));
    }
  }

  const selected = bestCandidate(candidates);
  if (selected) {
    return finish({
      status: "found",
      email: selected.email,
      emailType: classifyPublicEmail(selected.email),
      confidence: selected.confidence,
      sourceUrl: selected.sourceUrl,
      contactPageUrl: contactPageUrl ?? (selected.pageKind === "contact" ? selected.sourceUrl : undefined),
    });
  }

  if (checkedUrls.length) {
    return finish({
      status: "not_found",
      email: null,
      contactPageUrl,
      safeErrorCode: "no_public_email",
    });
  }

  const safeErrorCode = primaryFailure(failures);
  return finish({
    status: resultStatus(safeErrorCode),
    email: null,
    contactPageUrl,
    safeErrorCode,
  });
}
