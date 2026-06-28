import { NextRequest, NextResponse } from "next/server";
import { insertLeads } from "@/lib/db";
import { scrapeDirectory } from "@/lib/sgai";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ error: "A directory URL is required." }, { status: 400 });
    }

    const leads = await scrapeDirectory(url);
    const savedLeads = await insertLeads(leads);

    return NextResponse.json({ count: savedLeads.length, leads: savedLeads });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Directory scrape failed." },
      { status: 500 },
    );
  }
}
