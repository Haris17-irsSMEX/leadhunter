import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_COOKIE_OPTIONS,
  AUTH_REFRESH_COOKIE,
  VERIFIED_ACCESS_HEADER,
} from "@/lib/auth-constants";

const PUBLIC_PATHS = new Set(["/", "/login", "/privacy", "/terms", "/sitemap.xml", "/robots.txt"]);
const PUBLIC_PREFIXES = ["/auth/", "/api/auth/", "/api/health"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function loginRedirect(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const pathname = request.nextUrl.pathname;

  if (!url || !anonKey) {
    if (isPublicPath(pathname)) {
      return NextResponse.next();
    }

    return pathname.startsWith("/api/")
      ? NextResponse.json({ code: "AUTH_NOT_CONFIGURED", error: "Authentication is not configured." }, { status: 503 })
      : loginRedirect(request);
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const incomingAccessToken = request.cookies.get(AUTH_ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(AUTH_REFRESH_COOKIE)?.value;
  let accessToken = incomingAccessToken;
  let user = incomingAccessToken ? (await supabase.auth.getUser(incomingAccessToken)).data.user : null;
  let refreshedSession: Awaited<ReturnType<typeof supabase.auth.refreshSession>>["data"]["session"] = null;

  if (!user && refreshToken) {
    const refreshed = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    refreshedSession = refreshed.data.session;
    user = refreshed.data.user;
    accessToken = refreshedSession?.access_token;
  }

  if (pathname === "/login" && user) {
    const response = NextResponse.redirect(new URL("/dashboard", request.url));

    if (refreshedSession) {
      response.cookies.set(AUTH_ACCESS_COOKIE, refreshedSession.access_token, {
        ...AUTH_COOKIE_OPTIONS,
        maxAge: refreshedSession.expires_in,
      });
      response.cookies.set(AUTH_REFRESH_COOKIE, refreshedSession.refresh_token, {
        ...AUTH_COOKIE_OPTIONS,
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!user || !accessToken) {
    return pathname.startsWith("/api/")
      ? NextResponse.json({ code: "UNAUTHORIZED", error: "Authentication required." }, { status: 401 })
      : loginRedirect(request);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(VERIFIED_ACCESS_HEADER, accessToken);
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  if (refreshedSession) {
    response.cookies.set(AUTH_ACCESS_COOKIE, refreshedSession.access_token, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: refreshedSession.expires_in,
    });
    response.cookies.set(AUTH_REFRESH_COOKIE, refreshedSession.refresh_token, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
