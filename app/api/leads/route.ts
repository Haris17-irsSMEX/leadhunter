import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/db";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
type SourceFilter = Lead["source"] | "communities";

const ALLOWED_SOURCES = new Set<SourceFilter>([
  "website",
  "google_maps",
  "directory",
  "hackernews",
  "reddit",
  "indiehackers",
  "producthunt",
  "communities",
]);
const ALLOWED_WEBSITE_FILTERS = new Set(["all", "has_website", "no_website"]);
const ALLOWED_RESTAURANT_ENRICHMENT_FILTERS = new Set([
  "all",
  "has_public_email",
  "no_public_email",
  "ubereats_found",
  "doordash_found",
  "any_delivery_found",
  "ubereats_or_doordash_found",
  "not_checked",
  "grubhub_found",
  "deliveroo_found",
  "justeat_found",
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
    const websiteFilter = searchParams.get("website_status") ?? "all";
    const restaurantEnrichmentFilter = searchParams.get("restaurant_enrichment") ?? "all";
    const jobId = searchParams.get("job_id");
    const supabase = getSupabaseServiceClient();

    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .in("user_id", getAllowedUserIds(user))
      .order("scraped_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (source) {
      if (!ALLOWED_SOURCES.has(source as SourceFilter)) {
        return NextResponse.json({ error: "Invalid lead source." }, { status: 400 });
      }

      if (source === "communities") {
        query = query.in("source", ["hackernews", "reddit", "indiehackers", "producthunt"]);
      } else {
        query = query.eq("source", source);
      }
    }

    if (!ALLOWED_WEBSITE_FILTERS.has(websiteFilter)) {
      return NextResponse.json({ error: "Invalid website status filter." }, { status: 400 });
    }

    if (websiteFilter === "has_website") {
      query = query.not("website", "is", null).neq("website", "");
    } else if (websiteFilter === "no_website") {
      query = query.or("website.is.null,website.eq.");
    }

    if (!ALLOWED_RESTAURANT_ENRICHMENT_FILTERS.has(restaurantEnrichmentFilter)) {
      return NextResponse.json({ error: "Invalid restaurant enrichment filter." }, { status: 400 });
    }

    if (restaurantEnrichmentFilter === "has_public_email") {
      query = query.not("email", "is", null).neq("email", "");
    } else if (restaurantEnrichmentFilter === "no_public_email") {
      query = query.or("email.is.null,email.eq.");
    } else if (restaurantEnrichmentFilter === "ubereats_found") {
      query = query.eq("delivery_ubereats_status", "found");
    } else if (restaurantEnrichmentFilter === "doordash_found") {
      query = query.eq("delivery_doordash_status", "found");
    } else if (restaurantEnrichmentFilter === "grubhub_found") {
      query = query.eq("delivery_grubhub_status", "found");
    } else if (restaurantEnrichmentFilter === "deliveroo_found") {
      query = query.eq("delivery_deliveroo_status", "found");
    } else if (restaurantEnrichmentFilter === "justeat_found") {
      query = query.eq("delivery_justeat_status", "found");
    } else if (restaurantEnrichmentFilter === "any_delivery_found") {
      query = query.or(
        "delivery_ubereats_status.eq.found,delivery_doordash_status.eq.found,delivery_grubhub_status.eq.found,delivery_deliveroo_status.eq.found,delivery_justeat_status.eq.found",
      );
    } else if (restaurantEnrichmentFilter === "ubereats_or_doordash_found") {
      query = query.or("delivery_ubereats_status.eq.found,delivery_doordash_status.eq.found");
    } else if (restaurantEnrichmentFilter === "not_checked") {
      query = query.or("restaurant_enrichment_status.is.null,restaurant_enrichment_status.eq.not_checked");
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
