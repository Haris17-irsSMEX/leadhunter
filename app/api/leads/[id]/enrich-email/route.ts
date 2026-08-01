import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, PublicApiError } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/db";
import { enrichLeadPublicEmail } from "@/lib/public-email-service";
import type { Lead } from "@/lib/types";
import { acquireWorkloadLease } from "@/lib/workload-guards";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

export const runtime = "nodejs";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Lead id is required." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const allowedUserIds = getAllowedUserIds(user);
    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .in("user_id", allowedUserIds)
      .maybeSingle();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    const currentLead = lead as Lead;

    if (!currentLead.website?.trim()) {
      return NextResponse.json({ error: "This lead has no website to scan." }, { status: 400 });
    }

    const lease = await acquireWorkloadLease(
      `complete-enrichment:active:${user.id}:${id}`,
      WORKLOAD_LIMITS.completeEnrichment.activeLockSeconds,
    );
    if (!lease) {
      throw new PublicApiError("This lead is already being enriched.", 409, "DUPLICATE_ACTIVE_RUN");
    }

    try {
      const enrichment = await enrichLeadPublicEmail(user, currentLead);
      const emailResult = enrichment.result;

      return NextResponse.json({
        ...enrichment.lead,
        success: emailResult.status === "found",
        message: enrichment.emailAlreadyExisted
          ? "This lead already has a public email."
          : emailResult.status === "found"
            ? "Email found and saved."
            : "No public email found. Try the website contact form or phone.",
        contactPageUrl: emailResult.contactPageUrl,
        cached: emailResult.cached === true,
      });
    } finally {
      await lease.release();
    }
  } catch (error) {
    return apiErrorResponse(error, "Email enrichment is temporarily unavailable. Please try again later.");
  }
}
