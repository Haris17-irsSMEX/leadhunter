import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { getEnrichmentJob } from "@/lib/enrichment-jobs";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const user = await requireUser();
    const { jobId } = await params;
    return NextResponse.json(await getEnrichmentJob(user, jobId));
  } catch (error) {
    return apiErrorResponse(error, "Enrichment progress could not be loaded.");
  }
}
