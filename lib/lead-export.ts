import { getContactabilityStatus, getContactPageUrl } from "@/lib/contactability";
import { deliveryStatusLabelForLead } from "@/lib/delivery-status-label";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import { getCategorySummary } from "@/lib/lead-category";
import { hasMeaningfulRestaurantIntelligence } from "@/lib/lead-kind";
import {
  classifyPublicEmail,
  getOutreachIntelligence,
  getPrimaryDecisionMaker,
} from "@/lib/outreach-intelligence";
import type { Lead } from "@/lib/types";

export type LeadExportProfile = "standard" | "outreach_ready" | "restaurant_focused";
export type LeadExportColumn = {
  label: string;
  width: number;
  hyperlink?: boolean;
  value: (lead: Lead) => string;
};

export function normalizeLeadExportProfile(value: unknown): LeadExportProfile {
  if (value === "outreach_ready" || value === "restaurant_focused") return value;
  return "standard";
}

export function cleanExportText(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return value?.trim() ?? "";
}

function cleanNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function cleanEnumLabel(value?: string | null) {
  const normalized = value?.trim().replace(/[_-]+/g, " ");
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : "";
}

function cleanPublicUrl(value?: string | null) {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanExportText(value);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

function sourceLabel(source: Lead["source"]) {
  const labels: Record<Lead["source"], string> = {
    website: "Website",
    google_maps: "Google Maps",
    directory: "Directory",
    hackernews: "Hacker News",
    reddit: "Reddit",
    indiehackers: "Indie Hackers",
    producthunt: "Product Hunt",
  };
  return labels[source] ?? cleanExportText(source);
}

function customerSourceUrl(lead: Lead) {
  const sourceUrl = lead.source_url?.trim() ?? "";
  if (/^https?:\/\//i.test(sourceUrl)) return sourceUrl;

  if (lead.source === "google_maps") {
    const placeId =
      lead.source_external_id?.trim() ||
      (typeof lead.raw_metadata?.google_place_id === "string" ? lead.raw_metadata.google_place_id.trim() : "");
    if (placeId) {
      const query = [lead.company_name, lead.location].filter(Boolean).join(" ");
      const params = new URLSearchParams({ api: "1", query, query_place_id: placeId });
      return `https://www.google.com/maps/search/?${params.toString()}`;
    }
    return lead.website?.trim() ?? "";
  }

  return "";
}

function restaurantEnrichmentLabel(value: Lead["restaurant_enrichment_status"]) {
  if (value === "completed") return "Completed";
  if (value === "partial") return "Partial";
  if (value === "error") return "Error";
  if (value === "not_checked") return "Not checked";
  return "";
}

const restaurantColumns: LeadExportColumn[] = [
  { label: "Uber Eats", width: 18, value: (lead) => deliveryStatusLabelForLead(lead, "ubereats") },
  { label: "Uber Eats Menu URL", width: 36, hyperlink: true, value: (lead) => cleanExportText(lead.delivery_ubereats_menu_url) },
  { label: "Uber Eats Confidence", width: 22, value: (lead) => cleanNumber(lead.delivery_ubereats_confidence) },
  { label: "DoorDash", width: 18, value: (lead) => deliveryStatusLabelForLead(lead, "doordash") },
  { label: "DoorDash Menu URL", width: 36, hyperlink: true, value: (lead) => cleanExportText(lead.delivery_doordash_menu_url) },
  { label: "DoorDash Confidence", width: 22, value: (lead) => cleanNumber(lead.delivery_doordash_confidence) },
  { label: "Grubhub", width: 18, value: (lead) => deliveryStatusLabelForLead(lead, "grubhub") },
  { label: "Grubhub Menu URL", width: 36, hyperlink: true, value: (lead) => cleanExportText(lead.delivery_grubhub_menu_url) },
  { label: "Grubhub Confidence", width: 22, value: (lead) => cleanNumber(lead.delivery_grubhub_confidence) },
  { label: "Deliveroo", width: 18, value: (lead) => deliveryStatusLabelForLead(lead, "deliveroo") },
  { label: "Deliveroo Menu URL", width: 36, hyperlink: true, value: (lead) => cleanExportText(lead.delivery_deliveroo_menu_url) },
  { label: "Deliveroo Confidence", width: 22, value: (lead) => cleanNumber(lead.delivery_deliveroo_confidence) },
  { label: "Just Eat", width: 18, value: (lead) => deliveryStatusLabelForLead(lead, "justeat") },
  { label: "Just Eat Menu URL", width: 36, hyperlink: true, value: (lead) => cleanExportText(lead.delivery_justeat_menu_url) },
  { label: "Just Eat Confidence", width: 22, value: (lead) => cleanNumber(lead.delivery_justeat_confidence) },
  { label: "Restaurant Enrichment", width: 24, value: (lead) => restaurantEnrichmentLabel(lead.restaurant_enrichment_status) },
];

const standardColumns: LeadExportColumn[] = [
  { label: "Company Name", width: 28, value: (lead) => cleanExportText(lead.company_name) },
  { label: "Website", width: 32, hyperlink: true, value: (lead) => cleanExportText(lead.website) },
  { label: "Best Contact Method", width: 22, value: (lead) => getOutreachIntelligence(lead).bestContactMethod },
  { label: "Contactability", width: 18, value: (lead) => getContactabilityStatus(lead) },
  { label: "Public Email", width: 28, value: (lead) => cleanSafePublicEmail(lead.email) },
  { label: "Email Source", width: 32, hyperlink: true, value: (lead) => (cleanSafePublicEmail(lead.email) ? cleanExportText(lead.email_source_url) : "") },
  { label: "Email Confidence", width: 18, value: (lead) => (cleanSafePublicEmail(lead.email) ? cleanNumber(lead.email_confidence) : "") },
  { label: "Contact Page URL", width: 34, hyperlink: true, value: (lead) => cleanExportText(getContactPageUrl(lead)) },
  { label: "Phone", width: 18, value: (lead) => cleanExportText(lead.phone) },
  { label: "Location", width: 32, value: (lead) => cleanExportText(lead.location) },
  { label: "Category", width: 28, value: (lead) => getCategorySummary(lead.industry) },
  { label: "Source", width: 18, value: (lead) => sourceLabel(lead.source) },
  { label: "Scraped At", width: 22, value: (lead) => formatDate(lead.scraped_at) },
];

const outreachColumns: LeadExportColumn[] = [
  { label: "Company Name", width: 28, value: (lead) => cleanExportText(lead.company_name) },
  { label: "Website", width: 32, hyperlink: true, value: (lead) => cleanExportText(lead.website) },
  { label: "Phone", width: 18, value: (lead) => cleanExportText(lead.phone) },
  { label: "Location", width: 34, value: (lead) => cleanExportText(lead.location) },
  { label: "Public Email", width: 28, value: (lead) => cleanSafePublicEmail(lead.email) },
  { label: "Email Type", width: 22, value: (lead) => cleanEnumLabel(classifyPublicEmail(lead.email)) },
  { label: "Contact Page URL", width: 34, hyperlink: true, value: (lead) => cleanExportText(getContactPageUrl(lead)) },
  { label: "Best Contact Method", width: 22, value: (lead) => getOutreachIntelligence(lead).bestContactMethod },
  { label: "Decision-Maker Name", width: 24, value: (lead) => cleanExportText(getPrimaryDecisionMaker(lead)?.name) },
  { label: "Decision-Maker Role", width: 24, value: (lead) => cleanExportText(getPrimaryDecisionMaker(lead)?.role) },
  { label: "Decision-Maker Confidence", width: 22, value: (lead) => cleanEnumLabel(getPrimaryDecisionMaker(lead)?.confidence) },
  { label: "Verification Status", width: 22, value: (lead) => cleanEnumLabel(getPrimaryDecisionMaker(lead)?.verification_status) },
  {
    label: "Public Profile / Evidence URL",
    width: 38,
    hyperlink: true,
    value: (lead) =>
      cleanPublicUrl(
        getPrimaryDecisionMaker(lead)?.public_profile_url ?? getPrimaryDecisionMaker(lead)?.source_url,
      ),
  },
  { label: "Outreach Readiness Score", width: 24, value: (lead) => String(getOutreachIntelligence(lead).readinessScore) },
  { label: "Outreach Readiness Status", width: 26, value: (lead) => getOutreachIntelligence(lead).readinessStatus },
  { label: "Opportunity Reason", width: 42, value: (lead) => getOutreachIntelligence(lead).opportunitySignals.join(" ") },
  { label: "Suggested Outreach Angle", width: 48, value: (lead) => getOutreachIntelligence(lead).suggestedAngle },
  { label: "Source", width: 18, value: (lead) => sourceLabel(lead.source) },
  { label: "Scraped At", width: 22, value: (lead) => formatDate(lead.scraped_at) },
];

const restaurantFocusedColumns: LeadExportColumn[] = [
  ...standardColumns.slice(0, -2),
  ...restaurantColumns,
  { label: "Source", width: 18, value: (lead) => sourceLabel(lead.source) },
  { label: "Source URL", width: 38, hyperlink: true, value: customerSourceUrl },
  { label: "Scraped At", width: 22, value: (lead) => formatDate(lead.scraped_at) },
];

export function getLeadExportColumns(leads: Lead[], profile: LeadExportProfile): LeadExportColumn[] {
  if (profile === "outreach_ready") return outreachColumns;
  if (profile === "restaurant_focused" && leads.some(hasMeaningfulRestaurantIntelligence)) {
    return restaurantFocusedColumns;
  }
  return standardColumns;
}

export function buildLeadExportTable(leads: Lead[], profile: LeadExportProfile) {
  const columns = getLeadExportColumns(leads, profile);
  return {
    columns,
    headers: columns.map((column) => column.label),
    rows: leads.map((lead) => columns.map((column) => column.value(lead))),
  };
}
