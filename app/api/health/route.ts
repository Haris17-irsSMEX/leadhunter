import { NextResponse } from "next/server";
import { checkCrawl4AIHealth, isCrawl4AIConfigured } from "@/lib/crawl4ai-client";

export async function GET() {
  const crawlerConfigured = isCrawl4AIConfigured();
  return NextResponse.json({
    status: "ok",
    service: "LeadHunter",
    timestamp: new Date().toISOString(),
    optionalServices: {
      crawl4ai: {
        configured: crawlerConfigured,
        healthy: crawlerConfigured ? await checkCrawl4AIHealth() : null,
      },
    },
  });
}
