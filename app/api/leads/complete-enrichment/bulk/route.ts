import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { completeLeadEnrichment } from "@/lib/complete-enrichment";
import { estimateCompleteEnrichmentWorkload, WORKLOAD_LIMITS } from "@/lib/workload-limits";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { leadIds?: string[]; force?: boolean };
    const leadIds = [...new Set(
      (body.leadIds ?? [])
        .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
        .map((id) => id.trim()),
    )];

    if (!leadIds.length) {
      return NextResponse.json({ error: "Select at least one lead to enrich." }, { status: 400 });
    }
    if (leadIds.length > WORKLOAD_LIMITS.completeEnrichment.maxLeadIdsPerBulkRequest) {
      return NextResponse.json({ error: "Complete enrichment is limited to five leads per server batch." }, { status: 400 });
    }

    const workload = estimateCompleteEnrichmentWorkload(leadIds.length);

    const results: Array<Record<string, unknown>> = [];
    for (let index = 0; index < leadIds.length; index += WORKLOAD_LIMITS.completeEnrichment.batchConcurrency) {
      const batch = leadIds.slice(index, index + WORKLOAD_LIMITS.completeEnrichment.batchConcurrency);
      const settled = await Promise.allSettled(
        batch.map((leadId) => completeLeadEnrichment(user, leadId, { force: body.force === true })),
      );
      settled.forEach((result, batchIndex) => {
        const leadId = batch[batchIndex];
        results.push(
          result.status === "fulfilled"
            ? { leadId, success: true, ...result.value }
            : {
                leadId,
                success: false,
                message: "Complete enrichment could not be completed. Retry is available.",
              },
        );
      });
    }

    const statuses = results.map((result) => {
      const progress = result.progress;
      return progress && typeof progress === "object" && "status" in progress ? String(progress.status) : "failed";
    });
    return NextResponse.json({
      count: results.length,
      complete: statuses.filter((status) => status === "complete").length,
      partial: statuses.filter((status) => status === "partial").length,
      notFound: statuses.filter((status) => status === "not_found").length,
      failed: results.filter((result, index) => !result.success || statuses[index] === "failed").length,
      cancelled: statuses.filter((status) => status === "cancelled").length,
      results,
      workload,
    });
  } catch (error) {
    return apiErrorResponse(error, "Complete enrichment could not be completed. Please try again.");
  }
}
