import "server-only";

import { createClient, type User } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { AUTH_ACCESS_COOKIE, VERIFIED_ACCESS_HEADER } from "@/lib/auth-constants";

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

  return user;
}

export class AuthenticationError extends Error {
  readonly status = 401;

  constructor() {
    super("Authentication required.");
    this.name = "AuthenticationError";
  }
}
