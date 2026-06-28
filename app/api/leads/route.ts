import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/db";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(numberParam(searchParams.get("limit"), 50), 500);
    const offset = numberParam(searchParams.get("offset"), 0);
    const source = searchParams.get("source");
    const jobId = searchParams.get("job_id");
    const supabase = getSupabaseServiceClient();

    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .order("scraped_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (source) {
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lead fetch failed." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
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
    const { error, count } = await supabase.from("leads").delete({ count: "exact" }).in("id", targetIds);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ deletedCount: count ?? targetIds.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lead deletion failed." },
      { status: 500 },
    );
  }
}
