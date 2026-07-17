"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Copy, Download, ExternalLink, FileSpreadsheet, Loader2, Mail, Search, Sparkles, Trash2, Users } from "lucide-react";
import GoogleSheetsModal from "@/components/GoogleSheetsModal";
import type { Lead } from "@/lib/types";
import { useToast } from "@/lib/useToast";

const PAGE_SIZE = 50;

type LeadsResponse = {
  leads: Lead[];
  total: number;
};

type SourceFilter = "all" | Lead["source"];
type SortOption = "newest" | "oldest" | "company";

function toSourceFilter(value: string | null): SourceFilter {
  if (
    value === "website" ||
    value === "google_maps" ||
    value === "directory" ||
    value === "hackernews" ||
    value === "reddit" ||
    value === "indiehackers" ||
    value === "producthunt"
  ) {
    return value;
  }

  return "all";
}

async function parseResponseSafely(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as Record<string, unknown>;
  }

  const text = await response.text();
  return { error: text.slice(0, 200) };
}

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

function sourceBadgeClass(source: Lead["source"]) {
  if (source === "google_maps") {
    return "border-[rgba(52,211,153,0.28)] bg-[rgba(52,211,153,0.15)] text-[var(--success)]";
  }
  if (source === "directory") {
    return "border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.15)] text-[var(--accent)]";
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
  return "border-[rgba(91,127,255,0.28)] bg-[rgba(91,127,255,0.15)] text-blue-300";
}

function normalizeText(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function emptyText(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "";
  }

  return value?.trim() ?? "";
}

function industryPreview(industry?: string) {
  const tags = (industry ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!tags.length) {
    return { visible: "", more: 0 };
  }

  return {
    visible: tags.slice(0, 2).join(", "),
    more: Math.max(0, tags.length - 2),
  };
}

function buildExportUrl(ids: string[], format: "csv" | "xlsx") {
  const base = format === "xlsx" ? "/api/leads/export/xlsx" : "/api/leads/export";

  if (!ids.length) {
    return base;
  }

  return `${base}?ids=${encodeURIComponent(ids.join(","))}`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function DetailField({ label, value }: { label: string; value?: string | string[] }) {
  const display = emptyText(value);

  return (
    <div>
      <p className="app-label text-xs">{label}</p>
      <p className={display ? "mt-1 break-words text-sm text-[var(--text-primary)]" : "mt-1 text-sm text-[var(--text-muted)]"}>
        {display || "—"}
      </p>
    </div>
  );
}

function needsEmailEnrichment(lead: Lead) {
  return Boolean(lead.id && lead.website?.trim() && !lead.email?.trim());
}

function LeadRow({
  lead,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onCopyEmail,
  onDelete,
  onEnrichEmail,
  isEnriching,
}: {
  lead: Lead;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: (checked: boolean) => void;
  onCopyEmail: () => void;
  onDelete: () => void;
  onEnrichEmail: () => void;
  isEnriching: boolean;
}) {
  const rowId = lead.id ?? `${lead.company_name}-${lead.source_url}`;
  const industry = industryPreview(lead.industry);
  const canFindEmail = needsEmailEnrichment(lead);
  const emailButtonLabel = "Find email";

  return (
    <>
      <tr className="cursor-pointer border-b border-[var(--border)] text-[var(--text-primary)] transition hover:bg-white/[0.03]" onClick={onToggleExpand}>
        <td className="w-[40px] px-3 py-4" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(event) => onToggleSelect(event.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-transparent text-[var(--accent)] focus:ring-[var(--accent)]"
          />
        </td>
        <td className="px-3 py-4">
          <div className="truncate text-sm font-medium">{lead.company_name}</div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span className="truncate text-xs text-[var(--text-secondary)]">{lead.website ?? "No website"}</span>
            {canFindEmail ? (
              <button
                type="button"
                disabled={isEnriching}
                onClick={(event) => {
                  event.stopPropagation();
                  onEnrichEmail();
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.12)] px-2 py-1 text-[11px] font-medium text-[var(--accent)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`${emailButtonLabel} for ${lead.company_name}`}
                title="Search public contact and about pages when available."
              >
                {isEnriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                <Sparkles className="h-3 w-3" />
                {emailButtonLabel}
              </button>
            ) : null}
          </div>
        </td>
        <td className="px-3 py-4">
          <div className="truncate text-sm text-[var(--text-secondary)]">{lead.location ?? "—"}</div>
        </td>
        <td className="px-3 py-4">
          <div className="truncate text-sm text-[var(--text-secondary)]">
            {industry.visible || "—"}
            {industry.more ? <span className="ml-1 text-[var(--text-muted)]">+{industry.more} more</span> : null}
          </div>
        </td>
        <td className="px-3 py-4">
          <span className={`inline-flex max-w-full rounded-lg border px-2.5 py-1 text-xs font-medium ${sourceBadgeClass(lead.source)}`}>
            <span className="truncate">{sourceLabel(lead.source)}</span>
          </span>
        </td>
        <td className="px-3 py-4 text-sm text-[var(--text-secondary)]">{formatRelative(lead.scraped_at)}</td>
        <td className="px-3 py-4" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center gap-1">
            <a
              href={lead.website || "#"}
              target="_blank"
              rel="noreferrer"
              className={`icon-button h-7 w-7 ${lead.website ? "" : "pointer-events-none opacity-40"}`}
              aria-label={`Open ${lead.company_name} website`}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <button type="button" onClick={onCopyEmail} className="icon-button h-7 w-7" aria-label={`Copy ${lead.company_name} email`}>
              <Copy className="h-4 w-4" />
            </button>
            {canFindEmail ? (
              <button
                type="button"
                disabled={isEnriching}
                onClick={onEnrichEmail}
                className="icon-button h-7 w-7 text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`${emailButtonLabel} for ${lead.company_name}`}
                title="Search public contact and about pages when available."
              >
                {isEnriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              </button>
            ) : null}
            <button type="button" onClick={onDelete} className="icon-button h-7 w-7 text-red-400 hover:text-red-400" aria-label={`Delete ${lead.company_name}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
      {isExpanded ? (
        <tr className="border-b border-[var(--border)] bg-[rgba(255,255,255,0.02)]">
          <td colSpan={7} className="px-4 py-5">
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <DetailField label="Company" value={lead.company_name} />
              <DetailField label="Website" value={lead.website} />
              <DetailField label="Description" value={lead.description} />
              <DetailField label="Founder" value={lead.founder_name} />
              <DetailField label="Email" value={lead.email} />
              <DetailField label="Phone" value={lead.phone} />
              <DetailField label="LinkedIn" value={lead.linkedin_url} />
              <DetailField label="Twitter" value={lead.twitter_handle} />
              <DetailField label="Location" value={lead.location} />
              <DetailField label="Country" value={lead.country} />
              <DetailField label="Industry" value={lead.industry} />
              <DetailField label="Employees" value={lead.employee_count} />
              <DetailField label="Pricing" value={lead.pricing_model} />
              <DetailField label="Tech Stack" value={lead.tech_stack} />
              <DetailField label="Source URL" value={lead.source_url} />
              <DetailField label="Lead ID" value={rowId} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function LeadsTable() {
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const sourceParamFilter = toSourceFilter(searchParams.get("source"));
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(sourceParamFilter);
  const [sort, setSort] = useState<SortOption>("newest");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [enrichingIds, setEnrichingIds] = useState<string[]>([]);
  const [bulkEnrichProgress, setBulkEnrichProgress] = useState<{ current: number; total: number } | null>(null);
  const jobIdFilter = searchParams.get("job_id")?.trim() ?? "";

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function getApiErrorMessage(response: Response, fallback: string) {
    if (response.status === 429) {
      if (fallback.toLowerCase().includes("monthly") || fallback.toLowerCase().includes("lead limit")) {
        return fallback;
      }

      return "Too many requests - wait 60 seconds before trying again";
    }

    return fallback;
  }

  async function fetchLeads(targetPage: number) {
    setLoading(true);
    setError("");

    try {
      const offset = (targetPage - 1) * PAGE_SIZE;
      const query = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });

      if (jobIdFilter) {
        query.set("job_id", jobIdFilter);
      }

      if (sourceFilter !== "all") {
        query.set("source", sourceFilter);
      }

      const response = await fetch(`/api/leads?${query.toString()}`, { cache: "no-store" });
      const payload = (await parseResponseSafely(response)) as LeadsResponse & { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload.error ?? "Unable to load leads."));
      }

      setLeads(payload.leads);
      setTotal(payload.total);
      setPage(targetPage);
      setSelectedIds([]);
      setExpandedLeadId(null);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Unable to load leads.";
      console.error(fetchError);
      showToast(message, "error");
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchLeads(1);
  }, [jobIdFilter, sourceFilter]);

  useEffect(() => {
    setSourceFilter(sourceParamFilter);
  }, [sourceParamFilter]);

  useEffect(() => {
    if (!copyMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopyMessage(""), 2000);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  const filteredLeads = useMemo(() => {
    const query = normalizeText(search);
    const matchingLeads = leads.filter((lead) => {
      const searchMatch =
        !query ||
        normalizeText(lead.company_name).includes(query) ||
        normalizeText(lead.email).includes(query) ||
        normalizeText(lead.location).includes(query);
      const sourceMatch = sourceFilter === "all" || lead.source === sourceFilter;

      return searchMatch && sourceMatch;
    });

    return [...matchingLeads].sort((left, right) => {
      if (sort === "company") {
        return left.company_name.localeCompare(right.company_name);
      }

      const leftTime = new Date(left.scraped_at ?? 0).getTime();
      const rightTime = new Date(right.scraped_at ?? 0).getTime();
      return sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
    });
  }, [leads, search, sourceFilter, sort]);

  const selectableVisibleIds = useMemo(
    () => filteredLeads.map((lead) => lead.id).filter((id): id is string => Boolean(id)),
    [filteredLeads],
  );
  const selectedVisibleIds = selectableVisibleIds.filter((id) => selectedIds.includes(id));
  const allVisibleSelected = selectableVisibleIds.length > 0 && selectedVisibleIds.length === selectableVisibleIds.length;
  const exportTargetIds = selectedIds.length ? selectedIds : selectableVisibleIds;
  const selectedEnrichableLeads = leads.filter((lead) => lead.id && selectedIds.includes(lead.id) && needsEmailEnrichment(lead));

  function removeDeleted(ids: string[]) {
    const remaining = leads.filter((lead) => !ids.includes(lead.id ?? ""));
    setLeads(remaining);
    setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    setTotal((current) => Math.max(0, current - ids.length));

    if (expandedLeadId && ids.includes(expandedLeadId)) {
      setExpandedLeadId(null);
    }

    if (!remaining.length && page > 1) {
      void fetchLeads(page - 1);
    }
  }

  function updateLead(updatedLead: Lead) {
    if (!updatedLead.id) {
      return;
    }

    setLeads((current) => current.map((lead) => (lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead)));
  }

  async function deleteOne(id: string) {
    if (!window.confirm("Delete this lead?")) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = (await parseResponseSafely(response)) as { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload.error ?? "Unable to delete lead."));
      }

      removeDeleted([id]);
      showToast("Lead deleted.", "success");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete lead.";
      console.error(deleteError);
      setError(message);
      showToast(message, "error");
    } finally {
      setDeleting(false);
    }
  }

  async function deleteSelected() {
    if (!selectedIds.length || !window.confirm(`Delete ${selectedIds.length} leads? This cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/leads?ids=${encodeURIComponent(selectedIds.join(","))}`, { method: "DELETE" });
      const payload = (await parseResponseSafely(response)) as { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload.error ?? "Unable to delete selected leads."));
      }

      const count = selectedIds.length;
      removeDeleted(selectedIds);
      setSelectedIds([]);
      showToast(`Deleted ${count} selected leads.`, "success");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete selected leads.";
      console.error(deleteError);
      setError(message);
      showToast(message, "error");
    } finally {
      setDeleting(false);
    }
  }

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds((current) => Array.from(new Set([...current, ...selectableVisibleIds])));
      return;
    }

    setSelectedIds((current) => current.filter((id) => !selectableVisibleIds.includes(id)));
  }

  function handleSelectOne(id: string, checked: boolean) {
    if (checked) {
      setSelectedIds((current) => Array.from(new Set([...current, id])));
      return;
    }

    setSelectedIds((current) => current.filter((item) => item !== id));
  }

  async function handleCopyEmail(email?: string) {
    if (!email) {
      setCopyMessage("This lead does not have an email.");
      return;
    }

    try {
      await navigator.clipboard.writeText(email);
      setCopyMessage(`Copied ${email}`);
      showToast("Email copied to clipboard.", "success");
    } catch {
      setCopyMessage("Unable to copy email.");
      showToast("Unable to copy email.", "error");
    }
  }

  async function enrichLead(id: string, options: { quiet?: boolean } = {}) {
    setEnrichingIds((current) => Array.from(new Set([...current, id])));
    setError("");

    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(id)}/enrich`, { method: "POST" });
      const payload = (await parseResponseSafely(response)) as unknown as Lead & {
        error?: string;
        message?: string;
        success?: boolean;
      };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload.error ?? "Unable to enrich lead."));
      }

      if (payload.id) {
        updateLead(payload);
      }

      if (!options.quiet) {
        showToast(
          payload.email ? "Email found and saved." : payload.message ?? "No public email was found on this website.",
          payload.email ? "success" : "error",
        );
      }

      return payload;
    } finally {
      setEnrichingIds((current) => current.filter((item) => item !== id));
    }
  }

  async function enrichSelected() {
    const targets = selectedEnrichableLeads.map((lead) => lead.id).filter((id): id is string => Boolean(id));

    if (!targets.length) {
      showToast("Selected leads already have emails or no website to search.", "error");
      setSelectedIds([]);
      return;
    }

    setBulkEnrichProgress({ current: 0, total: targets.length });

    try {
      let foundCount = 0;

      for (const [index, id] of targets.entries()) {
        setBulkEnrichProgress({ current: index + 1, total: targets.length });
        const enriched = await enrichLead(id, { quiet: true });
        if (enriched?.email) {
          foundCount += 1;
        }
      }

      showToast(`Email enrichment complete. ${foundCount} updated.`, "success");
      setSelectedIds([]);
    } catch (enrichError) {
      const message = enrichError instanceof Error ? enrichError.message : "Unable to enrich selected leads.";
      console.error(enrichError);
      setError(message);
      showToast(message, "error");
    } finally {
      setBulkEnrichProgress(null);
    }
  }

  async function handleEnrichLead(id: string) {
    try {
      await enrichLead(id);
    } catch (enrichError) {
      const message = enrichError instanceof Error ? enrichError.message : "Unable to enrich lead.";
      console.error(enrichError);
      setError(message);
      showToast(message, "error");
    }
  }

  async function handleExport(ids: string[], format: "csv" | "xlsx") {
    setExporting(true);

    try {
      const response = await fetch(buildExportUrl(ids, format), { cache: "no-store" });

      if (!response.ok) {
        const payload = await parseResponseSafely(response);
        throw new Error(getApiErrorMessage(response, String(payload.error ?? `Lead ${format.toUpperCase()} export failed.`)));
      }

      const blob = await response.blob();
      triggerBlobDownload(blob, format === "xlsx" ? "leads.xlsx" : "leads.csv");
      showToast(`${format.toUpperCase()} export complete.`, "success");
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : `Lead ${format.toUpperCase()} export failed.`;
      console.error(exportError);
      showToast(message, "error");
      setError(message);
    } finally {
      setExporting(false);
    }
  }

  const sourcePillRows: Array<Array<{ label: string; value: SourceFilter }>> = [
    [
      { label: "All", value: "all" },
      { label: "Websites", value: "website" },
      { label: "Google Maps", value: "google_maps" },
      { label: "Directories", value: "directory" },
    ],
    [
      { label: "Hacker News", value: "hackernews" },
      { label: "Reddit", value: "reddit" },
      { label: "Indie Hackers", value: "indiehackers" },
      { label: "Product Hunt", value: "producthunt" },
    ],
  ];

  return (
    <div className="space-y-5">
      <section className="app-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="app-page-title">My Leads</h1>
              <span className="rounded-lg border border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.12)] px-3 py-1 text-sm font-medium text-[var(--accent)]">
                {total}
              </span>
            </div>
            <p className="mt-2 app-muted">Search, review, export, and clean up the leads we have already scraped.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={exporting} onClick={() => void handleExport(exportTargetIds, "csv")} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
              <Download className="h-4 w-4" />
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
            <button type="button" disabled={exporting} onClick={() => void handleExport(exportTargetIds, "xlsx")} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60">
              <Download className="h-4 w-4" />
              {exporting ? "Exporting..." : "Export Excel"}
            </button>
            <button type="button" onClick={() => setShowSheetModal(true)} className="btn-secondary">
              <FileSpreadsheet className="h-4 w-4" />
              Sync to Sheets
            </button>
          </div>
        </div>
      </section>

      <section className="app-card">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <label className="relative block w-full xl:max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search company, email, or location"
              className="app-input w-full pl-11"
            />
          </label>

          <div className="flex flex-1 flex-col gap-4 xl:flex-row xl:items-center xl:justify-end">
            <div className="flex flex-col gap-2">
              {sourcePillRows.map((row, rowIndex) => (
                <div key={`source-row-${rowIndex}`} className="flex flex-wrap gap-2">
                  {row.map((pill) => (
                    <button
                      key={pill.value}
                      type="button"
                      onClick={() => setSourceFilter(pill.value)}
                      className={sourceFilter === pill.value ? "option-card option-card-active py-2" : "option-card py-2"}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)} className="app-input">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="company">A-Z company name</option>
            </select>
          </div>
        </div>
      </section>

      {copyMessage ? (
        <div className="rounded-[10px] border border-[rgba(52,211,153,0.28)] bg-[rgba(52,211,153,0.12)] px-4 py-3 text-sm text-[var(--success)]">{copyMessage}</div>
      ) : null}

      {error ? <div className="rounded-[10px] border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-sm text-red-300">{error}</div> : null}

      {jobIdFilter ? (
        <div className="rounded-[10px] border border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.12)] px-4 py-3 text-sm text-[var(--accent)]">
          Showing leads for job <span className="font-semibold">{jobIdFilter}</span>
        </div>
      ) : null}

      {selectedIds.length ? (
        <div className="app-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">{selectedIds.length} selected</p>
            {bulkEnrichProgress ? (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Enriching {bulkEnrichProgress.current} of {bulkEnrichProgress.total}...
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={bulkEnrichProgress !== null}
              onClick={() => void enrichSelected()}
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkEnrichProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Find emails for selected
            </button>
            <button type="button" onClick={() => setShowSheetModal(true)} className="btn-secondary">
              <FileSpreadsheet className="h-4 w-4" />
              Sync selected to Sheets
            </button>
            <button type="button" disabled={exporting} onClick={() => void handleExport(selectedIds, "csv")} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60">
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
            <button type="button" disabled={exporting} onClick={() => void handleExport(selectedIds, "xlsx")} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60">
              {exporting ? "Exporting..." : "Export Excel"}
            </button>
            <button type="button" disabled={deleting} onClick={() => void deleteSelected()} className="btn-danger disabled:cursor-not-allowed disabled:opacity-60">
              <Trash2 className="h-4 w-4" />
              {deleting ? "Deleting..." : "Delete selected"}
            </button>
          </div>
        </div>
      ) : null}

      {!loading && !leads.length ? (
        <section className="app-card flex min-h-[360px] flex-col items-center justify-center text-center">
          <div className="rounded-[10px] border border-white/10 bg-white/[0.03] p-4">
            <Users className="h-8 w-8 text-[var(--text-secondary)]" />
          </div>
          <h2 className="mt-5 app-section-title">No leads yet</h2>
          <p className="mt-2 max-w-md app-muted">Start a scrape from the finder and your saved leads will show up here automatically.</p>
          <Link href="/finder" className="btn-primary mt-6">
            Go to Lead Finder
          </Link>
        </section>
      ) : (
        <section className="app-card overflow-hidden p-0">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col style={{ width: "40px" }} />
              <col style={{ width: "calc((100% - 40px) * 0.3)" }} />
              <col style={{ width: "calc((100% - 40px) * 0.2)" }} />
              <col style={{ width: "calc((100% - 40px) * 0.2)" }} />
              <col style={{ width: "calc((100% - 40px) * 0.1)" }} />
              <col style={{ width: "calc((100% - 40px) * 0.1)" }} />
              <col style={{ width: "calc((100% - 40px) * 0.1)" }} />
            </colgroup>
            <thead className="border-b border-[var(--border)] bg-[rgba(255,255,255,0.02)] text-xs uppercase tracking-[0.05em] text-[var(--text-secondary)]">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => handleSelectAll(event.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-transparent text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                </th>
                <th className="px-3 py-3 font-medium">Company</th>
                <th className="px-3 py-3 font-medium">Location</th>
                <th className="px-3 py-3 font-medium">Industry</th>
                <th className="px-3 py-3 font-medium">Source</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }, (_, index) => (
                  <tr key={`skeleton-${index}`} className="border-b border-[var(--border)]">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="animate-pulse space-y-3">
                        <div className="h-4 w-40 rounded bg-white/10" />
                        <div className="h-4 w-full rounded bg-white/10" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : filteredLeads.length ? (
                filteredLeads.map((lead) => {
                  const rowId = lead.id ?? `${lead.company_name}-${lead.source_url}`;

                  return (
                    <LeadRow
                      key={rowId}
                      lead={lead}
                      isExpanded={expandedLeadId === rowId}
                      isSelected={lead.id ? selectedIds.includes(lead.id) : false}
                      onToggleExpand={() => setExpandedLeadId(expandedLeadId === rowId ? null : rowId)}
                      onToggleSelect={(checked) => {
                        if (lead.id) {
                          handleSelectOne(lead.id, checked);
                        }
                      }}
                      onCopyEmail={() => void handleCopyEmail(lead.email)}
                      onEnrichEmail={() => {
                        if (lead.id) {
                          void handleEnrichLead(lead.id);
                        }
                      }}
                      isEnriching={lead.id ? enrichingIds.includes(lead.id) : false}
                      onDelete={() => {
                        if (lead.id) {
                          void deleteOne(lead.id);
                        }
                      }}
                    />
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-[var(--text-secondary)]">
                    No leads match your current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      <div className="app-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--text-secondary)]">
          Showing {filteredLeads.length} of {total} leads
        </p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => void fetchLeads(pageNumber)}
              disabled={loading}
              className={page === pageNumber ? "option-card option-card-active px-3 py-2" : "option-card px-3 py-2"}
            >
              {pageNumber}
            </button>
          ))}
        </div>
      </div>

      <GoogleSheetsModal
        open={showSheetModal}
        onClose={() => setShowSheetModal(false)}
        selectedIds={selectedIds}
        totalLeads={total}
        onActionComplete={() => setSelectedIds([])}
      />
    </div>
  );
}
