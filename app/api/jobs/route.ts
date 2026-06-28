import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/db";
import type { ScrapeJob } from "@/lib/types";

export const runtime = "nodejs";

type JobSummary = ScrapeJob & {
  input_summary?: string;
};

function summarizeSourceUrl(value?: string) {
  if (!value) {
    return "";
  }

  if (value.startsWith("maps:")) {
    return value.replace("maps:", "").trim();
  }

  return value;
}

export async function GET() {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(20);

    if (error) {
      throw new Error(error.message);
    }

    const jobs = (data ?? []) as ScrapeJob[];
    const jobIds = jobs.map((job) => job.id);
    const summaries = new Map<string, string>();

    if (jobIds.length) {
      const { data: leadRows, error: leadError } = await supabase
        .from("leads")
        .select("job_id, source_url")
        .in("job_id", jobIds)
        .order("scraped_at", { ascending: false });

      if (leadError) {
        throw new Error(leadError.message);
      }

      for (const row of leadRows ?? []) {
        const jobId = typeof row.job_id === "string" ? row.job_id : "";
        if (!jobId || summaries.has(jobId)) {
          continue;
        }

        summaries.set(jobId, summarizeSourceUrl(typeof row.source_url === "string" ? row.source_url : ""));
      }
    }

    const payload: JobSummary[] = jobs.map((job) => ({
      ...job,
      input_summary: summaries.get(job.id) || `${job.source_type} job`,
    }));

    return NextResponse.json({ jobs: payload });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Jobs fetch failed." },
      { status: 500 },
    );
  }
}
