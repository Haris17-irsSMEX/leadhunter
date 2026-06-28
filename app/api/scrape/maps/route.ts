import { NextRequest, NextResponse } from "next/server";
import { insertLeads } from "@/lib/db";
import { scrapeGoogleMaps } from "@/lib/sgai";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      query?: string;
      location?: string;
      numResults?: number;
    };
    const query = body.query?.trim();
    const location = body.location?.trim();
    const requestedResults = Number(body.numResults ?? 20);
    const numResults = Number.isFinite(requestedResults) ? Math.min(Math.max(requestedResults, 1), 50) : 20;

    if (!query || !location) {
      return NextResponse.json({ error: "Both query and location are required." }, { status: 400 });
    }

    const leads = await scrapeGoogleMaps(query, location, numResults);
    const savedLeads = await insertLeads(leads);

    return NextResponse.json({ count: savedLeads.length, leads: savedLeads });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Google Maps scrape failed." },
      { status: 500 },
    );
  }
}
