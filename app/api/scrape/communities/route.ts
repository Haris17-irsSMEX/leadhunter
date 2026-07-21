import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { clampCommunityLimit, getCommunityConfig } from "@/lib/community-config";
import {
  scrapeHackerNews,
  scrapeIndieHackers,
  scrapeProductHunt,
  scrapeReddit,
  type HackerNewsMode,
  type IndieHackersMode,
  type ProductHuntMode,
  type RedditMode,
} from "@/lib/community-scrapers";
import { getSupabaseServiceClient, withScrapedAt } from "@/lib/db";
import type { Lead } from "@/lib/types";
import { getAllowedLeadCount } from "@/lib/usage";

export const runtime = "nodejs";

const HN_MODES = new Set<HackerNewsMode>(["show_hn", "ask_hn", "jobs", "who_is_hiring"]);
const REDDIT_MODES = new Set<RedditMode>(["subreddit", "search"]);
const INDIE_HACKERS_MODES = new Set<IndieHackersMode>(["products"]);
const PRODUCT_HUNT_MODES = new Set<ProductHuntMode>(["front_page"]);

type CommunitySource = "hackernews" | "reddit" | "indiehackers" | "producthunt";

function isCommunitySource(value: unknown): value is CommunitySource {
  return value === "hackernews" || value === "reddit" || value === "indiehackers" || value === "producthunt";
}

function isHackerNewsMode(value: string): value is HackerNewsMode {
  return HN_MODES.has(value as HackerNewsMode);
}

function isRedditMode(value: string): value is RedditMode {
  return REDDIT_MODES.has(value as RedditMode);
}

function isIndieHackersMode(value: string): value is IndieHackersMode {
  return INDIE_HACKERS_MODES.has(value as IndieHackersMode);
}

function isProductHuntMode(value: string): value is ProductHuntMode {
  return PRODUCT_HUNT_MODES.has(value as ProductHuntMode);
}

