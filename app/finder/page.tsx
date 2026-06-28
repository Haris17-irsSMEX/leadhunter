"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { Building2, Globe, Link2, Loader2, MapPin, Search, Upload } from "lucide-react";
import JobStatusCard from "@/components/JobStatusCard";
import { getLeadBadge } from "@/lib/leadScoring";
import type { Lead } from "@/lib/types";
import { useToast } from "@/lib/useToast";

type FinderTab = "website-batch" | "google-maps" | "directories";
type WebsiteMode = "single" | "bulk";

type BatchResult = {
  job_id: string;
  status: string;
  count: number;
  leads?: Lead[];
};

type MapsResult = {
  count: number;
  leads: Lead[];
};

type DirectoryResult = {
  count: number;
  leads: Lead[];
};

const directoryChips = [
  { label: "Product Hunt", value: "https://www.producthunt.com/" },
  { label: "Crunchbase", value: "https://www.crunchbase.com/" },
  { label: "AngelList", value: "https://wellfound.com/" },
  { label: "G2", value: "https://www.g2.com/" },
  { label: "Capterra", value: "https://www.capterra.com/" },
];

function resultBadge(lead: Lead) {
  const badge = getLeadBadge(lead);

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
      {badge.label} {badge.score}
    </span>
  );
}

function LeadDetail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="app-label text-xs">{label}</p>
      <p className="mt-1 break-words text-sm text-[var(--text-primary)]">{value && value.trim().length > 0 ? value : "—"}</p>
    </div>
  );
}

