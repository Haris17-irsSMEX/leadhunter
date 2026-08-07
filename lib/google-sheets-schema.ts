import { getContactPageUrl } from "@/lib/contactability";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import { LeadExportValidationError, cleanExportText } from "@/lib/lead-export";
import { getOutreachIntelligence, getPrimaryDecisionMaker } from "@/lib/outreach-intelligence";
import {
  getRestaurantExportPlatforms,
  getRestaurantDeliverySummary,
  getRestaurantPlatformExportValue,
} from "@/lib/restaurant-delivery";
import { safeSpreadsheetCell } from "@/lib/spreadsheet-safety";
import type { Lead } from "@/lib/types";
import { normalizePublicHttpUrl } from "@/lib/urls";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

export type GoogleSheetsWrapStrategy = "CLIP" | "WRAP";

export type GoogleSheetsColumn = {
  key:
    | "business_name"
    | "website"
    | "best_contact_method"
    | "business_email"
    | "email_source"
    | "phone"
    | "contact_page_url"
    | "contact_person_name"
    | "contact_person_role"
    | "public_profile_evidence"
    | "location"
    | "scraped_at"
    | "delivery_platforms_found"
    | "delivery_ubereats"
    | "delivery_doordash"
    | "delivery_grubhub"
    | "delivery_deliveroo"
    | "delivery_justeat";
  header: string;
  width: number;
  wrapStrategy: GoogleSheetsWrapStrategy;
  hyperlink?: boolean;
  plainText?: boolean;
  value: (lead: Lead) => string;
};

