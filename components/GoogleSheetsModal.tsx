"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, FileSpreadsheet, Info, Loader2, X } from "lucide-react";
import CopyButton from "@/components/CopyButton";
import type { LeadExportProfile } from "@/lib/lead-export";
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
  defaultExportProfile?: LeadExportProfile;
  restaurantProfileAvailable?: boolean;
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

function syncErrorMessage(response: Response, payload: Record<string, unknown>) {
  const rawMessage = String(payload.message ?? payload.error ?? "");
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("no leads match")) {
    return "No leads match this sync filter.";
  }

  if (response.status === 403) {
    return normalized.includes("disabled")
      ? "Your account cannot sync leads right now. Contact support."
      : "Google Sheets sync is not available for this account.";
  }

  if (response.status === 400 && normalized.includes("spreadsheet")) {
    return "Check the spreadsheet ID, tab name, and sharing permission, then try again.";
  }

  return "Google Sheets could not be updated. Check the Sheet setup and try again.";
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

export default function GoogleSheetsModal({
  open,
  onClose,
  selectedIds = [],
  totalLeads,
  defaultSyncFilter = "all",
  defaultExportProfile = "standard",
  restaurantProfileAvailable = false,
  onActionComplete,
}: Props) {
  const { showToast } = useToast();
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("Leads");
  const [mode, setMode] = useState<SheetMode>(selectedIds.length ? "selected" : "recent");
  const [syncFilter, setSyncFilter] = useState<LeadExportFilter>(defaultSyncFilter);
  const [exportProfile, setExportProfile] = useState<LeadExportProfile>(defaultExportProfile);
  const [recentCount, setRecentCount] = useState(20);
  const [loadingMode, setLoadingMode] = useState<SheetMode | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ rowsWritten: number; url: string; warnings: string[] } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      setMode(selectedIds.length ? "selected" : "recent");
      setSyncFilter(defaultSyncFilter);
      setExportProfile(defaultExportProfile);
      setError("");
      setSuccess(null);
    }
  }, [defaultExportProfile, defaultSyncFilter, open, selectedIds.length]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])',
          ),
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (openerRef.current?.isConnected) {
        openerRef.current.focus();
      }
    };
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
      exportProfile,
    };

    try {
      const response = await fetch("/api/sheets/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await parseResponseSafely(response);

      if (!response.ok) {
        throw new Error(syncErrorMessage(response, payload));
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[var(--navy)]/35 px-4 py-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheets-modal-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className="app-modal my-auto max-h-[calc(100vh-3rem)] max-w-2xl overflow-y-auto outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--primary-soft)] text-[var(--accent)]">
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

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Google Sheets sync steps">
          {["Share Sheet", "Sheet details", "Choose records", "Sync result"].map((step, index) => (
            <div
              key={step}
              className={`rounded-xl border px-3 py-2 text-center text-xs font-semibold ${
                success || (index < 3 && (spreadsheetId || index === 0))
                  ? "border-blue-200 bg-[var(--primary-soft)] text-[var(--accent)]"
                  : "border-[var(--border-default)] bg-[var(--surface-secondary)] text-[var(--text-muted)]"
              }`}
            >
              <span className="mr-1">{index + 1}.</span>
              {step}
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4">
            <p className="app-label">1. Share with the service account</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Give Editor access to this email before syncing.</p>
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[var(--border-default)] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <code className="break-all text-xs text-green-700">{serviceAccountEmail}</code>
              <CopyButton value={serviceAccountEmail} label="Copy email" />
            </div>
          </div>

          <details className="rounded-xl border border-blue-200 bg-[var(--primary-soft)] p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[var(--text-primary)]">
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4 text-[var(--accent)]" />
                Google Sheets setup guide
              </span>
              <span className="text-xs font-normal text-[var(--accent)]">Open guide</span>
            </summary>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
              <li>1. Create or open the destination Google Sheet.</li>
              <li>2. Share it with the service-account email shown above as an Editor.</li>
              <li>3. Copy the spreadsheet ID from the URL and enter the destination tab below.</li>
            </ol>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border-default)] bg-white p-3 font-mono text-xs text-[var(--text-muted)]">
              https://docs.google.com/spreadsheets/d/
              <span className="rounded bg-blue-100 px-1 py-0.5 text-blue-700">SPREADSHEET_ID</span>
              /edit
            </div>
            <Link href="/integrations" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
              View full integration guide
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </details>

          <label className="block">
            <span className="app-label">2. Spreadsheet ID</span>
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
            <span className="app-label">3. Sheet format</span>
            <select value={exportProfile} onChange={(event) => setExportProfile(event.target.value as LeadExportProfile)} className="app-input mt-2 w-full">
              <option value="standard">Standard lead list</option>
              <option value="outreach_ready">Outreach-ready prospect list (recommended)</option>
              {restaurantProfileAvailable ? (
                <option value="restaurant_focused">Restaurant-focused lead list</option>
              ) : null}
            </select>
            <span className="mt-2 block text-xs leading-5 text-[var(--text-secondary)]">
              Standard keeps local-business columns concise. Outreach-ready adds validated decision-maker evidence and readiness fields.
            </span>
          </label>

          <label className="block">
            <span className="app-label">4. Sync filter</span>
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
              <label className="block rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-secondary)] p-3">
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
                  ? "rounded-[10px] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-4 py-3 text-left text-amber-800 transition"
                  : "rounded-[10px] border border-[var(--border-default)] bg-white px-4 py-3 text-left text-[var(--text-secondary)] transition hover:border-[var(--warning-border)] hover:bg-[var(--warning-soft)]"
              }
            >
              <span className="block text-sm font-semibold">Replace the destination tab with all saved leads ({totalLeads} total)</span>
              <span className="mt-1 block text-xs">Warning: clears existing rows in this tab before writing every saved lead.</span>
            </button>
          </div>

          {success ? (
            <div className="app-alert app-alert-success">
              <div>
                <p className="font-semibold">{success.rowsWritten} leads synced successfully.</p>
                {success.warnings.length ? <p className="mt-1 text-xs text-amber-800">{success.warnings.join(" ")}</p> : null}
                {success.url ? (
                  <a href={success.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 font-semibold text-green-800 underline underline-offset-4">
                    Open Sheet
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="app-alert app-alert-error">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={loadingMode !== null}
              onClick={() => void runSync(mode)}
              className="btn-primary justify-center sm:whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMode ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loadingMode ? "Syncing leads to Google Sheets..." : submitLabel}
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
