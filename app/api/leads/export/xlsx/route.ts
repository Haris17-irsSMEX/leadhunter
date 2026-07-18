import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/db";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";

type ExportColumn = {
  label: string;
  value: (lead: Lead) => string;
  width: number;
  hyperlink?: boolean;
};

const EXPORT_COLUMNS: ExportColumn[] = [
  { label: "Company Name", value: (lead) => cleanText(lead.company_name), width: 28 },
  { label: "Website", value: (lead) => cleanText(lead.website), width: 32, hyperlink: true },
  { label: "Email", value: (lead) => cleanText(lead.email), width: 28 },
  { label: "Phone", value: (lead) => cleanText(lead.phone), width: 18 },
  { label: "Location", value: (lead) => cleanText(lead.location), width: 32 },
  { label: "Country", value: (lead) => cleanText(lead.country), width: 18 },
  { label: "Industry", value: (lead) => cleanText(lead.industry), width: 28 },
  { label: "Description", value: (lead) => cleanText(lead.description), width: 42 },
  { label: "Founder Name", value: (lead) => cleanText(lead.founder_name), width: 24 },
  { label: "LinkedIn", value: (lead) => cleanText(lead.linkedin_url), width: 32, hyperlink: true },
  { label: "Twitter", value: (lead) => cleanText(lead.twitter_handle), width: 22 },
  { label: "Employee Count", value: (lead) => cleanText(lead.employee_count), width: 18 },
  { label: "Pricing", value: (lead) => cleanText(lead.pricing_model), width: 18 },
  { label: "Tech Stack", value: (lead) => cleanText(lead.tech_stack), width: 30 },
  { label: "Source", value: (lead) => sourceLabel(lead.source), width: 18 },
  { label: "Source URL", value: (lead) => cleanText(lead.source_url), width: 36, hyperlink: true },
  { label: "Scraped At", value: (lead) => formatDate(lead.scraped_at), width: 22 },
];

function cleanText(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }

  return value?.trim() ?? "";
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

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const jobId = request.nextUrl.searchParams.get("job_id");
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

    const leads = (data ?? []) as Lead[];
    const headers = EXPORT_COLUMNS.map((column) => column.label);
    const rows = leads.map((lead) => EXPORT_COLUMNS.map((column) => column.value(lead)));
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    headers.forEach((_, index) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index });
      const cell = worksheet[cellAddress];
      if (cell) {
        cell.s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "7C5CFC" } },
        };
      }
    });

    EXPORT_COLUMNS.forEach((column, columnIndex) => {
      if (!column.hyperlink) {
        return;
      }

      rows.forEach((row, rowIndex) => {
        const value = row[columnIndex];
        if (!value || !isHttpUrl(value)) {
          return;
        }

        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex });
        const cell = worksheet[cellAddress];
        if (cell) {
          cell.t = "s";
          cell.l = { Target: value };
        }
      });
    });

    worksheet["!cols"] = EXPORT_COLUMNS.map((column, index) => {
      const maxContentLength = rows.reduce((max, row) => Math.max(max, String(row[index] ?? "").length), column.label.length);
      return { wch: Math.min(48, Math.max(column.width, maxContentLength + 2)) };
    });
    worksheet["!autofilter"] = { ref: worksheet["!ref"] ?? `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer", cellStyles: true }) as Buffer;
    const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportFilename("xlsx")}"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Lead Excel export failed.");
  }
}
