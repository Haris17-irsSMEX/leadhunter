import { isSafePublicEmail } from "@/lib/email-safety";
import type { Lead } from "@/lib/types";

export type LeadExportFilter =
  | "all"
  | "has_public_email"
  | "any_delivery_found"
  | "ubereats_found"
  | "doordash_found"
  | "grubhub_found"
  | "deliveroo_found"
  | "justeat_found"
  | "ubereats_or_doordash_found";

export const LEAD_EXPORT_FILTERS: LeadExportFilter[] = [
  "all",
  "has_public_email",
  "any_delivery_found",
  "ubereats_found",
  "doordash_found",
  "grubhub_found",
  "deliveroo_found",
  "justeat_found",
  "ubereats_or_doordash_found",
];

export function normalizeLeadExportFilter(value: unknown): LeadExportFilter {
  return LEAD_EXPORT_FILTERS.includes(value as LeadExportFilter) ? (value as LeadExportFilter) : "all";
}

export function leadMatchesExportFilter(lead: Lead, filter: LeadExportFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "has_public_email") {
    return isSafePublicEmail(lead.email);
  }

  if (filter === "ubereats_found") {
    return lead.delivery_ubereats_status === "found";
  }

  if (filter === "doordash_found") {
    return lead.delivery_doordash_status === "found";
  }

  if (filter === "grubhub_found") {
    return lead.delivery_grubhub_status === "found";
  }

  if (filter === "deliveroo_found") {
    return lead.delivery_deliveroo_status === "found";
  }

  if (filter === "justeat_found") {
    return lead.delivery_justeat_status === "found";
  }

  if (filter === "ubereats_or_doordash_found") {
    return lead.delivery_ubereats_status === "found" || lead.delivery_doordash_status === "found";
  }

  return (
    lead.delivery_ubereats_status === "found" ||
    lead.delivery_doordash_status === "found" ||
    lead.delivery_grubhub_status === "found" ||
    lead.delivery_deliveroo_status === "found" ||
    lead.delivery_justeat_status === "found"
  );
}

export function applyLeadExportFilter(leads: Lead[], filter: LeadExportFilter) {
  return filter === "all" ? leads : leads.filter((lead) => leadMatchesExportFilter(lead, filter));
}
