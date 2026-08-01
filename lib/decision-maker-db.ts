import "server-only";

import { getSupabaseServiceClient } from "@/lib/db";
import type { DecisionMaker, Lead } from "@/lib/types";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

function migrationMissing(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "PGRST205" || message.includes("lead_decision_makers");
}

export async function attachDecisionMakers(leads: Lead[]) {
  const ids = leads.map((lead) => lead.id).filter((id): id is string => Boolean(id));
  if (!ids.length) return leads;

  const candidates: DecisionMaker[] = [];
  for (let offset = 0; offset < ids.length; offset += WORKLOAD_LIMITS.exports.googleSheetsBatchRows) {
    const { data, error } = await getSupabaseServiceClient()
      .from("lead_decision_makers")
      .select("*")
      .in("lead_id", ids.slice(offset, offset + WORKLOAD_LIMITS.exports.googleSheetsBatchRows))
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      if (migrationMissing(error)) return leads;
      throw new Error(error.message);
    }
    candidates.push(...((data ?? []) as DecisionMaker[]));
  }

  const byLead = new Map<string, DecisionMaker[]>();
  for (const candidate of candidates) {
    if (!candidate.lead_id) continue;
    byLead.set(candidate.lead_id, [...(byLead.get(candidate.lead_id) ?? []), candidate]);
  }

  return leads.map((lead) => ({
    ...lead,
    decision_makers: lead.id ? byLead.get(lead.id) ?? [] : [],
  }));
}

export function decisionMakerMigrationMissing(error: { code?: string; message?: string } | null | undefined) {
  return migrationMissing(error);
}
