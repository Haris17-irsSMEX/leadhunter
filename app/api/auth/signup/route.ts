import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_ACCESS_COOKIE, AUTH_COOKIE_OPTIONS, AUTH_REFRESH_COOKIE } from "@/lib/auth-constants";

function safeSignupError(error: { message?: string; status?: number }) {
  const normalized = (error.message ?? "").toLowerCase();

  if (error.status === 429 || normalized.includes("rate limit") || normalized.includes("too many")) {
    return {
      error: "Too many signup attempts. Please wait 10–30 minutes before trying again.",
      code: "SIGNUP_RATE_LIMITED",
      status: 429,
    };
  }

  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return {
      error: "An account with this email already exists. Try signing in instead.",
      code: "ACCOUNT_EXISTS",
      status: 400,
    };
  }

  if (normalized.includes("password")) {
    return {
      error: "Password must be at least 8 characters.",
      code: "INVALID_PASSWORD",
      status: 400,
    };
  }

  return {
    error: "Unable to create your account. Please try again.",
    code: "SIGNUP_FAILED",
    status: 400,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || request.nextUrl.origin;
    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${appUrl}/login?confirmed=true`,
      },
    });

    if (error) {
      const safeError = safeSignupError(error);
      return NextResponse.json({ error: safeError.error, code: safeError.code }, { status: safeError.status });
    }

    if (!data.session) {
      return NextResponse.json({
        success: true,
        requiresEmailConfirmation: true,
        message: "Check your email to confirm your account, then sign in.",
      });
    }

    const response = NextResponse.json({
      success: true,
      requiresEmailConfirmation: false,
      user: { id: data.user?.id, email: data.user?.email },
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
    return NextResponse.json({ error: "Unable to create account." }, { status: 500 });
  }
}
