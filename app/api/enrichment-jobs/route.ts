import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { createEnrichmentJob } from "@/lib/enrichment-jobs";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      leadIds?: string[];
      mode?: string;
      forceRefresh?: boolean;
      sourceContext?: "recent_search" | "selected_leads" | "finder_auto";
      sourceSearchJobId?: string;
    };
    if (body.mode !== "complete_outreach_profile") {
      return NextResponse.json({ error: "Complete outreach profile is the only supported enrichment mode." }, { status: 400 });
    }
    const result = await createEnrichmentJob(user, body.leadIds, {
      forceRefresh: body.forceRefresh === true,
      sourceContext: body.sourceContext,
      sourceSearchJobId: body.sourceSearchJobId,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error, "Enrichment could not be queued. Please try again.");
  }
}
