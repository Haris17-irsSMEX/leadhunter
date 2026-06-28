import { NextRequest, NextResponse } from "next/server";
import { insertLead } from "@/lib/db";
import { scrapeWebsite } from "@/lib/sgai";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ error: "A valid URL is required." }, { status: 400 });
    }

    const lead = await scrapeWebsite(url);
    const savedLead = await insertLead(lead);

    return NextResponse.json(savedLead);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Website scrape failed." },
      { status: 500 },
    );
  }
}
