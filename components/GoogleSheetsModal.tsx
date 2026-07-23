"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileSpreadsheet, Info, Loader2, X } from "lucide-react";
import CopyButton from "@/components/CopyButton";
import type { LeadExportFilter } from "@/lib/lead-export-filters";
import { useToast } from "@/lib/useToast";

type SheetMode = "selected" | "recent" | "all";
const serviceAccountEmail = "leadhunter-sheets@leadhunter-498411.iam.gserviceaccount.com";

type Props = {
  open: boolean;
  onClose: () => void;
  selectedIds?: string[];
  totalLeads: number;
  defaultSyncFilter?: LeadExportFilter;
  onActionComplete?: () => void;
};

async function parseResponseSafely(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as Record<string, unknown>;
  }

  const text = await response.text();
  return { error: text.slice(0, 200) };
}

const syncFilterOptions: Array<{ label: string; value: LeadExportFilter }> = [
  { label: "All visible leads", value: "all" },
  { label: "Contactable leads", value: "contactable" },
  { label: "Email found", value: "email_found" },
  { label: "Contact page found", value: "contact_page_found" },
  { label: "Phone found", value: "phone_found" },
  { label: "No public email", value: "no_public_email" },
  { label: "Not contactable", value: "not_contactable" },
  { label: "Has public email", value: "has_public_email" },
  { label: "Any delivery platform found", value: "any_delivery_found" },
  { label: "Uber Eats found", value: "ubereats_found" },
  { label: "DoorDash found", value: "doordash_found" },
  { label: "Grubhub found", value: "grubhub_found" },
  { label: "Deliveroo found", value: "deliveroo_found" },
  { label: "Just Eat found", value: "justeat_found" },
  { label: "Uber Eats or DoorDash found", value: "ubereats_or_doordash_found" },
];

