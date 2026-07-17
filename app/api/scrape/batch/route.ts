import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { insertJob, insertLeads, updateJob } from "@/lib/db";
import { scrapeMultiple } from "@/lib/sgai";
import type { Lead, ScrapeJob } from "@/lib/types";
import { getAllowedLeadCount } from "@/lib/usage";
import { normalizePublicHttpUrl } from "@/lib/urls";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let job_id: string | null = null;
  let userId: string | null = null;

  try {
    const user = await requireUser();
    userId = user.id;
    const body = (await request.json()) as { urls?: string[] };
    const inputUrls = Array.isArray(body.urls)
      ? [...new Set(body.urls.map((url) => url.trim()).filter(Boolean))].slice(0, 50)
      : [];

    if (!inputUrls.length) {
      return NextResponse.json({ error: "At least one URL is required." }, { status: 400 });
    }

    let urls: string[];
    try {
      urls = inputUrls.map(normalizePublicHttpUrl);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Every entry must be a valid public URL." },
        { status: 400 },
      );
    }

    const { allowed, usage } = await getAllowedLeadCount(user, urls.length);
    const allowedUrls = urls.slice(0, allowed);
    job_id = crypto.randomUUID();
    const job: ScrapeJob = {
      id: job_id,
      status: "processing",
      source_type: "batch",
      results_count: 0,
      created_at: new Date().toISOString(),
    };

    await insertJob(job, user.id);
    const leads = await scrapeMultiple(allowedUrls);
    const leadsWithJobId = leads
      .filter((lead) => lead.company_name !== "SCRAPE_FAILED")
      .map((lead) => ({ ...lead, job_id })) as Lead[];
    const savedLeads = await insertLeads(leadsWithJobId.slice(0, allowed), user.id);
    await updateJob(job_id, {
      status: "done",
      results_count: savedLeads.length,
      completed_at: new Date().toISOString(),
    }, user.id);

    return NextResponse.json({ job_id, status: "done", count: savedLeads.length, leads: savedLeads, usage });
  } catch (error) {
    if (job_id && userId) {
      await updateJob(job_id, {
        status: "failed",
        error: "Batch scraping failed.",
        completed_at: new Date().toISOString(),
      }, userId).catch(() => undefined);
    }

    return apiErrorResponse(error, "Batch scraping failed.");
  }
}