function cleanSheetsUrl(value?: string | null, allowMissingProtocol = false) {
  const candidate = value?.trim();
  if (!candidate || (!allowMissingProtocol && !/^https?:\/\//i.test(candidate))) return "";

  try {
    const normalized = normalizePublicHttpUrl(candidate);
    const hostname = new URL(normalized).hostname.toLowerCase();
    if (
      hostname === "metadata.google.internal" ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".localhost")
    ) {
      return "";
    }
    return normalized;
  } catch {
    return "";
  }
}

function cleanBestContactMethod(lead: Lead) {
  const method = getOutreachIntelligence(lead).bestContactMethod;
  if (method === "Decision-maker email") return "Business email";
  if (method === "Website only") return "Website";
  if (method === "Not currently contactable") return "Needs research";
  return method;
}

function formatScrapedAt(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

function primaryContactPerson(lead: Lead) {
  return getPrimaryDecisionMaker(lead);
}

function contactPersonEvidence(lead: Lead) {
  const candidate = primaryContactPerson(lead);
  if (!candidate) return "";
  return (
    cleanSheetsUrl(candidate.public_profile_url) ||
    cleanSheetsUrl(candidate.source_url)
  );
}

export const GOOGLE_SHEETS_COLUMNS: readonly GoogleSheetsColumn[] = [
  {
    key: "business_name",
    header: "Business Name",
    width: 280,
    wrapStrategy: "WRAP",
    value: (lead) => cleanExportText(lead.company_name),
  },
  {
    key: "website",
    header: "Website",
    width: 240,
    wrapStrategy: "CLIP",
    hyperlink: true,
    value: (lead) => cleanSheetsUrl(lead.website, true),
  },
  {
    key: "best_contact_method",
    header: "Best Contact Method",
    width: 190,
    wrapStrategy: "CLIP",
    value: cleanBestContactMethod,
  },
  {
    key: "business_email",
    header: "Business Email",
    width: 240,
    wrapStrategy: "CLIP",
    value: (lead) => cleanSafePublicEmail(lead.email),
  },
  {
    key: "email_source",
    header: "Email Source",
    width: 260,
    wrapStrategy: "CLIP",
    hyperlink: true,
    value: (lead) => (cleanSafePublicEmail(lead.email) ? cleanSheetsUrl(lead.email_source_url) : ""),
  },
  {
    key: "phone",
    header: "Phone",
    width: 155,
    wrapStrategy: "CLIP",
    plainText: true,
    value: (lead) => cleanExportText(lead.phone),
  },
  {
    key: "contact_page_url",
    header: "Contact Page URL",
    width: 270,
    wrapStrategy: "CLIP",
    hyperlink: true,
    value: (lead) => cleanSheetsUrl(getContactPageUrl(lead)),
  },
  {
    key: "contact_person_name",
    header: "Contact Person Name",
    width: 210,
    wrapStrategy: "WRAP",
    value: (lead) => cleanExportText(primaryContactPerson(lead)?.name),
  },
  {
    key: "contact_person_role",
    header: "Contact Person Role",
    width: 180,
    wrapStrategy: "WRAP",
    value: (lead) => cleanExportText(primaryContactPerson(lead)?.role),
  },
  {
    key: "public_profile_evidence",
    header: "Public Profile / Evidence",
    width: 290,
    wrapStrategy: "CLIP",
    hyperlink: true,
    value: contactPersonEvidence,
  },
  {
    key: "location",
    header: "Location",
    width: 320,
    wrapStrategy: "WRAP",
    value: (lead) => cleanExportText(lead.location),
  },
  {
    key: "scraped_at",
    header: "Scraped At",
    width: 175,
    wrapStrategy: "CLIP",
    value: (lead) => formatScrapedAt(lead.scraped_at),
  },
];

export const RESTAURANT_DELIVERY_COLUMNS: readonly GoogleSheetsColumn[] = [
  {
    key: "delivery_platforms_found",
    header: "Delivery Platforms Found",
    width: 270,
    wrapStrategy: "WRAP",
    value: getRestaurantDeliverySummary,
  },
  {
    key: "delivery_ubereats",
    header: "Uber Eats",
    width: 280,
    wrapStrategy: "CLIP",
    hyperlink: true,
    value: (lead) => getRestaurantPlatformExportValue(lead, "ubereats"),
  },
  {
    key: "delivery_doordash",
    header: "DoorDash",
    width: 280,
    wrapStrategy: "CLIP",
    hyperlink: true,
    value: (lead) => getRestaurantPlatformExportValue(lead, "doordash"),
  },
  {
    key: "delivery_grubhub",
    header: "Grubhub",
    width: 280,
    wrapStrategy: "CLIP",
    hyperlink: true,
    value: (lead) => getRestaurantPlatformExportValue(lead, "grubhub"),
  },
  {
    key: "delivery_deliveroo",
    header: "Deliveroo",
    width: 280,
    wrapStrategy: "CLIP",
    hyperlink: true,
    value: (lead) => getRestaurantPlatformExportValue(lead, "deliveroo"),
  },
  {
    key: "delivery_justeat",
    header: "Just Eat",
    width: 280,
    wrapStrategy: "CLIP",
    hyperlink: true,
    value: (lead) => getRestaurantPlatformExportValue(lead, "justeat"),
  },
];

export function buildGoogleSheetsTable(leads: Lead[]) {
  if (leads.length > WORKLOAD_LIMITS.exports.maxRows) {
    throw new LeadExportValidationError(
      `Google Sheets sync is limited to ${WORKLOAD_LIMITS.exports.maxRows.toLocaleString()} leads per request.`,
    );
  }

  const restaurantPlatforms = getRestaurantExportPlatforms(leads);
  const deliveryColumns = RESTAURANT_DELIVERY_COLUMNS.filter(
    (column) =>
      column.key === "delivery_platforms_found" ||
      restaurantPlatforms.some((platform) => column.key === `delivery_${platform}`),
  );
  const columns = restaurantPlatforms.length
    ? [...GOOGLE_SHEETS_COLUMNS.slice(0, 10), ...deliveryColumns, ...GOOGLE_SHEETS_COLUMNS.slice(10)]
    : [...GOOGLE_SHEETS_COLUMNS];
  const headers = columns.map((column) => column.header);
  if (
    GOOGLE_SHEETS_COLUMNS.length !== 12 ||
    RESTAURANT_DELIVERY_COLUMNS.length !== 6 ||
    !(columns.length === 12 || (columns.length >= 14 && columns.length <= 18)) ||
    new Set(headers).size !== headers.length
  ) {
    throw new LeadExportValidationError("The Google Sheets schema could not be generated safely.");
  }

  const rows = leads.map((lead) =>
    columns.map((column) =>
      safeSpreadsheetCell(column.value(lead), WORKLOAD_LIMITS.exports.maxCellLength),
    ),
  );

  if (rows.some((row) => row.length !== headers.length || row.some((value) => typeof value !== "string"))) {
    throw new LeadExportValidationError("The Google Sheets rows could not be generated safely.");
  }

  return {
    columns,
    headers,
    rows,
  };
}
