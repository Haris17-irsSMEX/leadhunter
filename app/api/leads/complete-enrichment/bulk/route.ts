import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { createEnrichmentJob } from "@/lib/enrichment-jobs";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { leadIds?: string[]; force?: boolean };
    const result = await createEnrichmentJob(user, body.leadIds, {
      forceRefresh: body.force === true,
      sourceContext: "selected_leads",
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error, "Complete enrichment could not be queued. Please try again.");
  }
}
