import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { attachDecisionMakers } from "@/lib/decision-maker-db";
import { getSupabaseServiceClient } from "@/lib/db";
import { applyLeadExportFilter, normalizeLeadExportFilter } from "@/lib/lead-export-filters";
import { exportLeadsToSheet, GoogleSheetsNotConfiguredError, syncLeadsToSheet } from "@/lib/sheets";
import type { Lead } from "@/lib/types";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

export const runtime = "nodejs";

function sheetsConfigError() {
  return NextResponse.json(
    {
      error: "Google Sheets not configured",
      message: "Google Sheets sync is not configured for this workspace.",
    },
    { status: 503 },
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!process.env.GOOGLE_CREDENTIALS_B64?.trim()) {
      return sheetsConfigError();
    }

    const body = (await request.json()) as {
      spreadsheetId?: string;
      mode?: "selected" | "recent" | "all";
      leadIds?: string[];
      count?: number;
      sheetName?: string;
      syncFilter?: string;
    };
    const spreadsheetId = body.spreadsheetId?.trim();
    // Legacy exportProfile values are accepted in old request bodies but intentionally ignored.
    const mode = body.mode ?? (Array.isArray(body.leadIds) && body.leadIds.length > 0 ? "selected" : "recent");
    const syncFilter = normalizeLeadExportFilter(body.syncFilter);
    const selectedLeadIds = [...new Set(
      (body.leadIds ?? [])
        .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
        .map((id) => id.trim()),
    )];

    if (!spreadsheetId) {
      return NextResponse.json({ error: "spreadsheetId is required." }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]{10,}$/.test(spreadsheetId)) {
      return NextResponse.json({ error: "Enter a valid Google Sheets spreadsheet ID." }, { status: 400 });
    }

    const sheetName = (body.sheetName?.trim() || "Leads").slice(0, 100);
    const supabase = getSupabaseServiceClient();
    let query = supabase
      .from("leads")
      .select("*")
      .in("user_id", getAllowedUserIds(user))
      .order("scraped_at", { ascending: false });

    if (mode === "selected") {
      if (!selectedLeadIds.length) {
        return NextResponse.json({ error: "leadIds are required for selected exports." }, { status: 400 });
      }
      if (selectedLeadIds.length > WORKLOAD_LIMITS.exports.maxSelectedIds) {
        return NextResponse.json(
          { error: `Select no more than ${WORKLOAD_LIMITS.exports.maxSelectedIds} leads per sync.` },
          { status: 400 },
        );
      }
      query = query.in("id", selectedLeadIds);
    } else if (mode === "recent") {
      const count = Math.min(Math.max(Number(body.count) || 20, 1), 500);
      query = query.limit(count);
    } else if (mode === "all") {
      query = query.limit(WORKLOAD_LIMITS.exports.maxRows + 1);
    } else {
      return NextResponse.json({ error: "Invalid export mode." }, { status: 400 });
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }
    if (mode === "selected" && (data?.length ?? 0) !== selectedLeadIds.length) {
      return NextResponse.json(
        { error: "Some selected leads could not be verified as belonging to your workspace." },
        { status: 404 },
      );
    }

    const filtered = applyLeadExportFilter((data ?? []) as Lead[], syncFilter);

    if (!filtered.length && syncFilter !== "all") {
      return NextResponse.json({ error: "No leads match this sync filter." }, { status: 404 });
    }

    const leads = await attachDecisionMakers(filtered);
    const result =
      mode === "all"
        ? await syncLeadsToSheet(spreadsheetId, leads, sheetName)
        : await exportLeadsToSheet(spreadsheetId, leads, sheetName);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GoogleSheetsNotConfiguredError) {
      return sheetsConfigError();
    }

    return apiErrorResponse(error, "Google Sheets sync failed.");
  }
}
