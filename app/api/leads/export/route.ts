import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { attachDecisionMakers } from "@/lib/decision-maker-db";
import { getSupabaseServiceClient } from "@/lib/db";
import { buildLeadExportTable, LeadExportValidationError, normalizeLeadExportProfile } from "@/lib/lead-export";
import { applyLeadExportFilter, normalizeLeadExportFilter } from "@/lib/lead-export-filters";
import { logWorkflowEvent } from "@/lib/operational-errors";
import type { Lead } from "@/lib/types";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

export const runtime = "nodejs";

function exportFilename() {
  return `leadhunter-leads-${new Date().toISOString().slice(0, 10)}.csv`;
}

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const jobId = request.nextUrl.searchParams.get("job_id");
    const exportFilter = normalizeLeadExportFilter(request.nextUrl.searchParams.get("export_filter"));
    const profile = normalizeLeadExportProfile(request.nextUrl.searchParams.get("profile"));
    const ids = [...new Set(
      request.nextUrl.searchParams
        .get("ids")
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean) ?? [],
    )];
    if (ids.length > WORKLOAD_LIMITS.exports.maxSelectedIds) {
      throw new LeadExportValidationError(
        `Select no more than ${WORKLOAD_LIMITS.exports.maxSelectedIds} leads per export.`,
      );
    }
    const supabase = getSupabaseServiceClient();
    let query = supabase
      .from("leads")
      .select("*")
      .in("user_id", getAllowedUserIds(user))
      .order("scraped_at", { ascending: false })
      .limit(WORKLOAD_LIMITS.exports.maxRows + 1);

    if (ids?.length) query = query.in("id", ids);
    if (jobId) query = query.eq("job_id", jobId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (ids.length && (data?.length ?? 0) !== ids.length) {
      return NextResponse.json({ error: "One or more selected leads could not be exported." }, { status: 404 });
    }

    const filtered = applyLeadExportFilter((data ?? []) as Lead[], exportFilter);
    if (!filtered.length && exportFilter !== "all") {
      return NextResponse.json({ error: "No leads match this export filter." }, { status: 404 });
    }

    const leads = await attachDecisionMakers(filtered);
    const table = buildLeadExportTable(leads, profile);
    logWorkflowEvent("lead-export", "csv generated", {
      profile,
      rows: table.rows.length,
      columns: table.headers.length,
    });
    const csv = `\uFEFF${[table.headers, ...table.rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\r\n")}`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename()}"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Lead CSV export failed.");
  }
}
