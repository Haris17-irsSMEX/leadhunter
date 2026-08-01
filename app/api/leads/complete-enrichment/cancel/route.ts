import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { cancelCompleteEnrichment } from "@/lib/complete-enrichment";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { leadIds?: string[] };
    const leadIds = [...new Set(
      (body.leadIds ?? [])
        .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
        .map((id) => id.trim()),
    )];
    if (!leadIds.length) return NextResponse.json({ error: "No queued leads were provided." }, { status: 400 });
    if (leadIds.length > WORKLOAD_LIMITS.completeEnrichment.maxLeadIdsPerBulkRequest) {
      return NextResponse.json({ error: "Cancellation is limited to five leads per request." }, { status: 400 });
    }

    const results = await cancelCompleteEnrichment(user, leadIds);
    return NextResponse.json({ cancelled: results.length, results });
  } catch (error) {
    return apiErrorResponse(error, "Queued enrichment could not be cancelled.");
  }
}
