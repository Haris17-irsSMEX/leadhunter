import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/db";
import { deliveryStatusLabelForLead } from "@/lib/delivery-status-label";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import { applyLeadExportFilter, normalizeLeadExportFilter } from "@/lib/lead-export-filters";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";

type ExportColumn = {
  label: string;
  value: (lead: Lead) => string;
};

const EXPORT_COLUMNS: ExportColumn[] = [
  { label: "Company Name", value: (lead) => cleanText(lead.company_name) },
  { label: "Website", value: (lead) => cleanText(lead.website) },
  { label: "Email", value: (lead) => cleanSafePublicEmail(lead.email) },
  { label: "Email Source", value: (lead) => (cleanSafePublicEmail(lead.email) ? cleanText(lead.email_source_url) : "") },
  { label: "Email Confidence", value: (lead) => (cleanSafePublicEmail(lead.email) ? cleanNumber(lead.email_confidence) : "") },
  { label: "Phone", value: (lead) => cleanText(lead.phone) },
  { label: "Location", value: (lead) => cleanText(lead.location) },
  { label: "Country", value: (lead) => cleanText(lead.country) },
  { label: "Industry", value: (lead) => cleanText(lead.industry) },
  { label: "Uber Eats", value: (lead) => deliveryStatusLabelForLead(lead, "ubereats") },
  { label: "Uber Eats Menu URL", value: (lead) => cleanText(lead.delivery_ubereats_menu_url) },
  { label: "Uber Eats Confidence", value: (lead) => cleanNumber(lead.delivery_ubereats_confidence) },
  { label: "DoorDash", value: (lead) => deliveryStatusLabelForLead(lead, "doordash") },
  { label: "DoorDash Menu URL", value: (lead) => cleanText(lead.delivery_doordash_menu_url) },
  { label: "DoorDash Confidence", value: (lead) => cleanNumber(lead.delivery_doordash_confidence) },
  { label: "Grubhub", value: (lead) => deliveryStatusLabelForLead(lead, "grubhub") },
  { label: "Grubhub Menu URL", value: (lead) => cleanText(lead.delivery_grubhub_menu_url) },
  { label: "Grubhub Confidence", value: (lead) => cleanNumber(lead.delivery_grubhub_confidence) },
  { label: "Deliveroo", value: (lead) => deliveryStatusLabelForLead(lead, "deliveroo") },
  { label: "Deliveroo Menu URL", value: (lead) => cleanText(lead.delivery_deliveroo_menu_url) },
  { label: "Deliveroo Confidence", value: (lead) => cleanNumber(lead.delivery_deliveroo_confidence) },
  { label: "Just Eat", value: (lead) => deliveryStatusLabelForLead(lead, "justeat") },
  { label: "Just Eat Menu URL", value: (lead) => cleanText(lead.delivery_justeat_menu_url) },
  { label: "Just Eat Confidence", value: (lead) => cleanNumber(lead.delivery_justeat_confidence) },
  { label: "Restaurant Enrichment", value: (lead) => restaurantEnrichmentLabel(lead.restaurant_enrichment_status) },
  { label: "Description", value: (lead) => cleanText(lead.description) },
  { label: "Founder Name", value: (lead) => cleanText(lead.founder_name) },
  { label: "LinkedIn", value: (lead) => cleanText(lead.linkedin_url) },
  { label: "Twitter", value: (lead) => cleanText(lead.twitter_handle) },
  { label: "Employee Count", value: (lead) => cleanText(lead.employee_count) },
  { label: "Pricing", value: (lead) => cleanText(lead.pricing_model) },
  { label: "Tech Stack", value: (lead) => cleanText(lead.tech_stack) },
  { label: "Source", value: (lead) => sourceLabel(lead.source) },
  { label: "Source URL", value: (lead) => cleanText(lead.source_url) },
  { label: "Scraped At", value: (lead) => formatDate(lead.scraped_at) },
];

function cleanText(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }

  return value?.trim() ?? "";
}

function cleanNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function restaurantEnrichmentLabel(value: Lead["restaurant_enrichment_status"]) {
  const labels = {
    completed: "Completed",
    partial: "Partial",
    error: "Error",
    not_checked: "Not checked",
  };

  return value ? labels[value] : "";
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

  return labels[source] ?? cleanText(source);
}

function formatDate(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return cleanText(value);
  }

  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

function exportFilename(extension: "csv" | "xlsx") {
  return `leadhunter-leads-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function leadToCsvRow(lead: Lead) {
  return EXPORT_COLUMNS.map((column) => column.value(lead))
    .map(csvEscape)
    .join(",");
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const jobId = request.nextUrl.searchParams.get("job_id");
    const exportFilter = normalizeLeadExportFilter(request.nextUrl.searchParams.get("export_filter"));
    const ids = request.nextUrl.searchParams
      .get("ids")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const supabase = getSupabaseServiceClient();
    let query = supabase
      .from("leads")
      .select("*")
      .in("user_id", getAllowedUserIds(user))
      .order("scraped_at", { ascending: false });

    if (ids?.length) {
      query = query.in("id", ids);
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const leads = applyLeadExportFilter((data ?? []) as Lead[], exportFilter);

    if (!leads.length && exportFilter !== "all") {
      return NextResponse.json({ error: "No leads match this export filter." }, { status: 404 });
    }

    const csvHeaders = EXPORT_COLUMNS.map((column) => column.label).map(csvEscape).join(",");
    const csv = `\uFEFF${[csvHeaders, ...leads.map(leadToCsvRow)].join("\r\n")}`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename("csv")}"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Lead CSV export failed.");
  }
}
