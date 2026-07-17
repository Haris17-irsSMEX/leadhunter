import "server-only";

import type { User } from "@supabase/supabase-js";
import { isAdminUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/db";
import { isPlanName, PLANS, type PlanName } from "@/lib/plans";

export type UsageSummary = {
  plan: PlanName;
  planLabel: string;
  used: number;
  limit: number;
  remaining: number;
  isAdmin: boolean;
};

function currentMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function getUserPlan(userId: string): Promise<PlanName> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.from("profiles").select("plan").eq("user_id", userId).maybeSingle();

  if (error) {
    const migrationPending =
      error.code === "PGRST205" || error.message.includes("Could not find the table 'public.profiles'");

    if (!migrationPending) {
      console.error("[usage] Unable to load profile plan:", error.message);
    }

    return "free";
  }

  return isPlanName(data?.plan) ? data.plan : "free";
}

export async function getUsageSummary(user: Pick<User, "id" | "email">): Promise<UsageSummary> {
  const plan = await getUserPlan(user.id);
  const planConfig = PLANS[plan];
  const admin = isAdminUser(user);
  const supabase = getSupabaseServiceClient();
  const { count, error } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("scraped_at", currentMonthStart());

  if (error) {
    throw new Error("Unable to calculate monthly lead usage.");
  }

  const used = count ?? 0;
  const remaining = admin ? Number.MAX_SAFE_INTEGER : Math.max(0, planConfig.monthlyLeadLimit - used);

  return {
    plan,
    planLabel: admin ? "Internal" : planConfig.label,
    used,
    limit: planConfig.monthlyLeadLimit,
    remaining,
    isAdmin: admin,
  };
}

export async function getAllowedLeadCount(user: Pick<User, "id" | "email">, requested: number) {
  const safeRequested = Math.max(0, Math.floor(requested));
  const usage = await getUsageSummary(user);

  if (usage.isAdmin) {
    return { allowed: safeRequested, usage };
  }

  if (usage.remaining <= 0) {
    throw new MonthlyLimitError(usage);
  }

  return {
    allowed: Math.min(safeRequested, usage.remaining),
    usage,
  };
}

export class MonthlyLimitError extends Error {
  readonly code = "MONTHLY_LIMIT_REACHED";
  readonly status = 429;

  constructor(readonly usage: UsageSummary) {
    super(`You have reached your ${usage.limit}-lead monthly ${usage.planLabel.toLowerCase()}-plan limit.`);
    this.name = "MonthlyLimitError";
  }
}
