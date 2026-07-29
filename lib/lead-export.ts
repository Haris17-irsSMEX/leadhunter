import { getContactabilityStatus, getContactPageUrl } from "@/lib/contactability";
import { deliveryStatusLabelForLead } from "@/lib/delivery-status-label";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import { hasMeaningfulRestaurantIntelligence } from "@/lib/lead-kind";
import {
  classifyPublicEmail,
  getOutreachIntelligence,
  getPrimaryDecisionMaker,
} from "@/lib/outreach-intelligence";
import type { Lead } from "@/lib/types";

export type LeadExportProfile = "standard" | "outreach_ready";
export type LeadExportColumn = {
  label: string;
  width: number;
  hyperlink?: boolean;
  value: (lead: Lead) => string;
};

export function normalizeLeadExportProfile(value: unknown): LeadExportProfile {
  return value === "outreach_ready" ? "outreach_ready" : "standard";
}

export function cleanExportText(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return value?.trim() ?? "";
}

function cleanNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
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

function restaurantEnrichmentLabel(value: Lead["restaurant_enrichment_status"]) {
  if (value === "completed") return "Completed";
  if (value === "partial") return "Partial";
  if (value === "error") return "Error";
  if (value === "not_checked") return "Not checked";
  return "";
}

function whatsappLabel(lead: Lead) {
  if (lead.public_whatsapp_status === "confirmed_public") return "Confirmed public";
  if (lead.public_whatsapp_status === "possible") return "Possible";
  if (lead.public_whatsapp_status === "not_found") return "Not found";
  if (lead.public_whatsapp_status === "error") return "Error";
  return "Not checked";
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

const standardBeforeRestaurant: LeadExportColumn[] = [
  { label: "Company Name", width: 28, value: (lead) => cleanExportText(lead.company_name) },
  { label: "Website", width: 32, hyperlink: true, value: (lead) => cleanExportText(lead.website) },
  { label: "Best Contact Method", width: 22, value: (lead) => getOutreachIntelligence(lead).bestContactMethod },
  { label: "Contactability", width: 18, value: (lead) => getContactabilityStatus(lead) },
  { label: "Email", width: 28, value: (lead) => cleanSafePublicEmail(lead.email) },
  { label: "Email Source", width: 32, hyperlink: true, value: (lead) => (cleanSafePublicEmail(lead.email) ? cleanExportText(lead.email_source_url) : "") },
  { label: "Email Confidence", width: 18, value: (lead) => (cleanSafePublicEmail(lead.email) ? cleanNumber(lead.email_confidence) : "") },
  { label: "Contact Page URL", width: 34, hyperlink: true, value: (lead) => cleanExportText(getContactPageUrl(lead)) },
  { label: "Phone", width: 18, value: (lead) => cleanExportText(lead.phone) },
  { label: "Location", width: 32, value: (lead) => cleanExportText(lead.location) },
  { label: "Country", width: 18, value: (lead) => cleanExportText(lead.country) },
  { label: "Industry", width: 28, value: (lead) => cleanExportText(lead.industry) },
];

const standardAfterRestaurant: LeadExportColumn[] = [
  { label: "Description", width: 42, value: (lead) => cleanExportText(lead.description) },
  { label: "Founder Name", width: 24, value: (lead) => cleanExportText(lead.founder_name) },
  { label: "LinkedIn", width: 32, hyperlink: true, value: (lead) => cleanExportText(lead.linkedin_url) },
  { label: "Twitter", width: 22, value: (lead) => cleanExportText(lead.twitter_handle) },
  { label: "Employee Count", width: 18, value: (lead) => cleanExportText(lead.employee_count) },
  { label: "Pricing", width: 18, value: (lead) => cleanExportText(lead.pricing_model) },
  { label: "Tech Stack", width: 30, value: (lead) => cleanExportText(lead.tech_stack) },
  { label: "Source", width: 18, value: (lead) => sourceLabel(lead.source) },
  { label: "Source URL", width: 36, hyperlink: true, value: (lead) => cleanExportText(lead.source_url) },
  { label: "Scraped At", width: 22, value: (lead) => formatDate(lead.scraped_at) },
];

const outreachColumns: LeadExportColumn[] = [
  { label: "Business Name", width: 28, value: (lead) => cleanExportText(lead.company_name) },
  { label: "Category", width: 28, value: (lead) => cleanExportText(lead.industry) },
  { label: "City", width: 20, value: (lead) => cleanExportText(lead.location?.split(",")[0]) },
  { label: "Address", width: 34, value: (lead) => cleanExportText(lead.location) },
  { label: "Website", width: 32, hyperlink: true, value: (lead) => cleanExportText(lead.website) },
  { label: "Website Status", width: 18, value: (lead) => (lead.website?.trim() ? "Website available" : "No website listed") },
  { label: "Business Phone", width: 18, value: (lead) => cleanExportText(lead.phone) },
  { label: "Public Email", width: 28, value: (lead) => cleanSafePublicEmail(lead.email) },
  { label: "Email Type", width: 22, value: (lead) => classifyPublicEmail(lead.email) ?? "" },
  { label: "Contact Page", width: 34, hyperlink: true, value: (lead) => cleanExportText(getContactPageUrl(lead)) },
  { label: "Best Contact Method", width: 22, value: (lead) => getOutreachIntelligence(lead).bestContactMethod },
  { label: "Public Business WhatsApp", width: 32, hyperlink: true, value: (lead) => cleanExportText(lead.public_whatsapp_url) },
  { label: "WhatsApp Status", width: 20, value: whatsappLabel },
  { label: "Decision-Maker Name", width: 24, value: (lead) => cleanExportText(getPrimaryDecisionMaker(lead)?.name) },
  { label: "Decision-Maker Role", width: 24, value: (lead) => cleanExportText(getPrimaryDecisionMaker(lead)?.role) },
  { label: "Decision-Maker Work Email", width: 30, value: (lead) => cleanSafePublicEmail(getPrimaryDecisionMaker(lead)?.public_work_email) },
  { label: "Decision-Maker Email Type", width: 24, value: (lead) => cleanExportText(getPrimaryDecisionMaker(lead)?.email_type) },
  { label: "Public Profile", width: 34, hyperlink: true, value: (lead) => cleanExportText(getPrimaryDecisionMaker(lead)?.public_profile_url) },
  { label: "Decision-Maker Confidence", width: 22, value: (lead) => cleanExportText(getPrimaryDecisionMaker(lead)?.confidence) },
  { label: "Verification Status", width: 22, value: (lead) => cleanExportText(getPrimaryDecisionMaker(lead)?.verification_status) },
  { label: "Evidence Source", width: 34, hyperlink: true, value: (lead) => cleanExportText(getPrimaryDecisionMaker(lead)?.source_url) },
  { label: "Opportunity Reason", width: 42, value: (lead) => getOutreachIntelligence(lead).opportunitySignals.join(" ") },
  { label: "Suggested Outreach Angle", width: 48, value: (lead) => getOutreachIntelligence(lead).suggestedAngle },
  { label: "Outreach Readiness Score", width: 24, value: (lead) => String(getOutreachIntelligence(lead).readinessScore) },
  { label: "Outreach Readiness Status", width: 26, value: (lead) => getOutreachIntelligence(lead).readinessStatus },
  { label: "Source", width: 18, value: (lead) => sourceLabel(lead.source) },
  { label: "Last Checked", width: 22, value: (lead) => formatDate(lead.decision_maker_last_checked_at ?? lead.scraped_at) },
];

export function getLeadExportColumns(leads: Lead[], profile: LeadExportProfile): LeadExportColumn[] {
  const includeRestaurant = leads.some(hasMeaningfulRestaurantIntelligence);
  if (profile === "outreach_ready") {
    return includeRestaurant ? [...outreachColumns, ...restaurantColumns] : outreachColumns;
  }
  return includeRestaurant
    ? [...standardBeforeRestaurant, ...restaurantColumns, ...standardAfterRestaurant]
    : [...standardBeforeRestaurant, ...standardAfterRestaurant];
}

export function buildLeadExportTable(leads: Lead[], profile: LeadExportProfile) {
  const columns = getLeadExportColumns(leads, profile);
  return {
    columns,
    headers: columns.map((column) => column.label),
    rows: leads.map((lead) => columns.map((column) => column.value(lead))),
  };
}