async function insertCommunityLeads(leads: Lead[], userId: string, allowedUserIds: string[]) {
  if (!leads.length) {
    return { inserted: [] as Lead[], skippedDuplicates: 0, leads: [] as Lead[], errors: [] as string[] };
  }

  const supabase = getSupabaseServiceClient();
  const errors: string[] = [];
  const source = leads[0].source;
  const externalIds = leads.map((lead) => lead.source_external_id).filter((value): value is string => Boolean(value));
  const existingByExternalId = new Map<string, Lead>();

  if (externalIds.length) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("source", source)
      .in("source_external_id", externalIds)
      .in("user_id", allowedUserIds);

    if (error) {
      throw new Error(error.message);
    }

    for (const lead of (data ?? []) as Lead[]) {
      if (lead.source_external_id) {
        existingByExternalId.set(lead.source_external_id, lead);
      }
    }
  }

  const inserted: Lead[] = [];
  const resultLeads: Lead[] = [];
  let skippedDuplicates = 0;

  for (const lead of leads) {
    const existing = lead.source_external_id ? existingByExternalId.get(lead.source_external_id) : undefined;

    if (existing) {
      skippedDuplicates += 1;
      resultLeads.push({ ...existing, scrape_status: "already_saved" });
      continue;
    }

    const { data, error } = await supabase
      .from("leads")
      .insert(withScrapedAt({ ...lead, user_id: userId }))
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        skippedDuplicates += 1;
        resultLeads.push({ ...lead, scrape_status: "skipped_duplicate" });
        continue;
      }

      errors.push(`Failed to insert ${lead.source} lead ${lead.source_external_id ?? lead.source_url}`);
      continue;
    }

    const insertedLead = { ...(data as Lead), scrape_status: "new" as const };
    inserted.push(insertedLead);
    resultLeads.push(insertedLead);
    if (lead.source_external_id) {
      existingByExternalId.set(lead.source_external_id, data as Lead);
    }
  }

  return { inserted, skippedDuplicates, leads: resultLeads, errors };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const config = getCommunityConfig();

    if (!config.communitiesEnabled) {
      return NextResponse.json({ error: "Communities scraping is disabled." }, { status: 403 });
    }

    let body: {
      source?: unknown;
      mode?: unknown;
      query?: unknown;
      limit?: unknown;
    };

    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const source = body.source;
    const mode = typeof body.mode === "string" ? body.mode.trim() : "";
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const limit = clampCommunityLimit(body.limit, config.maxResults);

    if (!isCommunitySource(source)) {
      return NextResponse.json({ error: "source must be hackernews, reddit, indiehackers, or producthunt." }, { status: 400 });
    }

    const allowedUserIds = getAllowedUserIds(user);

    if (source === "hackernews") {
      if (!config.hackerNewsEnabled) {
        return NextResponse.json({ error: "Hacker News scraping is disabled." }, { status: 403 });
      }

      if (!isHackerNewsMode(mode)) {
        return NextResponse.json({ error: "Invalid Hacker News mode." }, { status: 400 });
      }

      const { allowed, usage } = await getAllowedLeadCount(user, limit);
      const scraped = await scrapeHackerNews(mode, query, allowed, config);
      const saved = await insertCommunityLeads(scraped.leads.slice(0, allowed), user.id, allowedUserIds);

      return NextResponse.json({
        count: scraped.leads.length,
        inserted: saved.inserted.length,
        skippedDuplicates: saved.skippedDuplicates,
        leads: saved.leads,
        errors: [...scraped.errors, ...saved.errors],
        usage,
      });
    }

    if (source === "indiehackers") {
      if (!config.indieHackersEnabled) {
        return NextResponse.json(
          { error: "Indie Hackers scraping is disabled. Set INDIEHACKERS_ENABLED=true in .env.local." },
          { status: 403 },
        );
      }

      if (!process.env.SGAI_API_KEY?.trim()) {
        return NextResponse.json({ error: "SGAI_API_KEY is required for Indie Hackers scraping." }, { status: 400 });
      }

      if (!isIndieHackersMode(mode)) {
        return NextResponse.json({ error: "Invalid Indie Hackers mode." }, { status: 400 });
      }

      const { allowed, usage } = await getAllowedLeadCount(user, limit);
      const scraped = await scrapeIndieHackers(mode, query, allowed, config);
      const saved = await insertCommunityLeads(scraped.leads.slice(0, allowed), user.id, allowedUserIds);

      return NextResponse.json({
        count: scraped.leads.length,
        inserted: saved.inserted.length,
        skippedDuplicates: saved.skippedDuplicates,
        leads: saved.leads,
        errors: [...scraped.errors, ...saved.errors],
        usage,
      });
    }

    if (source === "producthunt") {
      if (!config.productHuntEnabled) {
        return NextResponse.json(
          { error: "Product Hunt scraping is disabled. Set PRODUCTHUNT_ENABLED=true in .env.local." },
          { status: 403 },
        );
      }

      if (!process.env.SGAI_API_KEY?.trim()) {
        return NextResponse.json({ error: "SGAI_API_KEY is required for Product Hunt scraping." }, { status: 400 });
      }

      if (!isProductHuntMode(mode)) {
        return NextResponse.json({ error: "Invalid Product Hunt mode." }, { status: 400 });
      }

      const { allowed, usage } = await getAllowedLeadCount(user, limit);
      const scraped = await scrapeProductHunt(mode, query, allowed, config);
      const saved = await insertCommunityLeads(scraped.leads.slice(0, allowed), user.id, allowedUserIds);

      return NextResponse.json({
        count: scraped.leads.length,
        inserted: saved.inserted.length,
        skippedDuplicates: saved.skippedDuplicates,
        leads: saved.leads,
        errors: [...scraped.errors, ...saved.errors],
        usage,
      });
    }

    if (!config.redditEnabled) {
      return NextResponse.json({ error: "Reddit scraping is disabled." }, { status: 403 });
    }

    if (!isRedditMode(mode)) {
      return NextResponse.json({ error: "Invalid Reddit mode." }, { status: 400 });
    }

    if (!query) {
      return NextResponse.json({ error: "query is required for Reddit scraping." }, { status: 400 });
    }

    const { allowed, usage } = await getAllowedLeadCount(user, limit);
    const scraped = await scrapeReddit(mode, query, allowed, config);
    const saved = await insertCommunityLeads(scraped.leads.slice(0, allowed), user.id, allowedUserIds);

    return NextResponse.json({
      count: scraped.leads.length,
      inserted: saved.inserted.length,
      skippedDuplicates: saved.skippedDuplicates,
      leads: saved.leads,
      errors: [...scraped.errors, ...saved.errors],
      usage,
    });
  } catch (error) {
    return apiErrorResponse(error, "Community scrape failed.");
  }
}
