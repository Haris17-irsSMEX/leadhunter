import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { CityScanError, getCityOpportunityScan } from "@/lib/city-opportunity-scan";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json(await getCityOpportunityScan(user, id));
  } catch (error) {
    if (error instanceof CityScanError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    return apiErrorResponse(error, "City scan could not be loaded.");
  }
}

