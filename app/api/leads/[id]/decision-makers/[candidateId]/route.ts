import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/db";
import {
  isLikelyDecisionMakerRole,
  isLikelyHumanName,
  isUsableDecisionMakerCandidate,
} from "@/lib/decision-maker-validation";
import { isSafePublicEmail } from "@/lib/email-safety";
import { classifyPublicEmail } from "@/lib/outreach-intelligence";
import type { DecisionMakerConfidence, DecisionMakerVerificationStatus } from "@/lib/types";

export const runtime = "nodejs";

const CONFIDENCE = new Set<DecisionMakerConfidence>(["high", "medium", "low"]);
const VERIFICATION = new Set<DecisionMakerVerificationStatus>(["unverified", "manually_verified", "rejected"]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined;
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; candidateId: string }> }) {
  try {
    const user = await requireUser();
    const { id, candidateId } = await params;
    const body = (await request.json()) as {
      name?: string;
      role?: string;
      publicWorkEmail?: string | null;
      publicProfileUrl?: string | null;
      sourceUrl?: string;
      confidence?: DecisionMakerConfidence;
      verificationStatus?: DecisionMakerVerificationStatus;
      isPrimary?: boolean;
    };
    const update: Record<string, unknown> = {};
    const name = cleanText(body.name, 160);
    const role = cleanText(body.role, 160);
    if (name) update.name = name;
    if (role) update.role = role;
    if (body.confidence && CONFIDENCE.has(body.confidence)) update.confidence = body.confidence;
    if (body.verificationStatus && VERIFICATION.has(body.verificationStatus)) {
      update.verification_status = body.verificationStatus;
      if (body.verificationStatus === "rejected") update.is_primary = false;
    }
    if (body.publicWorkEmail !== undefined) {
      const email = cleanText(body.publicWorkEmail, 320) ?? "";
      if (email && !isSafePublicEmail(email)) {
        return NextResponse.json({ error: "Enter a valid publicly listed email." }, { status: 400 });
      }
      update.public_work_email = email || null;
      update.email_type = email ? classifyPublicEmail(email, name) : null;
    }
    if (body.publicProfileUrl !== undefined) {
      const publicProfileUrl = cleanText(body.publicProfileUrl, 1000) ?? "";
      if (publicProfileUrl && !isPublicHttpUrl(publicProfileUrl)) {
        return NextResponse.json({ error: "Enter a valid public profile URL." }, { status: 400 });
      }
      update.public_profile_url = publicProfileUrl || null;
    }
    if (body.sourceUrl !== undefined) {
      const sourceUrl = cleanText(body.sourceUrl, 1000) ?? "";
      if (!sourceUrl || !isPublicHttpUrl(sourceUrl)) {
        return NextResponse.json({ error: "Enter a valid public evidence URL." }, { status: 400 });
      }
      update.source_url = sourceUrl;
    }

    const supabase = getSupabaseServiceClient();
    const allowedUserIds = getAllowedUserIds(user);
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("company_name")
      .eq("id", id)
      .in("user_id", allowedUserIds)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    if (name && !isLikelyHumanName(name, lead.company_name)) {
      return NextResponse.json({ error: "Enter a reliable human name, not a page title or service name." }, { status: 400 });
    }
    if (role && !isLikelyDecisionMakerRole(role)) {
      return NextResponse.json({ error: "Enter a recognized decision-maker role." }, { status: 400 });
    }

    if (body.isPrimary === true) {
      const { data: currentCandidate, error: candidateError } = await supabase
        .from("lead_decision_makers")
        .select("name, role, source_url, verification_status")
        .eq("id", candidateId)
        .eq("lead_id", id)
        .in("user_id", allowedUserIds)
        .maybeSingle();
      if (candidateError) throw new Error(candidateError.message);
      if (
        !currentCandidate ||
        !isUsableDecisionMakerCandidate(
          {
            ...currentCandidate,
            name: name ?? currentCandidate.name,
            role: role ?? currentCandidate.role,
          },
          lead.company_name,
        )
      ) {
        return NextResponse.json(
          { error: "Only a reliable, evidence-backed candidate can be selected as primary." },
          { status: 400 },
        );
      }
      const { error } = await supabase
        .from("lead_decision_makers")
        .update({ is_primary: false })
        .eq("lead_id", id)
        .in("user_id", allowedUserIds);
      if (error) throw new Error(error.message);
      update.is_primary = true;
    } else if (body.isPrimary === false) {
      update.is_primary = false;
    }

    if (!Object.keys(update).length) {
      return NextResponse.json({ error: "No valid candidate changes were supplied." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("lead_decision_makers")
      .update(update)
      .eq("id", candidateId)
      .eq("lead_id", id)
      .in("user_id", allowedUserIds)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Decision-maker candidate not found." }, { status: 404 });
    return NextResponse.json({ candidate: data, message: "Decision-maker candidate updated." });
  } catch (error) {
    return apiErrorResponse(error, "Decision-maker candidate update failed.");
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; candidateId: string }> }) {
  try {
    const user = await requireUser();
    const { id, candidateId } = await params;
    const supabase = getSupabaseServiceClient();
    const { count, error } = await supabase
      .from("lead_decision_makers")
      .delete({ count: "exact" })
      .eq("id", candidateId)
      .eq("lead_id", id)
      .in("user_id", getAllowedUserIds(user));
    if (error) throw new Error(error.message);
    if (!count) return NextResponse.json({ error: "Decision-maker candidate not found." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error, "Decision-maker candidate deletion failed.");
  }
}
