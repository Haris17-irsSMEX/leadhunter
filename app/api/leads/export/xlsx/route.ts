import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { attachDecisionMakers } from "@/lib/decision-maker-db";
import { getSupabaseServiceClient } from "@/lib/db";
import { buildGoogleSheetsTable } from "@/lib/google-sheets-schema";
import { applyLeadExportFilter, normalizeLeadExportFilter } from "@/lib/lead-export-filters";
import { resolveLeadExportScope } from "@/lib/lead-export-scope";
import { logWorkflowEvent } from "@/lib/operational-errors";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";

function exportFilename(label: string) {
  return `leadhunter-${label}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const excelColumnWidths: Record<string, number> = {
  "Business Name": 32,
  Website: 30,
  "Best Contact Method": 22,
  "Business Email": 30,
  "Email Source": 34,
  Phone: 18,
  "Contact Page URL": 34,
  "Contact Person Name": 26,
  "Contact Person Role": 22,
  "Public Profile / Evidence": 36,
  Location: 38,
  "Scraped At": 22,
  "Delivery Platforms Found": 34,
  "Uber Eats": 36,
  DoorDash: 36,
  Grubhub: 36,
  Deliveroo: 36,
  "Just Eat": 36,
};

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const exportFilter = normalizeLeadExportFilter(request.nextUrl.searchParams.get("export_filter"));
    const supabase = getSupabaseServiceClient();
    const exportScope = await resolveLeadExportScope({ requestUrl: request.nextUrl, supabase, user });

    const filtered = applyLeadExportFilter(exportScope.leads as Lead[], exportFilter);
    if (!filtered.length && exportFilter !== "all") {
      return NextResponse.json({ error: "No leads match this export filter." }, { status: 404 });
    }

    const leads = await attachDecisionMakers(filtered);
    const table = buildGoogleSheetsTable(leads);
    logWorkflowEvent("lead-export", "xlsx generated", {
      schema: table.headers.length > 12 ? "business-contact-delivery-dynamic" : "business-contact-12-column",
      scope: exportScope.scope,
      rows: table.rows.length,
      columns: table.headers.length,
    });
    const worksheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);

    table.headers.forEach((_, index) => {
      const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: index })];
      if (cell) {
        cell.s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1463FF" } },
        };
      }
    });

    table.columns.forEach((column, columnIndex) => {
      if (!column.hyperlink) return;
      table.rows.forEach((row, rowIndex) => {
        const value = row[columnIndex];
        if (!value || !isHttpUrl(value)) return;
        const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex })];
        if (cell) {
          cell.t = "s";
          cell.l = { Target: value };
        }
      });
    });

    worksheet["!cols"] = table.columns.map((column, index) => {
      const contentWidth = table.rows.reduce(
        (max, row) => Math.max(max, String(row[index] ?? "").length),
        column.header.length,
      );
      return { wch: Math.min(48, Math.max(excelColumnWidths[column.header] ?? 22, contentWidth + 2)) };
    });
    worksheet["!autofilter"] = {
      ref: worksheet["!ref"] ?? `A1:${XLSX.utils.encode_col(table.headers.length - 1)}1`,
    };
    worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer", cellStyles: true }) as Buffer;
    const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportFilename(exportScope.label)}"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Lead Excel export failed.");
  }
}
