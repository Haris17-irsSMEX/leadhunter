import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAdminSummary } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await getAdminSummary());
  } catch (error) {
    return apiErrorResponse(error, "Unable to load admin summary.");
  }
}
