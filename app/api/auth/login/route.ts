import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_ACCESS_COOKIE, AUTH_COOKIE_OPTIONS, AUTH_REFRESH_COOKIE } from "@/lib/auth-constants";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
    }

    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      return NextResponse.json({ error: error?.message ?? "Unable to sign in." }, { status: 401 });
    }

    const response = NextResponse.json({
      success: true,
      user: { id: data.user.id, email: data.user.email },
    });
    response.cookies.set(AUTH_ACCESS_COOKIE, data.session.access_token, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: data.session.expires_in,
    });
    response.cookies.set(AUTH_REFRESH_COOKIE, data.session.refresh_token, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}
