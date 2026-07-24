"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Bot, Loader2, Search, Sparkles } from "lucide-react";
import type { Lead, ScrapeJob } from "@/lib/types";

type Mode = "website" | "directory" | "maps" | "batch";

type ApiResult = Partial<Lead> & {
  job?: ScrapeJob;
  job_id?: string;
  jobs?: ScrapeJob[];
  lead?: Lead;
  leads?: Lead[];
  count?: number;
  message?: string;
  error?: string;
  status?: string;
};

function routeForMode(mode: Mode) {
  switch (mode) {
    case "directory":
      return "/api/scrape/directory";
    case "maps":
      return "/api/scrape/maps";
    case "batch":
      return "/api/scrape/batch";
    default:
      return "/api/scrape/website";
  }
}

export default function ScrapeForm() {
  const [mode, setMode] = useState<Mode>("website");
  const [value, setValue] = useState("");
  const [location, setLocation] = useState("");
  const [numResults, setNumResults] = useState(20);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  const placeholder = useMemo(() => {
    switch (mode) {
      case "maps":
        return "e.g. boutique marketing agencies in Karachi";
      case "directory":
        return "https://example.com/directory";
      case "batch":
        return "https://example.com\nhttps://another-site.com";
      default:
        return "https://example.com";
    }
  }, [mode]);

  const directLead = result?.lead ?? (result?.company_name ? (result as Lead) : undefined);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const payload =
        mode === "batch"
          ? {
              urls: value
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean),
            }
          : mode === "maps"
            ? { query: value.trim(), location: location.trim(), numResults }
            : { url: value.trim() };

      const response = await fetch(routeForMode(mode), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as ApiResult;
      if (!response.ok) {
        throw new Error(data.error ?? "Something went wrong while scraping.");
      }

      setResult(data);
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : "Unexpected request failure.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
      <section className="app-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="status-badge status-badge-info">
              <Sparkles className="h-3.5 w-3.5" />
              Lead research
            </p>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              Find structured leads from websites, directories, and local search.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Paste a URL or search query, choose a mode, and LeadHunter will extract business contact details and save them for export.
            </p>
          </div>
          <div className="hidden rounded-2xl border border-[var(--border-default)] bg-[var(--primary-soft)] p-4 text-[var(--primary)] lg:block">
            <Bot className="h-6 w-6" />
          </div>
        </div>

        <div className="app-tabs mt-6 flex flex-wrap gap-1">
          {(["website", "directory", "maps", "batch"] as Mode[]).map((item) => {
            const active = item === mode;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={`app-tab capitalize ${active ? "app-tab-active" : ""}`}
                aria-pressed={active}
              >
                {item}
              </button>
            );
          })}
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="app-label mb-2 block" htmlFor="scrape-input">
              {mode === "maps" ? "Search query" : mode === "batch" ? "URLs" : "Source URL"}
            </label>
            <textarea
              id="scrape-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              rows={mode === "batch" ? 7 : 4}
              className="app-input min-h-32 w-full py-3"
            />
          </div>

          {mode === "maps" ? (
            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <div>
                <label className="app-label mb-2 block" htmlFor="maps-location">
                  Location
                </label>
                <input
                  id="maps-location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="e.g. Karachi, Pakistan"
                  className="app-input h-12 w-full"
                />
              </div>
              <div>
                <label className="app-label mb-2 block" htmlFor="maps-count">
                  Results
                </label>
                <input
                  id="maps-count"
                  type="number"
                  min={1}
                  max={50}
                  value={numResults}
                  onChange={(event) => setNumResults(Number(event.target.value))}
                  className="app-input h-12 w-full"
                />
              </div>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading || !value.trim() || (mode === "maps" && !location.trim())}
            className="btn-primary"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? "Scraping..." : "Run scrape"}
          </button>
        </form>
      </section>

      <aside className="space-y-6">
        <section className="app-card">
          <h2 className="app-section-title">Supported flows</h2>
          <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
            <p>Website: scrape a single company site.</p>
            <p>Directory: extract listings and contact details from a directory page.</p>
            <p>Maps: search a local business query and resolve lead candidates.</p>
            <p>Batch: process multiple URLs in one run.</p>
          </div>
        </section>

        <section className="app-card">
          <h2 className="app-section-title">Latest result</h2>
          <div className="mt-4 space-y-4 text-sm">
            {result?.error ? (
              <div className="app-alert app-alert-error">{result.error}</div>
            ) : null}

            {result?.message ? <div className="app-subtle-panel text-[var(--text-secondary)]">{result.message}</div> : null}

            {result?.job_id ? (
              <div className="app-subtle-panel">
                <p className="font-semibold text-[var(--text-primary)]">Batch request queued</p>
                <p className="mt-2 text-[var(--text-secondary)]">
                  Status: <span className="font-medium text-[var(--text-primary)]">{result.status ?? "queued"}</span>
                </p>
                <p className="mt-1 text-[var(--text-secondary)]">URLs: {result.count ?? 0}</p>
              </div>
            ) : null}

            {result?.job ? (
              <div className="app-subtle-panel">
                <p className="font-semibold text-[var(--text-primary)]">Scrape status</p>
                <p className="mt-2 text-[var(--text-secondary)]">
                  Status: <span className="font-medium text-[var(--text-primary)]">{result.job.status}</span>
                </p>
                <p className="mt-1 text-[var(--text-secondary)]">Results: {result.job.results_count}</p>
              </div>
            ) : null}

            {directLead ? (
              <div className="app-subtle-panel">
                <p className="app-label">Lead</p>
                <p className="mt-1 font-semibold text-[var(--text-primary)]">{directLead.company_name}</p>
                <p className="mt-2 break-words text-[var(--text-secondary)]">{directLead.website ?? directLead.source_url}</p>
              </div>
            ) : null}

            {result?.leads?.length ? (
              <div className="space-y-3">
                {result.leads.slice(0, 5).map((lead) => (
                  <div key={`${lead.company_name}-${lead.source_url}`} className="app-subtle-panel">
                    <p className="font-semibold text-[var(--text-primary)]">{lead.company_name}</p>
                    <p className="mt-1 break-words text-[var(--text-secondary)]">{lead.email ?? lead.website ?? lead.source_url}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {!result ? <p className="text-[var(--text-secondary)]">Run a scrape to see the newest job and lead preview here.</p> : null}
          </div>
        </section>
      </aside>
    </div>
  );
}
