import type { DecisionMaker } from "@/lib/types";

const NON_PERSON_PHRASES = new Set([
  "about",
  "agency",
  "blog",
  "branding",
  "careers",
  "case studies",
  "clinic",
  "company",
  "consulting",
  "contact",
  "dentist",
  "digital marketing",
  "home",
  "leadership",
  "management",
  "marketing services",
  "menu",
  "off site seo",
  "our team",
  "portfolio",
  "pricing",
  "privacy policy",
  "real estate",
  "restaurant",
  "results",
  "seo",
  "service",
  "services",
  "sitemap",
  "strategy",
  "team",
  "terms",
  "testimonials",
  "web design",
]);

const NON_PERSON_TOKENS = new Set([
  "agency",
  "branding",
  "clinic",
  "company",
  "consulting",
  "contact",
  "dentist",
  "design",
  "digital",
  "group",
  "inc",
  "leadership",
  "llc",
  "ltd",
  "management",
  "marketing",
  "portfolio",
  "restaurant",
  "seo",
  "service",
  "services",
  "strategy",
  "team",
]);

const VALID_ROLES = new Set([
  "broker",
  "broker owner",
  "business development manager",
  "ceo",
  "chief executive officer",
  "co founder",
  "director",
  "founder",
  "general manager",
  "head of growth",
  "location manager",
  "managing broker",
  "managing director",
  "marketing director",
  "marketing manager",
  "office manager",
  "operations manager",
  "owner",
  "partner",
  "practice manager",
  "president",
  "principal",
  "sales director",
]);

function normalizeWords(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[’']/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[_/]+/g, " ")
    .replace(/[^\p{L}\p{M}\s'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeRole(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[’']/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\bbroker\s*\/\s*owner\b/gi, "broker owner")
    .replace(/\bco[-\s]?founder\b/gi, "co founder")
    .replace(/[.&]/g, " ")
    .replace(/[^\p{L}\p{M}\s-]+/gu, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isPublicEvidenceUrl(value?: string | null) {
  if (!value?.trim()) return false;

  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isLikelyHumanName(value: string, companyName?: string | null) {
  const name = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (name.length < 4 || name.length > 90) return false;
  if (/[_@]|\bhttps?:|www\.|[\\/]|[\d]/i.test(name)) return false;
  if (/[,:;|()[\]{}!?=+*#$%^~`]/.test(name)) return false;

  const normalized = normalizeWords(name);
  if (!normalized || NON_PERSON_PHRASES.has(normalized)) return false;
  const paddedNormalized = ` ${normalized} `;
  if ([...NON_PERSON_PHRASES].some((phrase) => paddedNormalized.includes(` ${phrase} `))) return false;

  const normalizedCompany = companyName ? normalizeWords(companyName) : "";
  if (normalizedCompany && normalized === normalizedCompany) return false;

  const words = name.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;

  let fullNameParts = 0;
  for (const word of words) {
    const isInitial = /^\p{Lu}\.$/u.test(word);
    const isNamePart = /^\p{Lu}[\p{L}\p{M}]*(?:['-]\p{Lu}?[\p{L}\p{M}]+)*$/u.test(word);
    const isAllCapsNamePart = /^\p{Lu}{2,}$/u.test(word);
    if (!isInitial && !isNamePart && !isAllCapsNamePart) return false;
    if (!isInitial) fullNameParts += 1;
  }

  if (fullNameParts < 2) return false;
  const normalizedTokens = normalized.split(" ");
  return !normalizedTokens.some((token) => NON_PERSON_TOKENS.has(token));
}

export function isLikelyDecisionMakerRole(value: string) {
  const normalized = normalizeRole(value);
  if (!normalized) return false;
  if (VALID_ROLES.has(normalized)) return true;

  const roleParts = value
    .split(/\s*(?:&|,|\band\b)\s*/i)
    .map(normalizeRole)
    .filter(Boolean);
  return roleParts.length > 1 && roleParts.every((role) => VALID_ROLES.has(role));
}

export function isUsableDecisionMakerCandidate(
  candidate: Pick<DecisionMaker, "name" | "role" | "source_url" | "verification_status">,
  companyName?: string | null,
) {
  if (candidate.verification_status === "rejected") return false;
  if (candidate.verification_status === "manually_verified") return true;

  return (
    isLikelyHumanName(candidate.name, companyName) &&
    isLikelyDecisionMakerRole(candidate.role) &&
    isPublicEvidenceUrl(candidate.source_url)
  );
}
