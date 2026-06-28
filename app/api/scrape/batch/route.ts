import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { insertJob, insertLeads, updateJob } from "@/lib/db";
import { scrapeMultiple } from "@/lib/sgai";
import type { Lead, ScrapeJob } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let job_id: string | null = null;

  try {
    const body = (await request.json()) as { urls?: string[] };
    const urls = Array.isArray(body.urls) ? body.urls.map((url) => url.trim()).filter(Boolean) : [];

    if (!urls.length) {
      return NextResponse.json({ error: "At least one URL is required." }, { status: 400 });
    }

    job_id = crypto.randomUUID();
    const job: ScrapeJob = {
      id: job_id,
      status: "processing",
      source_type: "batch",
      results_count: 0,
      created_at: new Date().toISOString(),
    };

    await insertJob(job);
    const leads = await scrapeMultiple(urls);
    const leadsWithJobId = leads.map((lead) => ({ ...lead, job_id })) as Lead[];
    const savedLeads = await insertLeads(leadsWithJobId);
    await updateJob(job_id, {
      status: "done",
      results_count: savedLeads.length,
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({ job_id, status: "done", count: savedLeads.length, leads: savedLeads });
  } catch (error) {
    if (job_id) {
      await updateJob(job_id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Batch scraping failed.",
        completed_at: new Date().toISOString(),
      }).catch(() => undefined);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch scraping failed." },
      { status: 500 },
    );
  }
}
