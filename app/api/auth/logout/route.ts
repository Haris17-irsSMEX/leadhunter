import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_ACCESS_COOKIE, AUTH_COOKIE_OPTIONS, AUTH_REFRESH_COOKIE } from "@/lib/auth-constants";

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(AUTH_ACCESS_COOKIE)?.value;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (accessToken && url && anonKey) {
    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await supabase.auth.admin.signOut(accessToken).catch(() => undefined);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(AUTH_ACCESS_COOKIE, "", { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
  response.cookies.set(AUTH_REFRESH_COOKIE, "", { ...AUTH_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
