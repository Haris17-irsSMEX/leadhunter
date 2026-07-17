import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
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
    const user = await requireUser();
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

    if (!/^[a-zA-Z0-9_-]{10,}$/.test(spreadsheetId)) {
      return NextResponse.json({ error: "Enter a valid Google Sheets spreadsheet ID." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .in("user_id", getAllowedUserIds(user))
      .order("scraped_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const result = await syncLeadsToSheet(
      spreadsheetId,
      (data ?? []) as Lead[],
      (body.sheetName?.trim() || "Leads").slice(0, 100),
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GoogleSheetsNotConfiguredError) {
      return sheetsConfigError();
    }

    return apiErrorResponse(error, "Google Sheets sync failed.");
  }
}
