import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { getCommunityConfig } from "@/lib/community-config";

export async function GET() {
  try {
    await requireUser();
    const config = getCommunityConfig();

    return NextResponse.json({
      communities: config.communitiesEnabled,
      hackernews: config.hackerNewsEnabled,
      reddit: config.redditEnabled,
      indiehackers: config.indieHackersEnabled,
      producthunt: config.productHuntEnabled,
    });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load community availability.");
  }
}
