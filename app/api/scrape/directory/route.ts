import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { insertLeads } from "@/lib/db";
import { scrapeDirectory } from "@/lib/sgai";
import { getAllowedLeadCount } from "@/lib/usage";
import { normalizePublicHttpUrl } from "@/lib/urls";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ error: "A directory URL is required." }, { status: 400 });
    }

    const { allowed, usage } = await getAllowedLeadCount(user, 50);
    let normalizedUrl: string;
    try {
      normalizedUrl = normalizePublicHttpUrl(url);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "A valid public URL is required." },
        { status: 400 },
      );
    }

    const leads = await scrapeDirectory(normalizedUrl);
    const savedLeads = await insertLeads(leads.slice(0, allowed), user.id);

    return NextResponse.json({ count: savedLeads.length, leads: savedLeads, usage });
  } catch (error) {
    return apiErrorResponse(error, "Directory scrape failed.");
  }
}
