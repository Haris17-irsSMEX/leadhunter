export const AUTH_ACCESS_COOKIE = "leadhunter-access-token";
export const AUTH_REFRESH_COOKIE = "leadhunter-refresh-token";
export const VERIFIED_ACCESS_HEADER = "x-leadhunter-access-token";

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
