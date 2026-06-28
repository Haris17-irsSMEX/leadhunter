"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { getLeadBadge } from "@/lib/leadScoring";
import type { JobStatus, Lead } from "@/lib/types";
import { useToast } from "@/lib/useToast";

function statusTone(status: JobStatus["status"]) {
  switch (status) {
    case "done":
      return "border-emerald-400/30 bg-emerald-400/12 text-emerald-100";
    case "failed":
      return "border-rose-400/30 bg-rose-400/12 text-rose-100";
    case "processing":
      return "animate-pulse border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.12)] text-[var(--accent)]";
    default:
      return "border-slate-400/25 bg-slate-400/10 text-slate-200";
  }
}

function previewLeads(leads?: Lead[]) {
  return (leads ?? []).slice(0, 3);
}

type JobStatusCardProps = {
  jobId: string;
  initialJob?: JobStatus | null;
};

export default function JobStatusCard({ jobId, initialJob = null }: JobStatusCardProps) {
  const { showToast } = useToast();
  const [job, setJob] = useState<JobStatus | null>(initialJob);
  const [error, setError] = useState<string | null>(null);
  const [dots, setDots] = useState(".");
  const hasShownErrorToast = useRef(false);

  useEffect(() => {
    setJob(initialJob);
  }, [initialJob]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: NodeJS.Timeout | null = null;
    let dotsId: NodeJS.Timeout | null = null;

    async function loadJob() {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const data = (await response.json()) as JobStatus & { error?: string };

        if (!response.ok) {
          throw new Error(response.status === 429 ? "Too many requests — wait 60 seconds before trying again" : data.error ?? "Unable to load job status.");
        }

        if (!cancelled) {
          setJob(data);
          setError(null);

          if (data.status === "done" || data.status === "failed") {
            if (intervalId) {
              clearInterval(intervalId);
            }
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error(loadError);
          if (!hasShownErrorToast.current) {
            showToast(loadError instanceof Error ? loadError.message : "Unable to load job status.", "error");
            hasShownErrorToast.current = true;
          }
          setError(loadError instanceof Error ? loadError.message : "Unable to load job status.");
        }
      }
    }

    if (!initialJob || initialJob.status === "queued" || initialJob.status === "processing") {
      void loadJob();
      intervalId = setInterval(loadJob, 3000);
      dotsId = setInterval(() => {
        setDots((current) => (current.length >= 3 ? "." : `${current}.`));
      }, 500);
    }

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (dotsId) {
        clearInterval(dotsId);
      }
    };
  }, [initialJob, jobId, showToast]);

  const leads = useMemo(() => previewLeads(job?.leads), [job?.leads]);

  return (
    <article className="app-card text-[var(--text-primary)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{job?.source_type ?? "Scrape job"}</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{jobId}</h3>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(job?.status ?? "queued")}`}>
          {job?.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : null}
          {job?.status === "failed" ? <CircleAlert className="h-4 w-4" /> : null}
          {job?.status === "processing" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {job?.status ?? "queued"}
        </span>
      </div>

      {error ? <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

      {!error && (!job || job.status === "queued" || job.status === "processing") ? (
        <div className="mt-5 rounded-[10px] border border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.12)] px-4 py-4 text-sm text-[var(--accent)]">
          <p className="font-medium">Processing{dots}</p>
          <p className="mt-1 text-[var(--text-secondary)]">This batch scrape is running directly and will update here as soon as it finishes.</p>
        </div>
      ) : null}

      {job?.status === "done" ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/12 px-3 py-1 text-sm font-medium text-emerald-100">
              {job.results_count} leads extracted
            </span>
            <Link href={`/leads?job_id=${encodeURIComponent(jobId)}`} className="text-sm font-medium text-[var(--accent)] transition hover:brightness-110">
              {"View in My Leads ->"}
            </Link>
          </div>

          {leads.length ? (
            <div className="grid gap-3">
              {leads.map((lead) => {
                const badge = getLeadBadge(lead);

                return (
                  <div key={`${lead.id ?? lead.company_name}-${lead.source_url}`} className="rounded-[10px] border border-[var(--border)] bg-[var(--bg)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{lead.company_name}</p>
                        <p className="mt-1 text-sm text-slate-400">{lead.location ?? lead.website ?? lead.source_url}</p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                        {badge.label} {badge.score}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {job?.status === "failed" ? (
        <div className="mt-5 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-4 text-sm text-rose-100">
          <p className="font-medium">This batch run failed.</p>
          <p className="mt-1">{job.error ?? "No error details were returned."}</p>
        </div>
      ) : null}
    </article>
  );
}
