import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { getBestContactMethod, getContactPageUrl, getContactabilityStatus } from "@/lib/contactability";
import { getSupabaseServiceClient } from "@/lib/db";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import {
  findPublicEmailForLead,
  MANUAL_EMAIL_RESEARCH_METADATA_VERSION,
  type ManualEmailResearchResult,
} from "@/lib/manual-email-research";
import { classifyPublicEmail } from "@/lib/outreach-intelligence";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type RequestBody = { forceRefresh?: boolean };

function existingMetadata(lead: Lead) {
  return lead.raw_metadata && typeof lead.raw_metadata === "object" && !Array.isArray(lead.raw_metadata)
    ? lead.raw_metadata
    : {};
}

function researchMetadata(
  lead: Lead,
  result: ManualEmailResearchResult,
  email: string | null,
  contactPageUrl?: string,
) {
  const metadata = existingMetadata(lead);
  const existingContact = metadata.contact_enrichment && typeof metadata.contact_enrichment === "object"
    ? metadata.contact_enrichment as Record<string, unknown>
    : {};
  const completedNormally = result.status === "found" || result.status === "not_found";

  return {
    ...metadata,
    contact_enrichment: {
      ...existingContact,
      status: result.status === "found" ? "completed" : result.status === "not_found" ? "not_found" : "error",
      result_status: result.status,
      safe_error_code: result.safeErrorCode ?? null,
      contact_page_url: contactPageUrl ?? null,
      email_type: email ? classifyPublicEmail(email) : null,
      research_source: "manual",
      manual_research_version: MANUAL_EMAIL_RESEARCH_METADATA_VERSION,
      checked_at: result.checkedAt,
      pages_attempted: result.pagesAttempted,
      pages_checked: result.pagesChecked,
      canonical_origin: result.canonicalOrigin ?? null,
      completed: completedNormally,
    },
  };
}

function customerFailure(result: ManualEmailResearchResult) {
  if (result.status === "invalid_website") {
    return { status: 400, message: "This lead does not have a valid public website." };
  }
  if (result.status === "website_blocked") {
    return { status: 502, message: "The website blocked automated access. Try the contact page manually." };
  }
  if (result.status === "website_timeout") {
    return { status: 504, message: "The website did not respond in time. Please retry." };
  }
  if (result.status === "website_unavailable") {
    return { status: 502, message: "The business website could not be reached." };
  }
  return { status: 502, message: "Email research could not be completed. Please try again." };
}

async function parseRequestBody(request: NextRequest): Promise<RequestBody> {
  if (!request.headers.get("content-type")?.includes("application/json")) return {};
  try {
    const value = await request.json() as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as RequestBody : {};
  } catch {
    return {};
  }
}

function databaseError(leadId: string, stage: "load" | "save" | "reload") {
  console.error("[manual-email] database operation failed", { leadId, stage, safeErrorCode: "database_error" });
  return NextResponse.json(
    {
      code: "database_error",
      error: "Email research could not be completed. Please try again.",
      message: "Email research could not be completed. Please try again.",
    },
    { status: 500 },
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseRequestBody(request);

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

    if (fetchError) return databaseError(id, "load");
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const currentLead = lead as Lead;
    const existingEmail = cleanSafePublicEmail(currentLead.email);
    if (existingEmail && body.forceRefresh !== true) {
      return NextResponse.json({
        ...currentLead,
        success: true,
        outcome: "email_already_exists",
        message: "This lead already has a public email.",
        contactPageUrl: getContactPageUrl(currentLead) ?? undefined,
        bestContactMethod: getBestContactMethod(currentLead),
        contactability: getContactabilityStatus(currentLead),
      });
    }

    if (!currentLead.website?.trim()) {
      return NextResponse.json({ error: "This lead has no website to scan." }, { status: 400 });
    }

    const result = await findPublicEmailForLead({ leadId: id, website: currentLead.website });
    const candidateEmail = cleanSafePublicEmail(result.email);
    const existingConfidence = typeof currentLead.email_confidence === "number" ? currentLead.email_confidence : 70;
    const keepExistingEmail = Boolean(
      existingEmail && candidateEmail && existingEmail.toLowerCase() !== candidateEmail.toLowerCase()
      && (result.confidence ?? 0) < existingConfidence,
    );
    const savedEmail = keepExistingEmail ? existingEmail : candidateEmail || existingEmail || null;
    const contactPageUrl = result.contactPageUrl ?? getContactPageUrl(currentLead) ?? undefined;
    const currentEmailIsFake = Boolean(currentLead.email && !existingEmail);
    const updatePayload: Record<string, unknown> = {
      raw_metadata: researchMetadata(currentLead, result, savedEmail, contactPageUrl),
    };

    if (candidateEmail && !keepExistingEmail) {
      updatePayload.email = candidateEmail;
      updatePayload.email_source_url = result.sourceUrl;
      updatePayload.email_confidence = result.confidence;
    } else if (currentEmailIsFake && !savedEmail) {
      updatePayload.email = null;
      updatePayload.email_source_url = null;
      updatePayload.email_confidence = null;
    }

    const { error: updateError } = await supabase
      .from("leads")
      .update(updatePayload)
      .eq("id", id)
      .in("user_id", allowedUserIds);
    if (updateError) return databaseError(id, "save");

    const { data: reloaded, error: reloadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .in("user_id", allowedUserIds)
      .single();
    if (reloadError || !reloaded) return databaseError(id, "reload");

    const savedLead = reloaded as Lead;
    const responseBase = {
      ...savedLead,
      contactPageUrl,
      bestContactMethod: getBestContactMethod(savedLead),
      contactability: getContactabilityStatus(savedLead),
      safeErrorCode: result.safeErrorCode,
      pagesChecked: result.pagesChecked.length,
    };

    if (result.status === "found" && cleanSafePublicEmail(savedLead.email)) {
      return NextResponse.json({
        ...responseBase,
        success: true,
        outcome: keepExistingEmail ? "email_already_exists" : "email_found",
        message: keepExistingEmail ? "This lead already has a public email." : "Public email found and saved.",
      });
    }

    if (result.status === "not_found") {
      const message = contactPageUrl
        ? "No public email found. Contact page saved instead."
        : savedLead.phone?.trim()
          ? "No public email or contact page found. Phone outreach is available."
          : "No public email or contact page was found.";
      return NextResponse.json({ ...responseBase, success: false, outcome: "no_public_email", message });
    }

    const failure = customerFailure(result);
    return NextResponse.json(
      {
        ...responseBase,
        success: false,
        outcome: "research_failed",
        code: result.safeErrorCode ?? "unknown_error",
        error: failure.message,
        message: failure.message,
      },
      { status: failure.status },
    );
  } catch (error) {
    return apiErrorResponse(error, "Email research could not be completed. Please try again.");
  }
}
