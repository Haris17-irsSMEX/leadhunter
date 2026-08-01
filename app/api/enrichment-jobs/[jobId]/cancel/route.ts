import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { cancelEnrichmentJob } from "@/lib/enrichment-jobs";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireUser();
    const { jobId } = await params;
    return NextResponse.json({
      ...(await cancelEnrichmentJob(user, jobId)),
      message: "Enrichment stopped. Results already completed were preserved.",
    });
  } catch (error) {
    return apiErrorResponse(error, "Enrichment could not be cancelled.");
  }
}
