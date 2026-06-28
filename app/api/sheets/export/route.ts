import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/db";
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
    if (!process.env.GOOGLE_CREDENTIALS_B64?.trim()) {
      return sheetsConfigError();
    }

    const body = (await request.json()) as {
      spreadsheetId?: string;
      mode?: "selected" | "recent" | "all";
      leadIds?: string[];
      count?: number;
      sheetName?: string;
    };
    const spreadsheetId = body.spreadsheetId?.trim();
    const mode = body.mode ?? (Array.isArray(body.leadIds) && body.leadIds.length > 0 ? "selected" : "recent");

    if (!spreadsheetId) {
      return NextResponse.json({ error: "spreadsheetId is required." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    let query = supabase.from("leads").select("*").order("scraped_at", { ascending: false });

    if (mode === "selected") {
      if (!Array.isArray(body.leadIds) || body.leadIds.length === 0) {
        return NextResponse.json({ error: "leadIds are required for selected exports." }, { status: 400 });
      }

      query = query.in("id", body.leadIds);
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

    const leads = (data ?? []) as Lead[];
    const result =
      mode === "all"
        ? await syncLeadsToSheet(spreadsheetId, leads, body.sheetName ?? "Leads")
        : await exportLeadsToSheet(spreadsheetId, leads, body.sheetName ?? "Leads");

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GoogleSheetsNotConfiguredError) {
      return sheetsConfigError();
    }

    return Response.json({ error: error instanceof Error ? error.message : "Sheet export failed." }, { status: 500 });
  }
}
