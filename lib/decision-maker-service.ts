import "server-only";

import { PublicApiError } from "@/lib/api-errors";
import { getAllowedUserIds } from "@/lib/auth";
import { decisionMakerMigrationMissing } from "@/lib/decision-maker-db";
import { getSupabaseServiceClient } from "@/lib/db";
import { researchDecisionMakers } from "@/lib/decision-maker-research";
import type { User } from "@supabase/supabase-js";
import type { DecisionMaker, Lead } from "@/lib/types";

const RECENT_RESEARCH_MS = 7 * 24 * 60 * 60 * 1_000;

function candidateKey(candidate: Pick<DecisionMaker, "name" | "role">) {
  return `${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, " ")}|${candidate.role
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")}`;
}

function isRecent(value?: string) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) && Date.now() - timestamp < RECENT_RESEARCH_MS;
}

async function loadLead(user: Pick<User, "id" | "email">, leadId: string) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .in("user_id", getAllowedUserIds(user))
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new PublicApiError("Lead not found.", 404, "LEAD_NOT_FOUND");
  return data as Lead;
}

async function loadCandidates(user: Pick<User, "id" | "email">, leadId: string) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("lead_decision_makers")
    .select("*")
    .eq("lead_id", leadId)
    .in("user_id", getAllowedUserIds(user))
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    if (decisionMakerMigrationMissing(error)) {
      throw new PublicApiError(
        "Decision-maker research is not available until the Phase 7 migration is applied.",
        503,
        "DECISION_MAKER_MIGRATION_REQUIRED",
      );
    }
    throw new Error(error.message);
  }
  return (data ?? []) as DecisionMaker[];
}

function researchStatus(
  candidates: DecisionMaker[],
  result: Awaited<ReturnType<typeof researchDecisionMakers>>,
) {
  if (candidates.some((candidate) => candidate.confidence === "high" || candidate.confidence === "medium")) {
    return "candidate_found" as const;
  }
  if (candidates.length) return "needs_verification" as const;
  if (result.warnings.length && (result.websiteAvailable || result.searchAvailable)) return "partial" as const;
  if (!result.websiteAvailable && !result.searchAvailable) return "unavailable" as const;
  return "not_found" as const;
}

export async function researchLeadDecisionMakers(
  user: Pick<User, "id" | "email">,
  leadId: string,
  options: { force?: boolean } = {},
) {
  const lead = await loadLead(user, leadId);
  const existingCandidates = await loadCandidates(user, leadId);

  if (!options.force && isRecent(lead.decision_maker_last_checked_at)) {
    return {
      lead: { ...lead, decision_makers: existingCandidates },
      candidates: existingCandidates,
      cached: true,
      warnings: [],
      message: existingCandidates.length
        ? "Recent decision-maker research is already available."
        : "This lead was researched recently. Confirm a retry to run it again.",
    };
  }

  const result = await researchDecisionMakers(lead);
  const now = new Date().toISOString();
  const supabase = getSupabaseServiceClient();
  const preserved = existingCandidates.filter(
    (candidate) =>
      candidate.source_type === "manual" ||
      candidate.verification_status === "manually_verified" ||
      candidate.verification_status === "rejected",
  );
  const preservedKeys = new Set(preserved.map(candidateKey));
  const newCandidates = result.candidates
    .filter((candidate) => !preservedKeys.has(candidateKey(candidate)))
    .map((candidate, index) => ({
      ...candidate,
      user_id: lead.user_id ?? user.id,
      lead_id: leadId,
      is_primary: preserved.some((item) => item.is_primary) ? false : index === 0,
    }));

  const { error: deleteError } = await supabase
    .from("lead_decision_makers")
    .delete()
    .eq("lead_id", leadId)
    .in("user_id", getAllowedUserIds(user))
    .eq("verification_status", "unverified")
    .neq("source_type", "manual");
  if (deleteError && !decisionMakerMigrationMissing(deleteError)) throw new Error(deleteError.message);

  let inserted: DecisionMaker[] = [];
  if (newCandidates.length) {
    const { data, error } = await supabase.from("lead_decision_makers").insert(newCandidates).select("*");
    if (error) throw new Error(error.message);
    inserted = (data ?? []) as DecisionMaker[];
  }

  const candidates = [...preserved, ...inserted].sort((left, right) => Number(right.is_primary) - Number(left.is_primary));
  const status = researchStatus(candidates, result);
  const { data: updatedLead, error: leadUpdateError } = await supabase
    .from("leads")
    .update({
      decision_maker_research_status: status,
      decision_maker_last_checked_at: now,
      public_whatsapp_status: result.whatsapp.status,
      public_whatsapp_url: result.whatsapp.url ?? null,
      public_whatsapp_number: result.whatsapp.number ?? null,
      public_whatsapp_source_url: result.whatsapp.sourceUrl ?? null,
      public_whatsapp_last_checked_at: now,
    })
    .eq("id", leadId)
    .in("user_id", getAllowedUserIds(user))
    .select("*")
    .single();
  if (leadUpdateError) throw new Error(leadUpdateError.message);

  const message =
    candidates.some((candidate) => candidate.public_work_email)
      ? "Decision-maker and publicly listed work email found."
      : candidates.some((candidate) => candidate.confidence === "high" || candidate.confidence === "medium")
        ? "Decision-maker candidate found."
        : candidates.length
          ? "A possible decision-maker was found, but the information needs verification."
          : result.websiteAvailable || result.searchAvailable
            ? "No public decision-maker information was found."
            : "The business website could not be researched.";

  return {
    lead: { ...(updatedLead as Lead), decision_makers: candidates },
    candidates,
    cached: false,
    warnings: result.warnings,
    message,
  };
}
