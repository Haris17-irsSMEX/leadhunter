import { createClient } from "@supabase/supabase-js";
import DashboardClient from "@/components/DashboardClient";
import { getAllowedUserIds } from "@/lib/auth";
import { requirePageUser } from "@/lib/page-auth";
import type { Lead, ScrapeJob } from "@/lib/types";
import { getUsageSummary } from "@/lib/usage";

export const dynamic = "force-dynamic";

type DashboardJob = ScrapeJob & {
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

async function loadDashboardData() {
  const user = await requirePageUser();
  const allowedUserIds = getAllowedUserIds(user);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const [{ data: leadRows, error: leadsError, count }, { data: jobRows, error: jobsError }, usage] = await Promise.all([
    supabase
      .from("leads")
      .select("*", { count: "exact" })
      .in("user_id", allowedUserIds)
      .order("scraped_at", { ascending: false })
      .range(0, 4),
    supabase.from("jobs").select("*").in("user_id", allowedUserIds).order("created_at", { ascending: false }).limit(10),
    getUsageSummary(user),
  ]);

  if (leadsError) {
    throw new Error(leadsError.message);
  }

  if (jobsError) {
    throw new Error(jobsError.message);
  }

  const leads = (leadRows ?? []) as Lead[];
  const jobs = (jobRows ?? []) as ScrapeJob[];
  const jobIds = jobs.map((job) => job.id);
  const summaries = new Map<string, string>();

  if (jobIds.length) {
    const { data: summaryRows, error: summaryError } = await supabase
      .from("leads")
      .select("job_id, source_url")
      .in("job_id", jobIds)
      .in("user_id", allowedUserIds)
      .order("scraped_at", { ascending: false });

    if (summaryError) {
      throw new Error(summaryError.message);
    }

    for (const row of summaryRows ?? []) {
      const jobId = typeof row.job_id === "string" ? row.job_id : "";
      if (!jobId || summaries.has(jobId)) {
        continue;
      }

      summaries.set(jobId, summarizeSourceUrl(typeof row.source_url === "string" ? row.source_url : ""));
    }
  }

  const dashboardJobs: DashboardJob[] = jobs.map((job) => ({
    ...job,
    input_summary: summaries.get(job.id) || `${job.source_type} job`,
  }));

  return {
    leads,
    totalLeads: count ?? 0,
    jobs: dashboardJobs,
    usage,
  };
}

export default async function DashboardPage() {
  const { leads, totalLeads, jobs, usage } = await loadDashboardData();

  return <DashboardClient initialLeads={leads} initialTotalLeads={totalLeads} initialJobs={jobs} initialUsage={usage} />;
}
