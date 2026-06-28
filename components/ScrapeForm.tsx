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
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              ScrapeGraphAI powered
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Find structured leads from websites, directories, and local search.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Paste a URL or search query, choose a mode, and LeadHunter will extract business contact details and save them for export.
            </p>
          </div>
          <div className="hidden rounded-3xl border border-white/10 bg-slate-950/40 p-4 text-slate-300 lg:block">
            <Bot className="h-6 w-6 text-cyan-300" />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {(["website", "directory", "maps", "batch"] as Mode[]).map((item) => {
            const active = item === mode;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                className={[
                  "rounded-2xl px-4 py-2 text-sm font-medium transition",
                  active
                    ? "bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/20"
                    : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                {item}
              </button>
            );
          })}
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="scrape-input">
              {mode === "maps" ? "Search query" : mode === "batch" ? "URLs" : "Source URL"}
            </label>
            <textarea
              id="scrape-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              rows={mode === "batch" ? 7 : 4}
              className="w-full rounded-3xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10"
            />
          </div>

          {mode === "maps" ? (
            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="maps-location">
                  Location
                </label>
                <input
                  id="maps-location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="e.g. Karachi, Pakistan"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200" htmlFor="maps-count">
                  Results
                </label>
                <input
                  id="maps-count"
                  type="number"
                  min={1}
                  max={50}
                  value={numResults}
                  onChange={(event) => setNumResults(Number(event.target.value))}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 text-sm text-white outline-none transition focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10"
                />
              </div>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading || !value.trim() || (mode === "maps" && !location.trim())}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? "Scraping..." : "Run scrape"}
          </button>
        </form>
      </section>

      <aside className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-glow backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-white">Supported flows</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>Website: scrape a single company site.</p>
            <p>Directory: extract listings and contact details from a directory page.</p>
            <p>Maps: search a local business query and resolve lead candidates.</p>
            <p>Batch: process multiple URLs in one run.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-glow backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-white">Latest result</h2>
          <div className="mt-4 space-y-4 text-sm">
            {result?.error ? (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-rose-100">{result.error}</div>
            ) : null}

            {result?.message ? <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-slate-200">{result.message}</div> : null}

            {result?.job_id ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-slate-400">Queued job</p>
                <p className="mt-1 font-semibold text-white">{result.job_id}</p>
                <p className="mt-2 text-slate-300">
                  Status: <span className="font-medium text-white">{result.status ?? "queued"}</span>
                </p>
                <p className="mt-1 text-slate-300">URLs: {result.count ?? 0}</p>
              </div>
            ) : null}

            {result?.job ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-slate-400">Job</p>
                <p className="mt-1 font-semibold text-white">{result.job.id}</p>
                <p className="mt-2 text-slate-300">
                  Status: <span className="font-medium text-white">{result.job.status}</span>
                </p>
                <p className="mt-1 text-slate-300">Results: {result.job.results_count}</p>
              </div>
            ) : null}

            {directLead ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-slate-400">Lead</p>
                <p className="mt-1 font-semibold text-white">{directLead.company_name}</p>
                <p className="mt-2 text-slate-300">{directLead.website ?? directLead.source_url}</p>
              </div>
            ) : null}

            {result?.leads?.length ? (
              <div className="space-y-3">
                {result.leads.slice(0, 5).map((lead) => (
                  <div key={`${lead.company_name}-${lead.source_url}`} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="font-semibold text-white">{lead.company_name}</p>
                    <p className="mt-1 text-slate-400">{lead.email ?? lead.website ?? lead.source_url}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {!result ? <p className="text-slate-400">Run a scrape to see the newest job and lead preview here.</p> : null}
          </div>
        </section>
      </aside>
    </div>
  );
}
