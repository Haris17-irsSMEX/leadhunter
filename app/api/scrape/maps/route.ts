import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { insertLeads } from "@/lib/db";
import { scrapeGoogleMaps } from "@/lib/sgai";
import { getAllowedLeadCount } from "@/lib/usage";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
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

    const { allowed, usage } = await getAllowedLeadCount(user, numResults);
    const leads = await scrapeGoogleMaps(query, location, allowed);
    const savedLeads = await insertLeads(leads.slice(0, allowed), user.id);

    return NextResponse.json({ count: savedLeads.length, leads: savedLeads, usage });
  } catch (error) {
    return apiErrorResponse(error, "Google Maps scrape failed.");
  }
}
