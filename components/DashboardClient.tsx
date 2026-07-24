"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ExternalLink,
  FileSpreadsheet,
  Layers3,
  Loader2,
  MapPinned,
  MessageCircle,
  Search,
  Workflow,
  Clock3,
} from "lucide-react";
import GoogleSheetsModal from "@/components/GoogleSheetsModal";
import MonthlyLimitNotice from "@/components/MonthlyLimitNotice";
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
    return "status-badge-success";
  }

  if (source === "directory") {
    return "status-badge-info";
  }

  if (source === "hackernews") {
    return "status-badge-warning";
  }

  if (source === "reddit") {
    return "status-badge-warning";
  }

  if (source === "indiehackers") {
    return "status-badge-info";
  }

  if (source === "producthunt") {
    return "status-badge-warning";
  }

  return "status-badge-info";
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
    return "status-badge-success";
  }

  if (status === "failed") {
    return "status-badge-danger";
  }

  if (status === "processing") {
    return "status-badge-info animate-pulse";
  }

  return "status-badge-muted";
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
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: typeof Layers3;
  tone: string;
}) {
  return (
    <article className="app-card min-h-[142px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="app-label">{label}</p>
          <p className="mt-3 text-[32px] font-bold leading-none text-[var(--text-primary)]">{value}</p>
          <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">{detail}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
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
  const [monthlyLimitUsage, setMonthlyLimitUsage] = useState<UsageSummary | null>(
    !initialUsage.isAdmin && initialUsage.remaining === 0 ? initialUsage : null,
  );
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "irssmex@gmail.com";

  const stats = useMemo(() => {
    return {
      totalLeads,
      recentLeads: leads.length,
      recentJobs: jobs.length,
    };
  }, [jobs.length, leads, totalLeads]);
  const usagePercent = initialUsage.isAdmin
    ? 0
    : Math.min(100, Math.round((initialUsage.used / Math.max(initialUsage.limit, 1)) * 100));
  const usageTone = usagePercent >= 80 ? "bg-[var(--warning)]" : "bg-[var(--primary)]";

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
      const payload = (await response.json()) as Lead & {
        code?: string;
        error?: string;
        usage?: UsageSummary;
      };

      if (!response.ok) {
        if (payload.code === "MONTHLY_LIMIT_REACHED") {
          setMonthlyLimitUsage(payload.usage ?? initialUsage);
          showToast("Monthly lead limit reached. No additional leads were added.", "warning");
          return;
        }

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
      <header className="app-page-header">
        <div className="app-page-header-copy">
          <p className="app-label text-[var(--accent)]">Workspace overview</p>
          <h1 className="app-page-title mt-2">Dashboard</h1>
          <p className="mt-2 app-muted">Track your usage, recent lead activity, and quick actions.</p>
        </div>
        <div className="app-page-actions">
          <Link href="/finder" className="btn-primary">
            Find leads
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link href="/leads" className="btn-secondary">
            View saved leads
          </Link>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Saved leads"
          value={stats.totalLeads.toLocaleString()}
          detail="All records in your workspace"
          icon={Layers3}
          tone="bg-[var(--primary-soft)] text-[var(--accent)]"
        />
        <StatCard
          label="Used this month"
          value={initialUsage.used.toLocaleString()}
          detail={initialUsage.isAdmin ? "Internal access is not capped" : `${initialUsage.planLabel} monthly usage`}
          icon={Workflow}
          tone="bg-blue-50 text-blue-700"
        />
        <StatCard
          label="Leads remaining"
          value={initialUsage.isAdmin ? "Unlimited" : initialUsage.remaining.toLocaleString()}
          detail={initialUsage.isAdmin ? "Internal testing access" : `${initialUsage.limit.toLocaleString()} lead allowance`}
          icon={MapPinned}
          tone={
            !initialUsage.isAdmin && initialUsage.remaining === 0
              ? "bg-amber-50 text-amber-700"
              : !initialUsage.isAdmin && usagePercent >= 80
                ? "bg-amber-50 text-amber-700"
                : "bg-green-50 text-green-700"
          }
        />
        <StatCard
          label="Recent searches"
          value={stats.recentJobs}
          detail="Latest activity loaded below"
          icon={Clock3}
          tone="bg-amber-50 text-amber-700"
        />
      </section>

      {monthlyLimitUsage ? (
        <MonthlyLimitNotice usage={monthlyLimitUsage} supportEmail={supportEmail} />
      ) : (
        <section className={`app-card ${!initialUsage.isAdmin && usagePercent >= 80 ? "border-[var(--warning-border)]" : ""}`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="app-section-title">Monthly usage</h2>
                <span className="status-badge status-badge-info">{initialUsage.planLabel} plan</span>
              </div>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {initialUsage.isAdmin
                  ? "Internal testing access is active."
                  : `${initialUsage.used.toLocaleString()} of ${initialUsage.limit.toLocaleString()} leads used. ${initialUsage.remaining.toLocaleString()} remaining.`}
              </p>
              {!initialUsage.isAdmin ? (
                <div className="mt-4">
                  <div
                    className="app-progress"
                    role="progressbar"
                    aria-label="Monthly lead usage"
                    aria-valuemin={0}
                    aria-valuemax={initialUsage.limit}
                    aria-valuenow={initialUsage.used}
                  >
                    <span className={usageTone} style={{ width: `${usagePercent}%` }} />
                  </div>
                  {usagePercent >= 80 ? (
                    <p className="mt-3 text-sm font-semibold text-[var(--warning)]">You are approaching your monthly allowance.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
            {!initialUsage.isAdmin ? (
              <a href={`mailto:${supportEmail}?subject=LeadHunter%20Plan%20Upgrade`} className="btn-secondary shrink-0">
                Request plan upgrade
              </a>
            ) : null}
          </div>
        </section>
      )}

      {!totalLeads && !jobs.length ? (
        <section className="app-empty-state">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--accent)]">
            <Search className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-5 app-section-title">Build your first lead list</h2>
          <p className="mt-2 max-w-md app-muted">Choose a niche and city to start collecting public business information.</p>
          <Link href="/finder" className="btn-primary mt-6">
            Find leads
          </Link>
          <p className="mt-3 text-xs text-[var(--text-muted)]">Your saved leads and activity will appear here.</p>
        </section>
      ) : null}

      <section aria-label="Quick actions" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: "Search Google Maps",
            copy: "Find local businesses by niche and city.",
            href: "/finder",
            icon: MapPinned,
          },
          {
            title: "Explore communities",
            copy: "Review supported public community sources.",
            href: "/finder",
            icon: MessageCircle,
          },
          {
            title: "View saved leads",
            copy: "Filter, enrich, and export your workspace.",
            href: "/leads",
            icon: Layers3,
          },
        ].map(({ title, copy, href, icon: Icon }) => (
          <Link key={title} href={href} className="app-card group min-h-[150px] transition hover:-translate-y-0.5 hover:border-blue-200">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--accent)]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-sm font-bold text-[var(--text-primary)]">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{copy}</p>
          </Link>
        ))}
        <button type="button" onClick={() => setShowSheetsModal(true)} className="app-card group min-h-[150px] text-left transition hover:-translate-y-0.5 hover:border-blue-200">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-700">
            <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-sm font-bold text-[var(--text-primary)]">Sync to Google Sheets</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Send filtered records to a sheet you control.</p>
        </button>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <div className="app-card overflow-hidden p-0">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--border-default)] px-5 py-5 sm:px-6">
            <div>
              <h2 className="app-section-title">Recent activity</h2>
              <p className="mt-1 app-muted">Your latest searches across available sources.</p>
            </div>
            <Link href="/finder" className="text-sm font-semibold text-[var(--accent)]">
              Find leads
            </Link>
          </div>

          {jobs.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[var(--surface-secondary)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="px-5 py-3 font-semibold sm:px-6">Search</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Saved</th>
                    <th className="px-5 py-3 font-semibold sm:px-6">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {jobs.slice(0, 10).map((job) => {
                    const clickable = job.status === "done";
                    return (
                      <tr
                        key={job.id}
                        className={clickable ? "cursor-pointer transition hover:bg-[var(--surface-secondary)]" : ""}
                        onClick={() => {
                          if (clickable) router.push(`/leads?job_id=${encodeURIComponent(job.id)}`);
                        }}
                      >
                        <td className="px-5 py-4 sm:px-6">
                          <p className="font-semibold capitalize text-[var(--text-primary)]">{job.source_type.replaceAll("_", " ")}</p>
                          <p className="mt-1 max-w-sm truncate text-xs text-[var(--text-secondary)]">
                            {job.input_summary ?? `${job.source_type} search`}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`status-badge capitalize ${statusTone(job.status)}`}>{job.status}</span>
                        </td>
                        <td className="px-4 py-4 font-semibold text-[var(--text-primary)]">{job.results_count}</td>
                        <td className="px-5 py-4 text-[var(--text-secondary)] sm:px-6">{formatRelative(job.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="app-empty-state m-5 shadow-none sm:m-6">
              <Clock3 className="h-7 w-7 text-[var(--text-muted)]" aria-hidden="true" />
              <h3 className="mt-4 font-bold text-[var(--text-primary)]">No searches yet</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Run your first search from Finder to see activity here.</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="app-card">
            <h2 className="app-section-title">Quick website lookup</h2>
            <p className="mt-2 app-muted">Save one public company website without leaving the dashboard.</p>
            <div className="mt-5 space-y-4">
              <label className="app-filter-field">
                <span className="app-label">Company website</span>
                <input
                  value={quickUrl}
                  onChange={(event) => setQuickUrl(event.target.value)}
                  placeholder="https://example.com"
                  className="app-input w-full"
                />
              </label>
              <button
                type="button"
                disabled={quickLoading || !quickUrl.trim()}
                onClick={() => void handleQuickScrape()}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {quickLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {quickLoading ? "Checking website..." : "Save website lead"}
              </button>
            </div>

            {quickLead ? (
              <div className="mt-5 rounded-2xl border border-[var(--success-border)] bg-[var(--success-soft)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text-primary)]">{quickLead.company_name}</p>
                    <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">
                      {quickLead.email || quickLead.website || quickLead.location || "Lead saved"}
                    </p>
                  </div>
                  <a
                    href={quickLead.website || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`icon-button ${quickLead.website ? "" : "pointer-events-none opacity-40"}`}
                    aria-label={`Open ${quickLead.company_name} website`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          <div className="app-card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="app-section-title">Recent leads</h2>
                <p className="mt-1 app-muted">The latest five saved records.</p>
              </div>
              <Link href="/leads" className="text-sm font-semibold text-[var(--accent)]">
                View all
              </Link>
            </div>

            {leads.length ? (
              <div className="mt-5 divide-y divide-[var(--border-default)] overflow-hidden rounded-2xl border border-[var(--border-default)]">
                {leads.map((lead) => (
                  <div key={lead.id ?? `${lead.company_name}-${lead.source_url}`} className="bg-white px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--text-primary)]">{lead.company_name}</p>
                        <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                          {lead.email || lead.website || lead.phone || "No contact information yet"}
                        </p>
                      </div>
                      <span className={`status-badge shrink-0 ${sourceBadgeClass(lead.source)}`}>
                        {sourceLabel(lead.source)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--surface-secondary)] px-5 py-10 text-center">
                <p className="font-semibold text-[var(--text-primary)]">No leads yet</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Your newest saved records will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <GoogleSheetsModal open={showSheetsModal} onClose={() => setShowSheetsModal(false)} totalLeads={totalLeads} />
    </div>
  );
}
