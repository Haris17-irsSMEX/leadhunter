import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { attachDecisionMakers } from "@/lib/decision-maker-db";
import { getSupabaseServiceClient } from "@/lib/db";
import { buildLeadExportTable, normalizeLeadExportProfile } from "@/lib/lead-export";
import { applyLeadExportFilter, normalizeLeadExportFilter } from "@/lib/lead-export-filters";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";

function exportFilename() {
  return `leadhunter-leads-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
    const exportFilter = normalizeLeadExportFilter(request.nextUrl.searchParams.get("export_filter"));
    const profile = normalizeLeadExportProfile(request.nextUrl.searchParams.get("profile"));
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

    if (ids?.length) query = query.in("id", ids);
    if (jobId) query = query.eq("job_id", jobId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const filtered = applyLeadExportFilter((data ?? []) as Lead[], exportFilter);
    if (!filtered.length && exportFilter !== "all") {
      return NextResponse.json({ error: "No leads match this export filter." }, { status: 404 });
    }

    const leads = await attachDecisionMakers(filtered);
    const table = buildLeadExportTable(leads, profile);
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
        column.label.length,
      );
      return { wch: Math.min(48, Math.max(column.width, contentWidth + 2)) };
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
        "Content-Disposition": `attachment; filename="${exportFilename()}"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Lead Excel export failed.");
  }
}
