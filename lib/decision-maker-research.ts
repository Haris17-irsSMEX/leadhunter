import "server-only";

import { isSafePublicEmail } from "@/lib/email-safety";
import { isAgencyLead, isRestaurantLead } from "@/lib/lead-kind";
import { classifyPublicEmail } from "@/lib/outreach-intelligence";
import { fetchPublicWebPage, normalizePublicWebsiteUrl, sameRegistrableHost } from "@/lib/public-web";
import type {
  DecisionMaker,
  DecisionMakerConfidence,
  DecisionMakerSourceType,
  Lead,
  WhatsAppStatus,
} from "@/lib/types";

type Candidate = Omit<DecisionMaker, "id" | "user_id" | "lead_id" | "created_at" | "updated_at">;
type SearchItem = { title?: string; link?: string; snippet?: string };

export type DecisionMakerResearchResult = {
  candidates: Candidate[];
  researchedUrls: string[];
  warnings: string[];
  websiteAvailable: boolean;
  searchAvailable: boolean;
  whatsapp: {
    status: WhatsAppStatus;
    url?: string;
    number?: string;
    sourceUrl?: string;
  };
};

const MAX_WEBSITE_PAGES = 8;
const RESEARCH_PATHS = [
  "/about",
  "/about-us",
  "/team",
  "/our-team",
  "/leadership",
  "/management",
  "/staff",
  "/people",
  "/agents",
  "/brokers",
  "/company",
  "/who-we-are",
] as const;
const ROLE_PATTERN =
  "(?:co[- ]?founder|founder|owner|broker\\/owner|managing broker|practice manager|office manager|general manager|location manager|managing director|marketing director|marketing manager|sales director|operations manager|chief executive officer|ceo|president|principal|partner|broker|director|head of growth|business development manager)";
const PERSON_NAME_PATTERN = "[A-Z][A-Za-z'’-]{1,30}(?:\\s+[A-Z][A-Za-z'’-]{1,30}){1,3}";
const ROLE_LINK_PATTERN =
  /about|team|leadership|management|staff|people|agents|brokers|company|who-we-are|our-team/i;
const LINKEDIN_PROFILE_PATTERN = /^https?:\/\/(?:[\w-]+\.)?linkedin\.com\/in\//i;
const WHATSAPP_URL_PATTERN = /^https?:\/\/(?:wa\.me|api\.whatsapp\.com)\//i;
const WHATSAPP_SCHEME_PATTERN = /^whatsapp:\/\//i;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function decodeHtml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function stripHtml(value: string) {
  return decodeHtml(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/article|\/section|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function cleanValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizedCandidateKey(candidate: Pick<Candidate, "name" | "role">) {
  return `${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, " ")}|${candidate.role
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")}`;
}

function rolePriority(lead: Lead, role: string) {
  const normalized = role.toLowerCase();
  const categoryPriorities = isRestaurantLead(lead)
    ? ["owner", "founder", "general manager", "marketing manager"]
    : isAgencyLead(lead)
      ? ["founder", "owner", "managing director", "head of growth"]
      : /\b(real estate|realtor|broker)\b/i.test(`${lead.industry ?? ""} ${lead.description ?? ""}`)
        ? ["broker/owner", "managing broker", "principal", "founder"]
        : /\b(clinic|dental|dentist|medical|practice)\b/i.test(`${lead.industry ?? ""} ${lead.description ?? ""}`)
          ? ["owner", "practice manager", "director", "partner"]
          : ["owner", "founder", "president", "chief executive officer", "managing director", "director", "general manager"];
  const index = categoryPriorities.findIndex((value) => normalized.includes(value));
  return index === -1 ? 20 : index;
}

function candidateEmailFromContext(context: string, name: string) {
  for (const email of context.match(EMAIL_PATTERN) ?? []) {
    if (isSafePublicEmail(email, context)) {
      return {
        email,
        emailType: classifyPublicEmail(email, name),
      };
    }
  }
  return {};
}

function linkedinUrlFromContext(context: string, pageUrl: string) {
  for (const match of context.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1] ?? "", pageUrl).toString();
      if (LINKEDIN_PROFILE_PATTERN.test(url)) return url;
    } catch {
      continue;
    }
  }
  return undefined;
}

