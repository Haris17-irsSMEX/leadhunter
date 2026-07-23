import { cleanSafePublicEmail } from "@/lib/email-safety";
import type { Lead } from "@/lib/types";

export type BestContactMethod = "Email" | "Contact form" | "Phone" | "Website only" | "Not contactable";
export type ContactabilityStatus = "Contactable" | "Weak" | "Not contactable";
export type ContactFilter =
  | "all"
  | "contactable"
  | "email_found"
  | "contact_page_found"
  | "phone_found"
  | "no_public_email"
  | "not_contactable";

const CONTACT_PAGE_KEYS = [
  "contact_page_url",
  "contactPageUrl",
  "contact_url",
  "contactUrl",
  "detected_contact_page_url",
  "website_contact_url",
];

export const CONTACT_FILTERS: ContactFilter[] = [
  "all",
  "contactable",
  "email_found",
  "contact_page_found",
  "phone_found",
  "no_public_email",
  "not_contactable",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function findContactUrlInRecord(record: Record<string, unknown>): string | null {
  for (const key of CONTACT_PAGE_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  for (const nestedKey of ["contact_enrichment", "restaurant_enrichment", "email_enrichment"]) {
    const nested = record[nestedKey];
    if (isRecord(nested)) {
      const nestedUrl = findContactUrlInRecord(nested);
      if (nestedUrl) {
        return nestedUrl;
      }
    }
  }

  return null;
}

export function getContactPageUrl(lead: Lead) {
  return lead.raw_metadata && isRecord(lead.raw_metadata) ? findContactUrlInRecord(lead.raw_metadata) : null;
}

export function getBestContactMethod(lead: Lead): BestContactMethod {
  if (cleanSafePublicEmail(lead.email)) {
    return "Email";
  }

  if (getContactPageUrl(lead)) {
    return "Contact form";
  }

  if (lead.phone?.trim()) {
    return "Phone";
  }

  if (lead.website?.trim()) {
    return "Website only";
  }

  return "Not contactable";
}

export function getContactabilityStatus(lead: Lead): ContactabilityStatus {
  if (cleanSafePublicEmail(lead.email) || getContactPageUrl(lead) || lead.phone?.trim()) {
    return "Contactable";
  }

  if (lead.website?.trim()) {
    return "Weak";
  }

  return "Not contactable";
}

export function normalizeContactFilter(value: unknown): ContactFilter {
  return CONTACT_FILTERS.includes(value as ContactFilter) ? (value as ContactFilter) : "all";
}

export function leadMatchesContactFilter(lead: Lead, filter: ContactFilter) {
  if (filter === "all") {
    return true;
  }

  const email = cleanSafePublicEmail(lead.email);
  const contactPage = getContactPageUrl(lead);
  const phone = lead.phone?.trim();

  if (filter === "contactable") {
    return Boolean(email || contactPage || phone);
  }

  if (filter === "email_found") {
    return Boolean(email);
  }

  if (filter === "contact_page_found") {
    return Boolean(contactPage);
  }

  if (filter === "phone_found") {
    return Boolean(phone);
  }

  if (filter === "no_public_email") {
    return !email;
  }

  return !email && !contactPage && !phone && !lead.website?.trim();
}
