import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, PublicApiError } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/db";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import { findPublicBusinessEmail } from "@/lib/restaurant-email";
import type { Lead } from "@/lib/types";
import { acquireWorkloadLease } from "@/lib/workload-guards";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

export const runtime = "nodejs";

function mergeRawMetadata(lead: Lead, contactPageUrl?: string, status?: string) {
  const existing =
    lead.raw_metadata && typeof lead.raw_metadata === "object" && !Array.isArray(lead.raw_metadata)
      ? lead.raw_metadata
      : {};

  return {
    ...existing,
    contact_enrichment: {
      ...(typeof existing.contact_enrichment === "object" && existing.contact_enrichment ? existing.contact_enrichment : {}),
      status,
      contact_page_url: contactPageUrl,
      checked_at: new Date().toISOString(),
    },
  };
}

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

    const existingSafeEmail = cleanSafePublicEmail(currentLead.email);
    if (existingSafeEmail) {
      return NextResponse.json({
        ...currentLead,
        success: true,
        message: "This lead already has a public email.",
        contactPageUrl:
          currentLead.raw_metadata && typeof currentLead.raw_metadata === "object"
            ? (currentLead.raw_metadata.contact_enrichment as { contact_page_url?: string } | undefined)?.contact_page_url
            : undefined,
        cached: true,
      });
    }

    const lease = await acquireWorkloadLease(
      `complete-enrichment:active:${user.id}:${id}`,
      WORKLOAD_LIMITS.completeEnrichment.activeLockSeconds,
    );
    if (!lease) {
      throw new PublicApiError("This lead is already being enriched.", 409, "DUPLICATE_ACTIVE_RUN");
    }

    try {
      const emailResult = await findPublicBusinessEmail(currentLead.website);
      const safeEmail = cleanSafePublicEmail(emailResult.email);
      const { data: latestLead, error: latestError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", id)
        .in("user_id", allowedUserIds)
        .single();
      if (latestError) throw new Error(latestError.message);
      const persistedLead = latestLead as Lead;
      const persistedEmail = cleanSafePublicEmail(persistedLead.email);
      const currentEmailIsFake = Boolean(persistedLead.email && !persistedEmail);
      const updatePayload: Record<string, unknown> = {
        raw_metadata: mergeRawMetadata(
          persistedLead,
          emailResult.contactPageUrl,
          persistedEmail || safeEmail ? "completed" : emailResult.status,
        ),
      };

      if (safeEmail && !persistedEmail) {
        updatePayload.email = safeEmail;
        updatePayload.email_source_url = emailResult.sourceUrl;
        updatePayload.email_confidence = emailResult.confidence;
      } else if (currentEmailIsFake) {
        updatePayload.email = null;
      }

      const { data: updatedLead, error: updateError } = await supabase
        .from("leads")
        .update(updatePayload)
        .eq("id", id)
        .in("user_id", allowedUserIds)
        .select("*")
        .single();

      if (updateError) throw new Error(updateError.message);

      return NextResponse.json({
        ...(updatedLead as Lead),
        success: Boolean(persistedEmail || safeEmail),
        message: persistedEmail
          ? "This lead already has a public email."
          : safeEmail
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
