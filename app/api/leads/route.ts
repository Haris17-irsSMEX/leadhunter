import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/db";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
const ALLOWED_SOURCES = new Set<Lead["source"]>([
  "website",
  "google_maps",
  "directory",
  "hackernews",
  "reddit",
  "indiehackers",
  "producthunt",
]);

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(numberParam(searchParams.get("limit"), 50), 500);
    const offset = numberParam(searchParams.get("offset"), 0);
    const source = searchParams.get("source");
    const jobId = searchParams.get("job_id");
    const supabase = getSupabaseServiceClient();

    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .in("user_id", getAllowedUserIds(user))
      .order("scraped_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (source) {
      if (!ALLOWED_SOURCES.has(source as Lead["source"])) {
        return NextResponse.json({ error: "Invalid lead source." }, { status: 400 });
      }

      query = query.eq("source", source);
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ leads: (data ?? []) as Lead[], total: count ?? 0 });
  } catch (error) {
    return apiErrorResponse(error, "Lead fetch failed.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");
    const ids = searchParams
      .get("ids")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const targetIds = [...new Set([id, ...(ids ?? [])].filter((value): value is string => Boolean(value)))];

    if (!targetIds.length) {
      return NextResponse.json({ error: "At least one lead id is required." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { error, count } = await supabase
      .from("leads")
      .delete({ count: "exact" })
      .in("id", targetIds)
      .in("user_id", getAllowedUserIds(user));

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ deletedCount: count ?? targetIds.length });
  } catch (error) {
    return apiErrorResponse(error, "Lead deletion failed.");
  }
}
