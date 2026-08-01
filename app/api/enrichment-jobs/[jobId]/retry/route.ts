import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { retryEnrichmentJob } from "@/lib/enrichment-jobs";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireUser();
    const { jobId } = await params;
    return NextResponse.json(await retryEnrichmentJob(user, jobId), { status: 202 });
  } catch (error) {
    return apiErrorResponse(error, "Enrichment retry could not be queued.");
  }
}
