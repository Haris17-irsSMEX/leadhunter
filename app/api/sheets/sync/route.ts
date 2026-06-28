import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/db";
import { GoogleSheetsNotConfiguredError, syncLeadsToSheet } from "@/lib/sheets";
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
      sheetName?: string;
    };
    const spreadsheetId = body.spreadsheetId?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "spreadsheetId is required." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", "default")
      .order("scraped_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const result = await syncLeadsToSheet(spreadsheetId, (data ?? []) as Lead[], body.sheetName ?? "Leads");

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GoogleSheetsNotConfiguredError) {
      return sheetsConfigError();
    }

    return Response.json({ error: error instanceof Error ? error.message : "Sheet sync failed." }, { status: 500 });
  }
}
