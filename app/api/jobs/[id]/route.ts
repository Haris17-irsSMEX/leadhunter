import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/db";
import type { JobStatus, Lead, ScrapeJob } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseServiceClient();
    const { data: job, error: jobError } = await supabase.from("jobs").select("*").eq("id", id).single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    const status: JobStatus = job as ScrapeJob;

    if (status.status === "done") {
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("*")
        .eq("job_id", id)
        .order("scraped_at", { ascending: false })
        .limit(10);

      if (leadsError) {
        throw new Error(leadsError.message);
      }

      status.leads = (leads ?? []) as Lead[];
    }

    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job status fetch failed." },
      { status: 500 },
    );
  }
}
