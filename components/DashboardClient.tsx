"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Compass,
  ExternalLink,
  FileSpreadsheet,
  Layers3,
  Loader2,
  MapPinned,
  Search,
  Workflow,
  Clock3,
} from "lucide-react";
import GoogleSheetsModal from "@/components/GoogleSheetsModal";
import { useToast } from "@/lib/useToast";
import type { Lead, ScrapeJob } from "@/lib/types";
import type { UsageSummary } from "@/lib/usage";

type DashboardJob = ScrapeJob & {
  input_summary?: string;
};

function formatRelative(value?: string) {
  if (!value) {
    return "Unknown";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return "Just now";
  }

  if (diff < hour) {
    const count = Math.floor(diff / minute);
    return `${count} minute${count === 1 ? "" : "s"} ago`;
  }

  if (diff < day) {
    const count = Math.floor(diff / hour);
    return `${count} hour${count === 1 ? "" : "s"} ago`;
  }

  const count = Math.floor(diff / day);
  return `${count} day${count === 1 ? "" : "s"} ago`;
}

function sourceBadgeClass(source: Lead["source"]) {
  if (source === "google_maps") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }

  if (source === "directory") {
    return "border-violet-400/30 bg-violet-400/10 text-violet-200";
  }

  if (source === "hackernews") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  }

  if (source === "reddit") {
    return "border-orange-400/30 bg-orange-400/10 text-orange-200";
  }

  if (source === "indiehackers") {
    return "border-indigo-400/30 bg-indigo-400/10 text-indigo-200";
  }

  if (source === "producthunt") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  }

  return "border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.12)] text-[var(--accent)]";
}

function sourceLabel(source: Lead["source"]) {
  if (source === "google_maps") {
    return "Google Maps";
  }

  if (source === "directory") {
    return "Directory";
  }

  if (source === "hackernews") {
    return "Hacker News";
  }

  if (source === "reddit") {
    return "Reddit";
  }

  if (source === "indiehackers") {
    return "Indie Hackers";
  }

  if (source === "producthunt") {
    return "Product Hunt";
  }

  return "Website";
}

function statusTone(status: ScrapeJob["status"]) {
  if (status === "done") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  }

  if (status === "failed") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (status === "processing") {
    return "animate-pulse border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.12)] text-[var(--accent)]";
  }

  return "border-slate-400/25 bg-slate-400/10 text-slate-200";
}

function getApiErrorMessage(response: Response, fallback: string) {
  if (response.status === 429) {
    if (fallback.toLowerCase().includes("monthly") || fallback.toLowerCase().includes("lead limit")) {
      return fallback;
    }

    return "Too many requests - wait 60 seconds before trying again";
  }

  return fallback;
}

