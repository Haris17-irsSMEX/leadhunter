import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { CityScanError, processCityOpportunityScanBatch } from "@/lib/city-opportunity-scan";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json(await processCityOpportunityScanBatch(user, id));
  } catch (error) {
    if (error instanceof CityScanError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    return apiErrorResponse(error, "City scan batch could not be completed.");
  }
}

