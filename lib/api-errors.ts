import { NextResponse } from "next/server";
import { AccountDisabledError, AuthenticationError, AuthorizationError } from "@/lib/auth";
import { MonthlyLimitError } from "@/lib/usage";

export function apiErrorResponse(error: unknown, fallback: string) {
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ code: "UNAUTHORIZED", error: error.message }, { status: error.status });
  }

  if (error instanceof AccountDisabledError || error instanceof AuthorizationError) {
    return NextResponse.json(
      { code: error.code, error: error.message, message: error.message },
      { status: error.status },
    );
  }

  if (error instanceof MonthlyLimitError) {
    return NextResponse.json(
      {
        code: error.code,
        error: error.message,
        message: error.message,
        usage: error.usage,
      },
      { status: error.status },
    );
  }

  if (error instanceof PublicApiError) {
    return NextResponse.json(
      { code: error.code, error: error.message, message: error.message },
      { status: error.status },
    );
  }

  console.error(`[api] ${fallback}`, error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export class PublicApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "PublicApiError";
  }
}
