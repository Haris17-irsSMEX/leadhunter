import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { researchLeadDecisionMakers } from "@/lib/decision-maker-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { leadIds?: string[]; force?: boolean };
    const leadIds = [...new Set((body.leadIds ?? []).filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))];

    if (!leadIds.length) {
      return NextResponse.json({ error: "Select at least one lead to research." }, { status: 400 });
    }
    if (leadIds.length > 5) {
      return NextResponse.json({ error: "Decision-maker research is limited to five leads per action." }, { status: 400 });
    }

    const results: Array<Record<string, unknown>> = [];
    for (let index = 0; index < leadIds.length; index += 2) {
      const batch = leadIds.slice(index, index + 2);
      const settled = await Promise.allSettled(
        batch.map((leadId) => researchLeadDecisionMakers(user, leadId, { force: body.force === true })),
      );
      settled.forEach((result, batchIndex) => {
        const leadId = batch[batchIndex];
        results.push(
          result.status === "fulfilled"
            ? { leadId, success: true, ...result.value }
            : { leadId, success: false, message: "Decision-maker research could not be completed." },
        );
      });
    }

    return NextResponse.json({
      count: results.length,
      completed: results.filter((result) => result.success).length,
      failed: results.filter((result) => !result.success).length,
      results,
    });
  } catch (error) {
    return apiErrorResponse(error, "Decision-maker research could not be completed. Please try again.");
  }
}
