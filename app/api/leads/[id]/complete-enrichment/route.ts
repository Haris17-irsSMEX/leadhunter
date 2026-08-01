import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { completeLeadEnrichment } from "@/lib/complete-enrichment";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    if (!id) return NextResponse.json({ error: "Lead id is required." }, { status: 400 });

    return NextResponse.json(await completeLeadEnrichment(user, id, { force: body.force === true }));
  } catch (error) {
    return apiErrorResponse(error, "Complete enrichment could not be completed. Please try again.");
  }
}
