import "server-only";

import { createClient, type User } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { AUTH_ACCESS_COOKIE, VERIFIED_ACCESS_HEADER } from "@/lib/auth-constants";
import { getSupabaseServiceClient } from "@/lib/db";
import type { ProfileStatus } from "@/lib/types";

function getSupabaseAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase authentication is not configured.");
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminUser(user: Pick<User, "email">) {
  return Boolean(user.email && getAdminEmails().has(user.email.toLowerCase()));
}

export function getAllowedUserIds(user: Pick<User, "id" | "email">) {
  return isAdminUser(user) ? [user.id, "default"] : [user.id];
}

export async function getCurrentUser(): Promise<User | null> {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const accessToken =
    requestHeaders.get(VERIFIED_ACCESS_HEADER)?.trim() || cookieStore.get(AUTH_ACCESS_COOKIE)?.value.trim();

  if (!accessToken) {
    return null;
  }

  const { data, error } = await getSupabaseAuthClient().auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthenticationError();
  }

  const status = await getProfileStatus(user.id);

  if (status === "disabled") {
    throw new AccountDisabledError();
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireUser();

  if (!isAdminUser(user)) {
    throw new AuthorizationError();
  }

  return user;
}

async function getProfileStatus(userId: string): Promise<ProfileStatus> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.from("profiles").select("status").eq("user_id", userId).maybeSingle();

  if (error) {
    const migrationPending =
      error.code === "42703" ||
      error.code === "PGRST204" ||
      error.message.includes("Could not find the 'status' column");

    if (migrationPending) {
      return "active";
    }

    throw new Error("Unable to verify account status.");
  }

  return data?.status === "disabled" ? "disabled" : "active";
}

export class AuthenticationError extends Error {
  readonly status = 401;

  constructor() {
    super("Authentication required.");
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  readonly status = 403;

  constructor() {
    super("Admin access is required.");
    this.name = "AuthorizationError";
  }
}

export class AccountDisabledError extends Error {
  readonly code = "ACCOUNT_DISABLED";
  readonly status = 403;

  constructor() {
    super("Your LeadHunter account is disabled. Contact support.");
    this.name = "AccountDisabledError";
  }
}
