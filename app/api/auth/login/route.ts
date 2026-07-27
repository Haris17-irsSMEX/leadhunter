import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_ACCESS_COOKIE, AUTH_COOKIE_OPTIONS, AUTH_REFRESH_COOKIE } from "@/lib/auth-constants";

function safeLoginError(error: { code?: string; message?: string; status?: number } | null | undefined) {
  const code = error?.code?.toLowerCase() ?? "";
  const normalized = (error?.message ?? "").toLowerCase();

  if (
    error?.status === 429 ||
    code.includes("over_request_rate_limit") ||
    code.includes("too_many_requests") ||
    normalized.includes("rate limit") ||
    normalized.includes("too many")
  ) {
    return {
      error: "Too many attempts. Please wait 10–30 minutes before trying again.",
      code: "LOGIN_RATE_LIMITED",
      status: 429,
    };
  }

  if (code.includes("email_not_confirmed") || normalized.includes("email not confirmed")) {
    return {
      error: "Please confirm your email before signing in.",
      code: "EMAIL_NOT_CONFIRMED",
      status: 401,
    };
  }

  if (
    code.includes("invalid_credentials") ||
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials")
  ) {
    return {
      error: "Email or password is incorrect. Please check your details or reset your password.",
      code: "INVALID_CREDENTIALS",
      status: 401,
    };
  }

  if (code.includes("user_banned") || normalized.includes("banned") || normalized.includes("disabled")) {
    return {
      error: "This account cannot currently sign in. Contact support.",
      code: "ACCOUNT_SIGNIN_DISABLED",
      status: 403,
    };
  }

  return {
    error: "Unable to sign in. Please try again.",
    code: "LOGIN_FAILED",
    status: 401,
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
      const safeError = safeLoginError(error);
      return NextResponse.json({ error: safeError.error, code: safeError.code }, { status: safeError.status });
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