export default function GoogleSheetsModal({ open, onClose, selectedIds = [], totalLeads, defaultSyncFilter = "all", onActionComplete }: Props) {
  const { showToast } = useToast();
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("Leads");
  const [mode, setMode] = useState<SheetMode>(selectedIds.length ? "selected" : "recent");
  const [syncFilter, setSyncFilter] = useState<LeadExportFilter>(defaultSyncFilter);
  const [recentCount, setRecentCount] = useState(20);
  const [loadingMode, setLoadingMode] = useState<SheetMode | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ rowsWritten: number; url: string; warnings: string[] } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMode(selectedIds.length ? "selected" : "recent");
      setSyncFilter(defaultSyncFilter);
      setError("");
      setSuccess(null);
      window.setTimeout(() => dialogRef.current?.focus(), 0);
    }
  }, [defaultSyncFilter, open, selectedIds.length]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  async function runSync(targetMode: SheetMode) {
    if (!spreadsheetId.trim()) {
      setError("Spreadsheet ID is required.");
      return;
    }

    setLoadingMode(targetMode);
    setError("");
    setSuccess(null);

    const body = {
      spreadsheetId: spreadsheetId.trim(),
      sheetName: sheetName.trim() || "Leads",
      mode: targetMode,
      leadIds: targetMode === "selected" ? selectedIds : undefined,
      count: targetMode === "recent" ? Math.min(Math.max(recentCount, 1), 500) : undefined,
      syncFilter,
    };

    try {
      const response = await fetch("/api/sheets/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(String(payload.error ?? payload.message ?? `Server error ${response.status}`));
      }

      const rowsWritten = typeof payload.rowsWritten === "number" ? payload.rowsWritten : 0;
      const url = String(payload.spreadsheetUrl ?? payload.url ?? "");
      const warnings = Array.isArray(payload.warnings) ? payload.warnings.map(String) : [];

      setSuccess({ rowsWritten, url, warnings });
      showToast(`Google Sheets updated with ${rowsWritten} rows.`, "success");
      onActionComplete?.();
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : "Google Sheets sync failed.";
      console.error(exportError);
      setError(message);
      showToast(message, "error");
    } finally {
      setLoadingMode(null);
    }
  }

  const selectedCount = selectedIds.length;
  const submitLabel =
    mode === "selected"
      ? `Sync selected leads (${selectedCount})`
      : mode === "all"
        ? `Replace tab with all leads (${totalLeads} total)`
        : `Sync ${Math.min(Math.max(recentCount, 1), 500)} recent leads`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 px-4 py-6" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheets-modal-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className="app-card my-auto max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[rgba(124,92,252,0.12)] text-[var(--accent)]">
              <FileSpreadsheet className="h-4 w-4" />
            </span>
            <div>
              <h2 id="sheets-modal-title" className="app-section-title">Sync to Google Sheets</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Share your spreadsheet with LeadHunter, then choose what to sync.</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Google Sheets uses the same clean export columns as CSV and Excel.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Close Google Sheets modal">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <details className="rounded-xl border border-violet-400/20 bg-violet-400/[0.06] p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-white">
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4 text-violet-300" />
                Google Sheets setup guide
              </span>
              <span className="text-xs font-normal text-[var(--accent)]">Open guide</span>
            </summary>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
              <li>1. Share your spreadsheet with the LeadHunter service account as an Editor.</li>
              <li className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[var(--bg)] p-3 sm:flex-row sm:items-center sm:justify-between">
                <code className="break-all text-xs text-emerald-200">{serviceAccountEmail}</code>
                <CopyButton value={serviceAccountEmail} label="Copy email" />
              </li>
              <li>2. Copy the spreadsheet ID from the Google Sheets URL.</li>
              <li>3. Paste the ID below and enter the destination tab name.</li>
            </ol>
            <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-[var(--bg)] p-3 font-mono text-xs text-[var(--text-muted)]">
              https://docs.google.com/spreadsheets/d/
              <span className="rounded bg-[rgba(124,92,252,0.2)] px-1 py-0.5 text-violet-200">SPREADSHEET_ID</span>
              /edit
            </div>
            <Link href="/integrations" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
              View full integration guide
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </details>

          <label className="block">
            <span className="app-label">Spreadsheet ID</span>
            <input
              value={spreadsheetId}
              onChange={(event) => setSpreadsheetId(event.target.value)}
              className="app-input mt-2 w-full"
              placeholder="1AbCDefGhIJKlmnop..."
            />
            <span className="mt-2 block text-xs leading-5 text-[var(--text-secondary)]">
              The value between <code>/d/</code> and <code>/edit</code> in the Google Sheets URL.
            </span>
          </label>

          <label className="block">
            <span className="app-label">Sheet tab name</span>
            <input value={sheetName} onChange={(event) => setSheetName(event.target.value)} className="app-input mt-2 w-full" />
            <span className="mt-2 block text-xs leading-5 text-[var(--text-secondary)]">
              The tab inside the spreadsheet where leads should be written, for example: Leads.
            </span>
          </label>

          <label className="block">
            <span className="app-label">Sync filter</span>
            <select value={syncFilter} onChange={(event) => setSyncFilter(event.target.value as LeadExportFilter)} className="app-input mt-2 w-full">
              {syncFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-xs leading-5 text-[var(--text-secondary)]">
              Sync only the leads that match this filter.
            </span>
          </label>

          <div className="grid gap-2">
            {selectedCount ? (
              <button
                type="button"
                onClick={() => setMode("selected")}
                className={mode === "selected" ? "option-card option-card-active text-left" : "option-card text-left"}
              >
                <span className="block font-semibold">Sync selected leads ({selectedCount})</span>
                <span className="mt-1 block text-xs text-[var(--text-secondary)]">Write exactly the leads currently checked in the table.</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setMode("recent")}
              className={mode === "recent" ? "option-card option-card-active text-left" : "option-card text-left"}
            >
              <span className="block font-semibold">Sync most recent leads</span>
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">Choose a recent slice sorted by scrape time.</span>
            </button>

            {mode === "recent" ? (
              <label className="block rounded-[10px] border border-white/10 bg-[var(--bg)] p-3">
                <span className="app-label">How many recent leads?</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={recentCount}
                  onChange={(event) => setRecentCount(Math.min(Math.max(Number(event.target.value) || 1, 1), 500))}
                  className="app-input mt-2 w-full"
                />
              </label>
            ) : null}

            <button
              type="button"
              onClick={() => setMode("all")}
              className={
                mode === "all"
                  ? "rounded-[10px] border border-red-400/40 bg-red-500/[0.08] px-4 py-3 text-left text-red-200 transition"
                  : "rounded-[10px] border border-red-400/20 bg-transparent px-4 py-3 text-left text-[var(--text-secondary)] transition hover:bg-red-500/[0.06]"
              }
            >
              <span className="block text-sm font-semibold">Replace the destination tab with all saved leads ({totalLeads} total)</span>
              <span className="mt-1 block text-xs">Warning: clears existing rows in this tab before writing every saved lead.</span>
            </button>
          </div>

          {success ? (
            <div className="rounded-[10px] border border-[rgba(52,211,153,0.28)] bg-[rgba(52,211,153,0.12)] px-4 py-3 text-sm text-[var(--success)]">
              {success.rowsWritten} rows written.{" "}
              <a href={success.url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
                Open Sheet
              </a>
              {success.warnings.length ? <span className="mt-2 block text-xs text-amber-200">{success.warnings.join(" ")}</span> : null}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-[10px] border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={loadingMode !== null}
              onClick={() => void runSync(mode)}
              className="btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMode ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loadingMode ? "Working..." : submitLabel}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary justify-center">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
