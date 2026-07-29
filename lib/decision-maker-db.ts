import "server-only";

import { getSupabaseServiceClient } from "@/lib/db";
import type { DecisionMaker, Lead } from "@/lib/types";

function migrationMissing(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || error?.code === "PGRST205" || message.includes("lead_decision_makers");
}

export async function attachDecisionMakers(leads: Lead[]) {
  const ids = leads.map((lead) => lead.id).filter((id): id is string => Boolean(id));
  if (!ids.length) return leads;

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("lead_decision_makers")
    .select("*")
    .in("lead_id", ids)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    if (migrationMissing(error)) return leads;
    throw new Error(error.message);
  }

  const byLead = new Map<string, DecisionMaker[]>();
  for (const candidate of (data ?? []) as DecisionMaker[]) {
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
