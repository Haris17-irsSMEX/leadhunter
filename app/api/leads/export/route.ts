import { NextRequest, NextResponse } from "next/server";
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
  return `leadhunter-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
}

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

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
    logWorkflowEvent("lead-export", "csv generated", {
      schema: table.headers.length === 18 ? "business-contact-delivery-18-column" : "business-contact-12-column",
      scope: exportScope.scope,
      rows: table.rows.length,
      columns: table.headers.length,
    });
    const csv = `\uFEFF${[table.headers, ...table.rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n")}`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(exportScope.label)}"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Lead CSV export failed.");
  }
}