function visibleCandidates(html: string, sourceUrl: string): Candidate[] {
  const decodedHtml = decodeHtml(html);
  const text = stripHtml(html);
  const candidates: Candidate[] = [];
  const patterns = [
    new RegExp(`(${PERSON_NAME_PATTERN})\\s*(?:[-–—|,:]\\s*|\\n+|\\s{2,})(${ROLE_PATTERN})`, "gi"),
    new RegExp(`(${ROLE_PATTERN})\\s*(?:[-–—|,:]\\s*|\\n+|\\s{2,})(${PERSON_NAME_PATTERN})`, "gi"),
  ];

  for (const [patternIndex, pattern] of patterns.entries()) {
    for (const match of text.matchAll(pattern)) {
      const name = (patternIndex === 0 ? match[1] : match[2])?.trim();
      const role = (patternIndex === 0 ? match[2] : match[1])?.trim();
      if (
        !name ||
        !role ||
        !new RegExp(`^${PERSON_NAME_PATTERN}$`).test(name) ||
        /\b(our|the|meet|about|contact)\b/i.test(name)
      ) {
        continue;
      }

      const textIndex = match.index ?? 0;
      const context = text.slice(Math.max(0, textIndex - 250), textIndex + match[0].length + 400);
      const htmlIndex = decodedHtml.toLowerCase().indexOf(name.toLowerCase());
      const htmlContext =
        htmlIndex >= 0 ? decodedHtml.slice(Math.max(0, htmlIndex - 400), htmlIndex + name.length + 800) : "";
      const email = candidateEmailFromContext(context, name);

      candidates.push({
        name,
        role,
        public_work_email: email.email,
        email_type: email.emailType,
        public_profile_url: linkedinUrlFromContext(htmlContext, sourceUrl),
        source_url: sourceUrl,
        source_type: "business_website",
        confidence: "medium",
        verification_status: "unverified",
        is_primary: false,
        last_checked_at: new Date().toISOString(),
      });
    }
  }

  return candidates;
}

function structuredCandidates(html: string, sourceUrl: string): Candidate[] {
  const candidates: Candidate[] = [];

  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1] ?? "")) as unknown;
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];

      while (queue.length) {
        const current = queue.shift();
        if (!current || typeof current !== "object") continue;
        if (Array.isArray(current)) {
          queue.push(...current);
          continue;
        }

        const record = current as Record<string, unknown>;
        const type = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
        const isPerson = type.some((value) => typeof value === "string" && value.toLowerCase() === "person");

        if (isPerson) {
          const name = cleanValue(record.name);
          const role = cleanValue(record.jobTitle) ?? cleanValue(record.role);
          if (name && role && new RegExp(ROLE_PATTERN, "i").test(role)) {
            const email = cleanValue(record.email)?.replace(/^mailto:/i, "");
            const sameAs = Array.isArray(record.sameAs) ? record.sameAs : [record.sameAs, record.url];
            const profile = sameAs
              .map(cleanValue)
              .find((value): value is string => Boolean(value && LINKEDIN_PROFILE_PATTERN.test(value)));

            candidates.push({
              name,
              role,
              public_work_email: email && isSafePublicEmail(email) ? email : undefined,
              email_type: email && isSafePublicEmail(email) ? classifyPublicEmail(email, name) : undefined,
              public_profile_url: profile,
              source_url: sourceUrl,
              source_type: "structured_data",
              confidence: "high",
              verification_status: "unverified",
              is_primary: false,
              last_checked_at: new Date().toISOString(),
            });
          }
        }

        for (const value of Object.values(record)) {
          if (value && typeof value === "object") queue.push(value);
        }
      }
    } catch {
      continue;
    }
  }

  return candidates;
}

function discoverResearchLinks(baseUrl: URL, html: string) {
  const links: string[] = [];
  for (const match of decodeHtml(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1]?.trim();
    const label = stripHtml(match[2] ?? "");
    if (!href || !ROLE_LINK_PATTERN.test(`${href} ${label}`)) continue;

    try {
      const url = new URL(href, baseUrl);
      url.hash = "";
      url.search = "";
      if (sameRegistrableHost(baseUrl, url)) links.push(url.toString());
    } catch {
      continue;
    }
  }
  return [...new Set(links)].slice(0, 6);
}

function whatsappEvidence(html: string, sourceUrl: string) {
  for (const match of decodeHtml(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1]?.trim() ?? "";
    const label = stripHtml(match[2] ?? "");
    const directWhatsAppUrl = WHATSAPP_URL_PATTERN.test(href) || WHATSAPP_SCHEME_PATTERN.test(href);
    if (!directWhatsAppUrl && !/whatsapp/i.test(label)) continue;

    try {
      const url = WHATSAPP_SCHEME_PATTERN.test(href) ? href : new URL(href, sourceUrl).toString();
      const number = url.match(/(?:phone=|wa\.me\/)(\+?\d{7,15})/i)?.[1];
      return {
        status: directWhatsAppUrl ? ("confirmed_public" as const) : ("possible" as const),
        url,
        number,
        sourceUrl,
      };
    } catch {
      continue;
    }
  }
  return undefined;
}

function publicSearchConfig() {
  const provider = process.env.DELIVERY_SEARCH_PROVIDER?.trim().toLowerCase();
  const key = process.env.SERPER_API_KEY?.trim();
  return provider !== "google_cse" && key ? key : undefined;
}