function logAndToast(error: unknown, fallback: string, showToast: (message: string, type?: "success" | "error") => void) {
  const message = error instanceof Error ? error.message : fallback;
  console.error(error);
  showToast(message, "error");
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Layers3;
  tone: string;
}) {
  return (
    <article className="app-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="app-label">{label}</p>
          <p className="mt-3 text-[32px] font-bold leading-none text-[var(--text-primary)]">{value}</p>
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

type DashboardClientProps = {
  initialLeads: Lead[];
  initialTotalLeads: number;
  initialJobs: DashboardJob[];
  initialUsage: UsageSummary;
};

export default function DashboardClient({ initialLeads, initialTotalLeads, initialJobs, initialUsage }: DashboardClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [totalLeads, setTotalLeads] = useState(initialTotalLeads);
  const [jobs] = useState<DashboardJob[]>(initialJobs);
  const [quickUrl, setQuickUrl] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickLead, setQuickLead] = useState<Lead | null>(null);
  const [showSheetsModal, setShowSheetsModal] = useState(false);
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "irssmex@gmail.com";

  const stats = useMemo(() => {
    const todayKey = new Date().toDateString();

    return {
      totalLeads,
      scrapedToday: leads.filter((lead) => lead.scraped_at && new Date(lead.scraped_at).toDateString() === todayKey).length,
      googleMapsLeads: leads.filter((lead) => lead.source === "google_maps").length,
      jobsRun: jobs.length,
    };
  }, [jobs.length, leads, totalLeads]);

  async function handleQuickScrape() {
    setQuickLoading(true);
    setQuickLead(null);

    try {
      const response = await fetch("/api/scrape/website", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: quickUrl.trim() }),
      });
      const payload = (await response.json()) as Lead & { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload.error ?? "Unable to scrape website."));
      }

      setQuickLead(payload);
      setLeads((current) => [payload, ...current.filter((lead) => lead.id !== payload.id)].slice(0, 5));
      setTotalLeads((current) => current + 1);
      showToast("Lead scraped successfully.", "success");
    } catch (error) {
      logAndToast(error, "Unable to scrape website.", showToast);
    } finally {
      setQuickLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="app-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="app-label text-[var(--accent)]">Dashboard</p>
            <h1 className="app-page-title mt-3">Lead scraping activity at a glance.</h1>
            <p className="mt-3 app-muted">Monitor recent jobs, run a fast one-off scrape, and keep the freshest leads close by.</p>
          </div>
          <button type="button" onClick={() => setShowSheetsModal(true)} className="btn-secondary">
            <FileSpreadsheet className="h-4 w-4" />
            Google Sheets
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Leads" value={stats.totalLeads} icon={Layers3} tone="bg-[rgba(124,92,252,0.12)] text-[var(--accent)]" />
        <StatCard label="Scraped Today" value={stats.scrapedToday} icon={Compass} tone="bg-[rgba(52,211,153,0.12)] text-[var(--success)]" />
        <StatCard label="Google Maps Leads" value={stats.googleMapsLeads} icon={MapPinned} tone="bg-[rgba(91,127,255,0.12)] text-blue-300" />
        <StatCard label="Jobs Run" value={stats.jobsRun} icon={Workflow} tone="bg-[rgba(251,191,36,0.12)] text-[var(--warning)]" />
      </section>

      <section className="app-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="app-label">{initialUsage.planLabel} plan</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {initialUsage.isAdmin
              ? "Internal testing access"
              : `${initialUsage.used} of ${initialUsage.limit} leads used this month`}
          </p>
          {!initialUsage.isAdmin ? (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{initialUsage.remaining} leads remaining.</p>
          ) : null}
        </div>
        {!initialUsage.isAdmin ? (
          <a href={`mailto:${supportEmail}?subject=LeadHunter%20Plan%20Upgrade`} className="btn-secondary justify-center">
            Request plan upgrade
          </a>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <div className="app-card">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="app-section-title">Recent Jobs</h2>
                <p className="mt-1 app-muted">The last 10 queue runs across every source.</p>
              </div>
            </div>

            {jobs.length ? (
              <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--border)]">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[rgba(255,255,255,0.02)] text-xs uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Type</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Input Summary</th>
                        <th className="px-4 py-3 font-semibold">Leads Found</th>
                        <th className="px-4 py-3 font-semibold">Time Ago</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {jobs.slice(0, 10).map((job) => {
                        const clickable = job.status === "done";

                        return (
                          <tr
                            key={job.id}
                            className={`${clickable ? "cursor-pointer transition hover:bg-white/[0.03]" : ""}`}
                            onClick={() => {
                              if (clickable) {
                                router.push(`/leads?job_id=${encodeURIComponent(job.id)}`);
                              }
                            }}
                          >
                            <td className="px-4 py-4 text-[var(--text-primary)]">{job.source_type}</td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusTone(job.status)}`}>
                                {job.status}
                              </span>
                            </td>
                            <td className="max-w-xs truncate px-4 py-4 text-[var(--text-secondary)]">{job.input_summary ?? `${job.source_type} job`}</td>
                            <td className="px-4 py-4 text-[var(--text-secondary)]">{job.results_count}</td>
                            <td className="px-4 py-4 text-[var(--text-secondary)]">{formatRelative(job.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-5 py-12 text-center text-[var(--text-secondary)]">
                <Clock3 className="mb-3 h-8 w-8 text-[var(--text-muted)]" />
                No jobs yet. Head to Finder and run your first scrape.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="app-card">
            <h2 className="app-section-title">Quick Scrape</h2>
            <p className="mt-2 app-muted">Drop in a single company URL and save a fresh lead without leaving the dashboard.</p>

            <div className="mt-5 space-y-4">
              <input value={quickUrl} onChange={(event) => setQuickUrl(event.target.value)} placeholder="https://example.com" className="app-input w-full" />
              <button
                type="button"
                disabled={quickLoading || !quickUrl.trim()}
                onClick={() => void handleQuickScrape()}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {quickLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {quickLoading ? "Scraping..." : "Scrape"}
              </button>
            </div>

            {quickLead ? (
              <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--text-primary)]">{quickLead.company_name}</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{quickLead.email || quickLead.website || quickLead.location || "-"}</p>
                  </div>
                  <a
                    href={quickLead.website || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={`icon-button ${quickLead.website ? "" : "pointer-events-none opacity-40"}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          <div className="app-card">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="app-section-title">Recent Leads</h2>
                <p className="mt-1 app-muted">The latest five saved records.</p>
              </div>
              <Link href="/leads" className="text-sm font-medium text-[var(--accent)] transition hover:brightness-110">
                View all -&gt;
              </Link>
            </div>

            {leads.length ? (
              <div className="mt-5 space-y-3">
                {leads.map((lead) => (
                  <div key={lead.id ?? `${lead.company_name}-${lead.source_url}`} className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">{lead.company_name}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{lead.email ?? "-"}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${sourceBadgeClass(lead.source)}`}>
                        {sourceLabel(lead.source)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-5 py-12 text-center text-[var(--text-secondary)]">
                No leads yet. Your newest results will appear here.
              </div>
            )}
          </div>
        </div>
      </section>

      <GoogleSheetsModal open={showSheetsModal} onClose={() => setShowSheetsModal(false)} totalLeads={totalLeads} />
    </div>
  );
}
