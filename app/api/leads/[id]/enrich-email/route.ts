import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/db";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import { findPublicBusinessEmail } from "@/lib/restaurant-email";
import type { Lead } from "@/lib/types";

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

    const emailResult = await findPublicBusinessEmail(currentLead.website);
    const safeEmail = cleanSafePublicEmail(emailResult.email);
    const currentEmailIsFake = Boolean(currentLead.email && !cleanSafePublicEmail(currentLead.email));
    const updatePayload: Record<string, unknown> = {
      raw_metadata: mergeRawMetadata(currentLead, emailResult.contactPageUrl, safeEmail ? "completed" : emailResult.status),
    };

    if (safeEmail) {
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

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({
      ...(updatedLead as Lead),
      success: Boolean(safeEmail),
      message: safeEmail ? "Email found and saved." : "No public email found. Try the website contact form or phone.",
      contactPageUrl: emailResult.contactPageUrl,
    });
  } catch (error) {
    return apiErrorResponse(error, "Email enrichment is temporarily unavailable. Please try again later.");
  }
}
