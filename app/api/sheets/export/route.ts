import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/db";
import { applyLeadExportFilter, normalizeLeadExportFilter } from "@/lib/lead-export-filters";
import { exportLeadsToSheet, GoogleSheetsNotConfiguredError, syncLeadsToSheet } from "@/lib/sheets";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";

function sheetsConfigError() {
  return NextResponse.json(
    {
      error: "Google Sheets not configured",
      message: "Add GOOGLE_CREDENTIALS_B64 to .env.local",
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
    const mode = body.mode ?? (Array.isArray(body.leadIds) && body.leadIds.length > 0 ? "selected" : "recent");
    const syncFilter = normalizeLeadExportFilter(body.syncFilter);

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
      if (!Array.isArray(body.leadIds) || body.leadIds.length === 0) {
        return NextResponse.json({ error: "leadIds are required for selected exports." }, { status: 400 });
      }

      query = query.in("id", body.leadIds.slice(0, 500));
    } else if (mode === "recent") {
      const count = Math.min(Math.max(Number(body.count) || 20, 1), 500);
      query = query.limit(count);
    } else if (mode !== "all") {
      return NextResponse.json({ error: "Invalid export mode." }, { status: 400 });
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const leads = applyLeadExportFilter((data ?? []) as Lead[], syncFilter);

    if (!leads.length && syncFilter !== "all") {
      return NextResponse.json({ error: "No leads match this sync filter." }, { status: 404 });
    }

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
