import { NextRequest, NextResponse } from "next/server";
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

async function insertCommunityLeads(leads: Lead[]) {
  if (!leads.length) {
    return { inserted: [] as Lead[], skippedDuplicates: 0, errors: [] as string[] };
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
      .or("user_id.eq.default,user_id.is.null");

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
  let skippedDuplicates = 0;

  for (const lead of leads) {
    if (lead.source_external_id && existingByExternalId.has(lead.source_external_id)) {
      skippedDuplicates += 1;
      continue;
    }

    const { data, error } = await supabase.from("leads").insert(withScrapedAt(lead)).select("*").single();

    if (error) {
      if (error.code === "23505") {
        skippedDuplicates += 1;
        continue;
      }

      errors.push(`Failed to insert ${lead.source} lead ${lead.source_external_id ?? lead.source_url}`);
      continue;
    }

    inserted.push(data as Lead);
    if (lead.source_external_id) {
      existingByExternalId.set(lead.source_external_id, data as Lead);
    }
  }

  return { inserted, skippedDuplicates, errors };
}

export async function POST(request: NextRequest) {
  try {
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

    if (source === "hackernews") {
      if (!config.hackerNewsEnabled) {
        return NextResponse.json({ error: "Hacker News scraping is disabled." }, { status: 403 });
      }

      if (!isHackerNewsMode(mode)) {
        return NextResponse.json({ error: "Invalid Hacker News mode." }, { status: 400 });
      }

      const scraped = await scrapeHackerNews(mode, query, limit, config);
      const saved = await insertCommunityLeads(scraped.leads);

      return NextResponse.json({
        count: scraped.leads.length,
        inserted: saved.inserted.length,
        skippedDuplicates: saved.skippedDuplicates,
        leads: saved.inserted,
        errors: [...scraped.errors, ...saved.errors],
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

      const scraped = await scrapeIndieHackers(mode, query, limit, config);
      const saved = await insertCommunityLeads(scraped.leads);

      return NextResponse.json({
        count: scraped.leads.length,
        inserted: saved.inserted.length,
        skippedDuplicates: saved.skippedDuplicates,
        leads: saved.inserted,
        errors: [...scraped.errors, ...saved.errors],
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

      const scraped = await scrapeProductHunt(mode, query, limit, config);
      const saved = await insertCommunityLeads(scraped.leads);

      return NextResponse.json({
        count: scraped.leads.length,
        inserted: saved.inserted.length,
        skippedDuplicates: saved.skippedDuplicates,
        leads: saved.inserted,
        errors: [...scraped.errors, ...saved.errors],
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

    const scraped = await scrapeReddit(mode, query, limit, config);
    const saved = await insertCommunityLeads(scraped.leads);

    return NextResponse.json({
      count: scraped.leads.length,
      inserted: saved.inserted.length,
      skippedDuplicates: saved.skippedDuplicates,
      leads: saved.inserted,
      errors: [...scraped.errors, ...saved.errors],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Community scrape failed." },
      { status: 500 },
    );
  }
}