export default function FinderPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<FinderTab>("website-batch");
  const [websiteMode, setWebsiteMode] = useState<WebsiteMode>("single");
  const [singleUrl, setSingleUrl] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [singleLoading, setSingleLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [singleError, setSingleError] = useState("");
  const [batchError, setBatchError] = useState("");
  const [mapsError, setMapsError] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [singleLead, setSingleLead] = useState<Lead | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [mapsQuery, setMapsQuery] = useState("");
  const [mapsLocation, setMapsLocation] = useState("");
  const [mapsCount, setMapsCount] = useState(20);
  const [mapsResult, setMapsResult] = useState<MapsResult | null>(null);
  const [directoryUrl, setDirectoryUrl] = useState("");
  const [directoryResult, setDirectoryResult] = useState<DirectoryResult | null>(null);

  const bulkUrls = useMemo(() => {
    return bulkText
      .split(/\r?\n/)
      .flatMap((line) => line.split(","))
      .map((line) => line.trim())
      .filter((line) => /^https?:\/\//i.test(line));
  }, [bulkText]);

  function getApiErrorMessage(response: Response, fallback: string) {
    if (response.status === 429) {
      return "Too many requests — wait 60 seconds before trying again";
    }

    return fallback;
  }

  function toJobStatus(result: BatchResult, urlCount: number) {
    return {
      id: result.job_id,
      status: (result.status === "done" || result.status === "failed" || result.status === "processing" || result.status === "queued"
        ? result.status
        : "done") as "queued" | "processing" | "done" | "failed",
      source_type: `Batch scrape (${urlCount} URLs)`,
      results_count: result.count,
      created_at: new Date().toISOString(),
      completed_at: result.status === "done" ? new Date().toISOString() : undefined,
      leads: result.leads,
    };
  }

  async function handleSingleScrape() {
    setSingleLoading(true);
    setSingleError("");
    setSingleLead(null);

    try {
      const response = await fetch("/api/scrape/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: singleUrl.trim() }),
      });
      const data = (await response.json()) as Lead & { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data.error ?? "Unable to scrape website."));
      }

      setSingleLead(data);
      showToast("Lead scraped successfully.", "success");
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "Unable to scrape website.", "error");
      setSingleError(error instanceof Error ? error.message : "Unable to scrape website.");
    } finally {
      setSingleLoading(false);
    }
  }

  async function handleBatchScrape() {
    setBatchLoading(true);
    setBatchError("");
    setBatchResult(null);

    try {
      const response = await fetch("/api/scrape/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: bulkUrls }),
      });
      const data = (await response.json()) as BatchResult & { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data.error ?? "Unable to run batch scrape."));
      }

      setBatchResult(data);
      showToast(`Batch scrape complete. ${data.count} leads saved.`, "success");
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "Unable to run batch scrape.", "error");
      setBatchError(error instanceof Error ? error.message : "Unable to run batch scrape.");
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleMapsScrape() {
    setMapsLoading(true);
    setMapsError("");
    setMapsResult(null);

    try {
      const response = await fetch("/api/scrape/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: mapsQuery.trim(),
          location: mapsLocation.trim(),
          numResults: mapsCount,
        }),
      });
      const data = (await response.json()) as MapsResult & { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data.error ?? "Unable to search Google Maps."));
      }

      setMapsResult(data);
      showToast(`${data.count} Google Maps leads scraped.`, "success");
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "Unable to search Google Maps.", "error");
      setMapsError(error instanceof Error ? error.message : "Unable to search Google Maps.");
    } finally {
      setMapsLoading(false);
    }
  }

  async function handleDirectoryScrape() {
    setDirectoryLoading(true);
    setDirectoryError("");
    setDirectoryResult(null);

    try {
      const response = await fetch("/api/scrape/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: directoryUrl.trim() }),
      });
      const data = (await response.json()) as DirectoryResult & { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data.error ?? "Unable to scrape directory."));
      }

      setDirectoryResult(data);
      showToast(`${data.count} directory leads scraped.`, "success");
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "Unable to scrape directory.", "error");
      setDirectoryError(error instanceof Error ? error.message : "Unable to scrape directory.");
    } finally {
      setDirectoryLoading(false);
    }
  }

  async function handleCsvUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    const urls = text
      .split(/\r?\n/)
      .map((row) => row.split(",")[0]?.trim() ?? "")
      .filter((value) => /^https?:\/\//i.test(value));

    setBulkText(urls.join("\n"));
    event.target.value = "";
  }

  return (
    <div className="space-y-6 text-slate-100">
      <section className="app-card">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="app-label text-[var(--accent)]">Lead finder</p>
            <h1 className="app-page-title mt-3">Scrape leads from websites, Maps, and directories.</h1>
            <p className="mt-3 max-w-3xl app-muted">
              Run single-company lookups, queue large batches, or sweep a directory page. Every preview now includes AI lead scoring so you can triage results immediately.
            </p>
          </div>
        </div>
      </section>

      <section className="app-card">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "website-batch" as const, label: "Website / Batch", icon: Globe },
            { key: "google-maps" as const, label: "Google Maps", icon: MapPin },
            { key: "directories" as const, label: "Directories", icon: Building2 },
          ].map((tab) => {
            const Icon = tab.icon;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "inline-flex h-11 items-center gap-2 rounded-[10px] border px-4 text-sm font-medium transition",
                  activeTab === tab.key
                    ? "border-[var(--accent)] bg-[rgba(124,92,252,0.12)] text-[var(--accent)]"
                    : "border-white/[0.08] bg-transparent text-[var(--text-secondary)] hover:bg-white/[0.03] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "website-batch" ? (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="flex flex-wrap items-center gap-2">
              {(["single", "bulk"] as WebsiteMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setWebsiteMode(mode)}
                  className={[
                    "rounded-[10px] border px-4 py-2 text-sm font-medium transition",
                    websiteMode === mode
                      ? "border-[var(--accent)] bg-[rgba(124,92,252,0.12)] text-[var(--accent)]"
                      : "border-white/[0.08] bg-transparent text-[var(--text-secondary)] hover:bg-white/[0.03] hover:text-[var(--text-primary)]",
                  ].join(" ")}
                >
                  {mode === "single" ? "Single" : "Bulk"}
                </button>
              ))}
            </div>

            {websiteMode === "single" ? (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Company website URL</label>
                  <input
                    value={singleUrl}
                    onChange={(event) => setSingleUrl(event.target.value)}
                    placeholder="https://example.com"
                    className="app-input w-full"
                  />
                </div>
                <button
                  type="button"
                  disabled={singleLoading || !singleUrl.trim()}
                  onClick={handleSingleScrape}
                  className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {singleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Scrape Lead
                </button>
                {singleError ? <p className="text-sm text-rose-400">{singleError}</p> : null}

                {singleLead ? (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="app-label">Lead preview</p>
                        <h2 className="mt-2 app-section-title">{singleLead.company_name}</h2>
                      </div>
                      {resultBadge(singleLead)}
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <LeadDetail label="Company" value={singleLead.company_name} />
                      <LeadDetail label="Website" value={singleLead.website} />
                      <LeadDetail label="Founder" value={singleLead.founder_name} />
                      <LeadDetail label="Email" value={singleLead.email} />
                      <LeadDetail label="Industry" value={singleLead.industry} />
                      <LeadDetail label="Location" value={singleLead.location} />
                      <LeadDetail label="Pricing" value={singleLead.pricing_model} />
                      <LeadDetail label="Tech Stack" value={singleLead.tech_stack?.join(", ")} />
                    </div>

                    <Link href="/leads" className="mt-5 inline-flex text-sm font-medium text-[var(--accent)] transition hover:brightness-110">
                      {"View in My Leads ->"}
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">URLs</label>
                  <textarea
                    rows={5}
                    value={bulkText}
                    onChange={(event) => setBulkText(event.target.value)}
                    placeholder={"Paste URLs here, one per line\nhttps://company1.com\nhttps://company2.com"}
                    className="min-h-[140px] w-full rounded-[10px] border border-white/[0.08] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(124,92,252,0.3)]"
                  />
                </div>
                <label className="btn-secondary cursor-pointer">
                  <Upload className="h-4 w-4" />
                  Upload CSV
                  <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                </label>
                <p className="text-sm text-[var(--text-secondary)]">{bulkUrls.length} URLs ready</p>
                <button
                  type="button"
                  disabled={batchLoading || bulkUrls.length === 0}
                  onClick={handleBatchScrape}
                  className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {batchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Start Batch Scrape
                </button>
                {batchLoading ? (
                  <div className="rounded-[10px] border border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.12)] px-4 py-3 text-sm text-[var(--accent)]">
                    <div className="flex items-center gap-2 font-medium">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {`Scraping ${bulkUrls.length} URLs, this may take a minute...`}
                    </div>
                  </div>
                ) : null}
                {batchError ? <p className="text-sm text-rose-400">{batchError}</p> : null}
                {batchResult ? <JobStatusCard jobId={batchResult.job_id} initialJob={toJobStatus(batchResult, bulkUrls.length)} /> : null}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "google-maps" ? (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr_180px_auto] lg:items-end">
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">What type of business?</label>
                <input
                  value={mapsQuery}
                  onChange={(event) => setMapsQuery(event.target.value)}
                  placeholder="SaaS companies, dental clinics, law firms..."
                  className="app-input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Location</label>
                <input
                  value={mapsLocation}
                  onChange={(event) => setMapsLocation(event.target.value)}
                  placeholder="Austin Texas, London UK, Dubai UAE..."
                  className="app-input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">How many results</label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={mapsCount}
                  onChange={(event) => setMapsCount(Math.min(Math.max(Number(event.target.value) || 5, 5), 50))}
                  className="app-input w-full"
                />
              </div>
              <button
                type="button"
                disabled={mapsLoading || !mapsQuery.trim() || !mapsLocation.trim()}
                onClick={handleMapsScrape}
                className="btn-primary h-11 justify-center disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mapsLoading ? <MapPin className="h-4 w-4 animate-bounce" /> : <Search className="h-4 w-4" />}
                Search & Scrape
              </button>
            </div>

            {mapsError ? <p className="mt-4 text-sm text-rose-400">{mapsError}</p> : null}

            {mapsResult ? (
              <div className="mt-6 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="badge-hot">
                    {mapsResult.count} leads scraped
                  </span>
                  <Link href="/leads" className="text-sm font-medium text-[var(--accent)] transition hover:brightness-110">
                    {"View all in My Leads ->"}
                  </Link>
                </div>

                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)]">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-[rgba(255,255,255,0.02)] text-xs uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                        <tr>
                          <th className="px-4 py-3 font-medium">Name</th>
                          <th className="px-4 py-3 font-medium">Location</th>
                          <th className="px-4 py-3 font-medium">Phone</th>
                          <th className="px-4 py-3 font-medium">Industry</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {mapsResult.leads.map((lead, index) => (
                          <tr key={`${lead.company_name}-${lead.source_url}-${index}`}>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="font-medium text-[var(--text-primary)]">{lead.company_name}</span>
                                {resultBadge(lead)}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-[var(--text-secondary)]">{lead.location ?? "—"}</td>
                            <td className="px-4 py-4 text-[var(--text-secondary)]">{lead.phone ?? "—"}</td>
                            <td className="px-4 py-4 text-[var(--text-secondary)]">{lead.industry ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "directories" ? (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Directory page URL</label>
              <input
                value={directoryUrl}
                onChange={(event) => setDirectoryUrl(event.target.value)}
                placeholder="https://example.com/directory"
                className="app-input w-full"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {directoryChips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => setDirectoryUrl(chip.value)}
                  className="rounded-lg border border-white/[0.08] bg-transparent px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <button
                type="button"
                disabled={directoryLoading || !directoryUrl.trim()}
                onClick={handleDirectoryScrape}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {directoryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                Scrape Directory
              </button>
            </div>

            {directoryError ? <p className="mt-4 text-sm text-rose-400">{directoryError}</p> : null}

            {directoryResult ? (
              <div className="mt-6 space-y-4">
                <span className="badge-hot">
                  {directoryResult.count} leads found
                </span>
                <div className="grid gap-3">
                  {directoryResult.leads.slice(0, 3).map((lead, index) => (
                    <div key={`${lead.company_name}-${lead.source_url}-${index}`} className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">{lead.company_name}</p>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">{lead.description ?? lead.website ?? lead.source_url}</p>
                        </div>
                        {resultBadge(lead)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
