import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, PublicApiError } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { decisionMakerMigrationMissing } from "@/lib/decision-maker-db";
import { researchLeadDecisionMakers } from "@/lib/decision-maker-service";
import {
  isLikelyDecisionMakerRole,
  isLikelyHumanName,
} from "@/lib/decision-maker-validation";
import { getSupabaseServiceClient } from "@/lib/db";
import { classifyPublicEmail } from "@/lib/outreach-intelligence";
import { isSafePublicEmail } from "@/lib/email-safety";
import type { DecisionMakerConfidence } from "@/lib/types";

export const runtime = "nodejs";

const CONFIDENCE = new Set<DecisionMakerConfidence>(["high", "medium", "low"]);

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Lead id is required." }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as {
      action?: "research" | "add_manual";
      force?: boolean;
      name?: string;
      role?: string;
      publicWorkEmail?: string;
      publicProfileUrl?: string;
      sourceUrl?: string;
      confidence?: DecisionMakerConfidence;
    };

    if (body.action === "add_manual") {
      const name = cleanText(body.name, 160);
      const role = cleanText(body.role, 160);
      const sourceUrl = cleanText(body.sourceUrl, 1000);
      const email = cleanText(body.publicWorkEmail, 320);
      const confidence = CONFIDENCE.has(body.confidence ?? "medium") ? body.confidence ?? "medium" : "medium";
      if (!name || !role || !sourceUrl) {
        return NextResponse.json({ error: "Name, role, and evidence URL are required." }, { status: 400 });
      }
      if (!isPublicHttpUrl(sourceUrl)) {
        return NextResponse.json({ error: "Enter a valid public evidence URL." }, { status: 400 });
      }
      if (email && !isSafePublicEmail(email)) {
        return NextResponse.json({ error: "Enter a valid publicly listed email." }, { status: 400 });
      }
      const publicProfileUrl = cleanText(body.publicProfileUrl, 1000);
      if (publicProfileUrl && !isPublicHttpUrl(publicProfileUrl)) {
        return NextResponse.json({ error: "Enter a valid public profile URL." }, { status: 400 });
      }

      const supabase = getSupabaseServiceClient();
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("id, user_id, company_name")
        .eq("id", id)
        .in("user_id", getAllowedUserIds(user))
        .maybeSingle();
      if (leadError) throw new Error(leadError.message);
      if (!lead) throw new PublicApiError("Lead not found.", 404, "LEAD_NOT_FOUND");
      if (!isLikelyHumanName(name, lead.company_name)) {
        return NextResponse.json({ error: "Enter a reliable human name, not a page title or service name." }, { status: 400 });
      }
      if (!isLikelyDecisionMakerRole(role)) {
        return NextResponse.json({ error: "Enter a recognized decision-maker role." }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("lead_decision_makers")
        .insert({
          user_id: lead.user_id ?? user.id,
          lead_id: id,
          name,
          role,
          public_work_email: email || null,
          email_type: email ? classifyPublicEmail(email, name) : null,
          public_profile_url: publicProfileUrl || null,
          source_url: sourceUrl,
          source_type: "manual",
          confidence,
          verification_status: "unverified",
          is_primary: false,
          last_checked_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) {
        if (decisionMakerMigrationMissing(error)) {
          throw new PublicApiError("Decision-maker research is not configured yet.", 503, "DECISION_MAKER_MIGRATION_REQUIRED");
        }
        throw new Error(error.message);
      }
      return NextResponse.json({ candidate: data, message: "Decision-maker candidate added." });
    }

    return NextResponse.json(await researchLeadDecisionMakers(user, id, { force: body.force === true }));
  } catch (error) {
    return apiErrorResponse(error, "Decision-maker research could not be completed. Please try again.");
  }
}