async function serperSearch(query: string, apiKey: string): Promise<SearchItem[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ q: query, num: 5 }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Public search failed with status ${response.status}.`);
  const payload = (await response.json()) as { organic?: SearchItem[] };
  return payload.organic ?? [];
}

function searchCandidate(item: SearchItem, lead: Lead): Candidate | undefined {
  const title = item.title?.trim();
  const link = item.link?.trim();
  const snippet = item.snippet?.trim() ?? "";
  if (!title || !link) return undefined;

  const companyToken = lead.company_name.toLowerCase().split(/\s+/).find((token) => token.length > 3);
  const evidence = `${title} ${snippet}`;
  if (!companyToken || !evidence.toLowerCase().includes(companyToken)) return undefined;

  const role = evidence.match(new RegExp(`\\b(${ROLE_PATTERN})\\b`, "i"))?.[1];
  const possibleName = title.split(/\s[-|–—]\s/)[0]?.trim();
  if (!role || !possibleName || !new RegExp(`^${PERSON_NAME_PATTERN}$`).test(possibleName)) return undefined;

  return {
    name: possibleName,
    role,
    public_profile_url: LINKEDIN_PROFILE_PATTERN.test(link) ? link : undefined,
    source_url: link,
    source_type: LINKEDIN_PROFILE_PATTERN.test(link) ? "public_profile_link" : "public_search",
    confidence: "low",
    verification_status: "unverified",
    is_primary: false,
    last_checked_at: new Date().toISOString(),
  };
}

function dedupeAndRank(lead: Lead, candidates: Candidate[]) {
  const ranked = [...candidates].sort((left, right) => {
    const confidenceRank: Record<DecisionMakerConfidence, number> = { high: 0, medium: 10, low: 20 };
    return (
      confidenceRank[left.confidence] +
      rolePriority(lead, left.role) -
      (confidenceRank[right.confidence] + rolePriority(lead, right.role))
    );
  });
  const unique = new Map<string, Candidate>();

  for (const candidate of ranked) {
    const key = normalizedCandidateKey(candidate);
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, candidate);
      continue;
    }
    unique.set(key, {
      ...existing,
      public_work_email: existing.public_work_email ?? candidate.public_work_email,
      email_type: existing.email_type ?? candidate.email_type,
      public_profile_url: existing.public_profile_url ?? candidate.public_profile_url,
    });
  }

  return [...unique.values()].slice(0, 10).map((candidate, index) => ({ ...candidate, is_primary: index === 0 }));
}

export async function researchDecisionMakers(lead: Lead): Promise<DecisionMakerResearchResult> {
  const baseUrl = normalizePublicWebsiteUrl(lead.website);
  const warnings: string[] = [];
  const researchedUrls: string[] = [];
  const candidates: Candidate[] = [];
  let websiteAvailable = false;
  let whatsapp: DecisionMakerResearchResult["whatsapp"] = { status: "not_checked" };

  if (baseUrl) {
    const fixedUrls = RESEARCH_PATHS.map((path) => new URL(path, baseUrl).toString());
    const targets = [baseUrl.toString(), ...fixedUrls];

    for (let index = 0; index < targets.length && index < MAX_WEBSITE_PAGES; index += 1) {
      const target = targets[index];
      try {
        const page = await fetchPublicWebPage(target, {
          timeoutMs: 8_000,
          maxBytes: 350_000,
          maxRedirects: 3,
          userAgent: "LeadHunter/1.0 DecisionMakerResearch",
        });
        websiteAvailable = true;
        researchedUrls.push(page.url);
        candidates.push(...structuredCandidates(page.html, page.url), ...visibleCandidates(page.html, page.url));
        whatsapp = whatsapp.status === "not_checked" ? whatsappEvidence(page.html, page.url) ?? whatsapp : whatsapp;

        if (index === 0) {
          const dynamicUrls = discoverResearchLinks(baseUrl, page.html).filter((url) => !targets.includes(url));
          targets.splice(1, 0, ...dynamicUrls);
        }
      } catch {
        continue;
      }
    }
  }

  const serperKey = publicSearchConfig();
  let searchAvailable = false;
  if (serperKey) {
    try {
      searchAvailable = true;
      const results = await serperSearch(`"${lead.company_name}" owner founder manager`, serperKey);
      candidates.push(...results.map((item) => searchCandidate(item, lead)).filter((item): item is Candidate => Boolean(item)));
    } catch {
      warnings.push("Website research completed, but public search was unavailable.");
    }
  }

  if (whatsapp.status === "not_checked" && websiteAvailable) {
    whatsapp = { status: "not_found" };
  }

  return {
    candidates: dedupeAndRank(lead, candidates),
    researchedUrls,
    warnings,
    websiteAvailable,
    searchAvailable,
    whatsapp,
  };
}
