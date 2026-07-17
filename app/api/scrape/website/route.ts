import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, PublicApiError } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { insertLead } from "@/lib/db";
import { scrapeWebsite } from "@/lib/sgai";
import { getAllowedLeadCount } from "@/lib/usage";
import { normalizePublicHttpUrl } from "@/lib/urls";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ error: "A valid URL is required." }, { status: 400 });
    }

    let normalizedUrl: string;
    try {
      normalizedUrl = normalizePublicHttpUrl(url);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "A valid public URL is required." },
        { status: 400 },
      );
    }

    await getAllowedLeadCount(user, 1);
    const lead = await scrapeWebsite(normalizedUrl);

    if (lead.company_name === "SCRAPE_FAILED") {
      throw new PublicApiError(
        "Website scraping is temporarily unavailable. Please try again later.",
        503,
        "PROVIDER_UNAVAILABLE",
      );
    }

    const savedLead = await insertLead(lead, user.id);

    return NextResponse.json(savedLead);
  } catch (error) {
    return apiErrorResponse(error, "Website scrape failed.");
  }
}
