import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/db";
import { isPlanName, type PlanName } from "@/lib/plans";
import type { Lead, Profile, ProfileStatus, ScrapeJob } from "@/lib/types";

const AUTH_PAGE_SIZE = 1_000;

export type AdminUserRow = {
  userId: string;
  email: string;
  plan: PlanName;
  status: ProfileStatus;
  leadsThisMonth: number;
  totalLeads: number;
  createdAt: string;
};

export type AdminSummary = {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  leadsThisMonth: number;
  totalLeads: number;
  freeUsers: number;
  starterUsers: number;
  proUsers: number;
  agencyUsers: number;
};

function currentMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function listAllAuthUsers(): Promise<User[]> {
  const supabase = getSupabaseServiceClient();
  const users: User[] = [];

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });

    if (error) {
      throw new Error("Unable to load authenticated users.");
    }

    users.push(...data.users);

    if (data.users.length < AUTH_PAGE_SIZE) {
      break;
    }
  }

  return users;
}

export async function listAllProfiles(): Promise<Profile[]> {
  const supabase = getSupabaseServiceClient();
  const profiles: Profile[] = [];

  for (let offset = 0; offset < 100_000; offset += AUTH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, plan, status, admin_notes, created_at, updated_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + AUTH_PAGE_SIZE - 1);

    if (error) {
      throw new Error("Unable to load user profiles. Apply the latest Supabase migration.");
    }

    profiles.push(...((data ?? []) as Profile[]));

    if ((data ?? []).length < AUTH_PAGE_SIZE) {
      break;
    }
  }

  return profiles;
}

function normalizedProfile(profile: Profile | undefined, user: User): Profile {
  return {
    user_id: user.id,
    plan: isPlanName(profile?.plan) ? profile.plan : "free",
    status: profile?.status === "disabled" ? "disabled" : "active",
    admin_notes: profile?.admin_notes ?? null,
    created_at: profile?.created_at ?? user.created_at,
    updated_at: profile?.updated_at ?? user.updated_at ?? user.created_at,
  };
}

async function getLeadCounts(userId: string) {
  const supabase = getSupabaseServiceClient();
  const [{ count: total, error: totalError }, { count: monthly, error: monthlyError }] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("scraped_at", currentMonthStart()),
  ]);

  if (totalError || monthlyError) {
    throw new Error("Unable to load user lead usage.");
  }

  return {
    totalLeads: total ?? 0,
    leadsThisMonth: monthly ?? 0,
  };
}

export async function getAdminSummary(): Promise<AdminSummary> {
  const supabase = getSupabaseServiceClient();
  const [users, profiles, totalLeadsResult, monthlyLeadsResult] = await Promise.all([
    listAllAuthUsers(),
    listAllProfiles(),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("scraped_at", currentMonthStart()),
  ]);

  if (totalLeadsResult.error || monthlyLeadsResult.error) {
    throw new Error("Unable to load lead metrics.");
  }

  const profilesByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const normalized = users.map((user) => normalizedProfile(profilesByUser.get(user.id), user));

  return {
    totalUsers: users.length,
    activeUsers: normalized.filter((profile) => profile.status === "active").length,
    disabledUsers: normalized.filter((profile) => profile.status === "disabled").length,
    leadsThisMonth: monthlyLeadsResult.count ?? 0,
    totalLeads: totalLeadsResult.count ?? 0,
    freeUsers: normalized.filter((profile) => profile.plan === "free").length,
    starterUsers: normalized.filter((profile) => profile.plan === "starter").length,
    proUsers: normalized.filter((profile) => profile.plan === "pro").length,
    agencyUsers: normalized.filter((profile) => profile.plan === "agency").length,
  };
}

export async function getAdminUsers(options: {
  search: string;
  plan?: PlanName;
  status?: ProfileStatus;
  page: number;
  pageSize: number;
}) {
  const [users, profiles] = await Promise.all([listAllAuthUsers(), listAllProfiles()]);
  const profilesByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const search = options.search.trim().toLowerCase();

  const filtered = users
    .map((user) => ({ user, profile: normalizedProfile(profilesByUser.get(user.id), user) }))
    .filter(({ user, profile }) => {
      if (search && !(user.email ?? "").toLowerCase().includes(search)) {
        return false;
      }

      if (options.plan && profile.plan !== options.plan) {
        return false;
      }

      return !options.status || profile.status === options.status;
    })
    .sort((left, right) => Date.parse(right.user.created_at) - Date.parse(left.user.created_at));

  const total = filtered.length;
  const start = (options.page - 1) * options.pageSize;
  const pageUsers = filtered.slice(start, start + options.pageSize);
  const rows = await Promise.all(
    pageUsers.map(async ({ user, profile }): Promise<AdminUserRow> => {
      const counts = await getLeadCounts(user.id);

      return {
        userId: user.id,
        email: user.email ?? "Email unavailable",
        plan: profile.plan,
        status: profile.status,
        createdAt: user.created_at,
        ...counts,
      };
    }),
  );

  return {
    users: rows,
    pagination: {
      page: options.page,
      pageSize: options.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / options.pageSize)),
    },
  };
}

export async function getAdminUserDetail(userId: string) {
  const supabase = getSupabaseServiceClient();
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);

  if (authError || !authData.user) {
    return null;
  }

  const [{ data: profileData, error: profileError }, counts, jobsResult, recentLeadsResult, recentJobsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, plan, status, admin_notes, created_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
      getLeadCounts(userId),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase
        .from("leads")
        .select("id, company_name, source, source_url, scraped_at")
        .eq("user_id", userId)
        .order("scraped_at", { ascending: false })
        .limit(10),
      supabase
        .from("jobs")
        .select("id, source_type, status, results_count, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  if (profileError || jobsResult.error || recentLeadsResult.error || recentJobsResult.error) {
    throw new Error("Unable to load user details.");
  }

  const profile = normalizedProfile(profileData as Profile | undefined, authData.user);

  return {
    userId,
    email: authData.user.email ?? "Email unavailable",
    plan: profile.plan,
    status: profile.status,
    adminNotes: profile.admin_notes ?? "",
    createdAt: authData.user.created_at,
    updatedAt: profile.updated_at,
    jobsCount: jobsResult.count ?? 0,
    ...counts,
    recentLeads: (recentLeadsResult.data ?? []) as Pick<
      Lead,
      "id" | "company_name" | "source" | "source_url" | "scraped_at"
    >[],
    recentJobs: (recentJobsResult.data ?? []) as Pick<
      ScrapeJob,
      "id" | "source_type" | "status" | "results_count" | "created_at"
    >[],
  };
}
