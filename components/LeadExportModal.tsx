"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import type { LeadExportProfile } from "@/lib/lead-export";
import type { LeadExportFilter } from "@/lib/lead-export-filters";
import { useToast } from "@/lib/useToast";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

export type LeadExportFormat = "csv" | "xlsx";
type ExportScope = "selected" | "recent" | "all";

type Props = {
  open: boolean;
  onClose: () => void;
  format: LeadExportFormat;
  selectedLeadIds: string[];
  totalLeads: number;
  initialScope?: ExportScope;
  exportFilter?: LeadExportFilter;
  exportProfile?: LeadExportProfile;
};

const DEFAULT_EXPORT_FILTER: LeadExportFilter = "all";
const DEFAULT_EXPORT_PROFILE: LeadExportProfile = "standard";

async function parseResponseSafely(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as Record<string, unknown>;
  }

  const text = await response.text();
  return { error: text.slice(0, 200) };
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

function filenameFromDisposition(disposition: string | null, fallback: string) {
  if (!disposition) {
    return fallback;
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1].replace(/"/g, ""));
  }

  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
  return filenameMatch?.[1] ?? fallback;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function exportTitle(format: LeadExportFormat) {
  return format === "xlsx" ? "Export to Excel" : "Export to CSV";
}

function exportDescription(format: LeadExportFormat) {
  return format === "xlsx"
    ? "Choose which saved leads to include in the Excel workbook."
    : "Choose which saved leads to include in the CSV file.";
}

function exportLoadingLabel(format: LeadExportFormat) {
  return format === "xlsx" ? "Preparing Excel workbook..." : "Preparing CSV...";
}

function fallbackFilename(format: LeadExportFormat) {
  return format === "xlsx" ? "leadhunter-leads.xlsx" : "leadhunter-leads.csv";
}

function defaultRecentCount(totalLeads: number) {
  if (totalLeads < 1) return "20";
  return String(Math.min(20, totalLeads, WORKLOAD_LIMITS.exports.maxRows));
}

function requestUrl(params: {
  format: LeadExportFormat;
  scope: ExportScope;
  selectedLeadIds: string[];
  recentCount: number;
  exportFilter: LeadExportFilter;
  exportProfile: LeadExportProfile;
}) {
  const base = params.format === "xlsx" ? "/api/leads/export/xlsx" : "/api/leads/export";
  const query = new URLSearchParams({
    scope: params.scope,
    profile: params.exportProfile,
  });

  if (params.exportFilter !== "all") {
    query.set("export_filter", params.exportFilter);
  }

  if (params.scope === "selected") {
    query.set("ids", params.selectedLeadIds.join(","));
  }

  if (params.scope === "recent") {
    query.set("recent_count", String(params.recentCount));
  }

  return `${base}?${query.toString()}`;
}

export default function LeadExportModal({
  open,
  onClose,
  format,
  selectedLeadIds,
  totalLeads,
  initialScope = "recent",
  exportFilter = DEFAULT_EXPORT_FILTER,
  exportProfile = DEFAULT_EXPORT_PROFILE,
}: Props) {
  const { showToast } = useToast();
  const selectedCount = selectedLeadIds.length;
  const recentMax = Math.min(totalLeads, WORKLOAD_LIMITS.exports.maxRows);
  const availableScopes = useMemo<ExportScope[]>(
    () => (selectedCount ? ["selected", "recent", "all"] : ["recent", "all"]),
    [selectedCount],
  );
  const initialAvailableScope = availableScopes.includes(initialScope) ? initialScope : "recent";
  const [scope, setScope] = useState<ExportScope>(initialAvailableScope);
  const [recentCount, setRecentCount] = useState("20");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    setScope(availableScopes.includes(initialScope) ? initialScope : "recent");
    setRecentCount(defaultRecentCount(totalLeads));
    setError("");
    setExporting(false);
  }, [availableScopes, initialScope, open, totalLeads]);

  useEffect(() => {
    if (!open || availableScopes.includes(scope)) return;
    setScope("recent");
  }, [availableScopes, open, scope]);

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

      const activeElement = document.activeElement;
      const arrowKey = event.key === "ArrowDown" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowLeft";
      const activeInput = activeElement instanceof HTMLElement && activeElement.closest("input, textarea, select");

      if (arrowKey && !activeInput && dialogRef.current?.contains(activeElement)) {
        const currentIndex = availableScopes.indexOf(scope);
        if (currentIndex >= 0) {
          event.preventDefault();
          const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
          const nextIndex = (currentIndex + direction + availableScopes.length) % availableScopes.length;
          setScope(availableScopes[nextIndex]);
        }
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
  }, [availableScopes, onClose, open, scope]);

  if (!open) {
    return null;
  }

  function validatedRecentCount() {
    const value = recentCount.trim();
    if (!/^\d+$/.test(value)) {
      setError(`Enter a number between 1 and ${Math.max(recentMax, 1)}.`);
      return null;
    }

    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 1 || count > recentMax) {
      setError(`Enter a number between 1 and ${Math.max(recentMax, 1)}.`);
      return null;
    }

    return count;
  }

  function validateScope() {
    if (scope === "selected") {
      if (!selectedCount) {
        setError("No leads are selected.");
        return null;
      }
      if (selectedCount > WORKLOAD_LIMITS.exports.maxSelectedIds) {
        setError(`Select no more than ${WORKLOAD_LIMITS.exports.maxSelectedIds} leads per export.`);
        return null;
      }
      return { scope, recentCount: 0 };
    }

    if (!totalLeads) {
      setError("No saved leads are available to export.");
      return null;
    }

    if (scope === "recent") {
      const count = validatedRecentCount();
      return count ? { scope, recentCount: count } : null;
    }

    if (totalLeads > WORKLOAD_LIMITS.exports.maxRows) {
      setError(`This export exceeds the supported row limit of ${WORKLOAD_LIMITS.exports.maxRows.toLocaleString()} leads.`);
      return null;
    }

    return { scope, recentCount: 0 };
  }

  async function runExport() {
    const validated = validateScope();
    if (!validated) return;

    setExporting(true);
    setError("");

    try {
      const response = await fetch(
        requestUrl({
          format,
          scope: validated.scope,
          selectedLeadIds,
          recentCount: validated.recentCount,
          exportFilter,
          exportProfile,
        }),
        { cache: "no-store" },
      );

      if (!response.ok) {
        const payload = await parseResponseSafely(response);
        throw new Error(String(payload.message ?? payload.error ?? "The export could not be prepared. Please try again."));
      }

      const blob = await response.blob();
      triggerBlobDownload(blob, filenameFromDisposition(response.headers.get("content-disposition"), fallbackFilename(format)));
      showToast(format === "xlsx" ? "Excel export prepared." : "CSV export prepared.", "success");
      onClose();
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : "The export could not be prepared. Please try again.";
      setError(message);
      showToast(message, "error");
    } finally {
      setExporting(false);
    }
  }

  const Icon = format === "xlsx" ? FileSpreadsheet : FileText;
  const recentValue = validatedRecentPreview(recentCount);
  const primaryLabel =
    scope === "selected"
      ? `Export ${selectedCount} selected ${pluralize(selectedCount, "lead")}`
      : scope === "all"
        ? "Export all saved leads"
        : `Export ${recentValue || 20} recent ${pluralize(recentValue || 20, "lead")}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[var(--navy)]/35 px-4 py-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-export-modal-title"
        aria-describedby="lead-export-modal-description"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className="app-modal my-auto max-h-[calc(100vh-3rem)] max-w-2xl overflow-y-auto outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--primary-soft)] text-[var(--accent)]">
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <h2 id="lead-export-modal-title" className="app-section-title">{exportTitle(format)}</h2>
              <p id="lead-export-modal-description" className="mt-1 text-sm text-[var(--text-secondary)]">
                {exportDescription(format)}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label={`Close ${exportTitle(format)} modal`}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <p className="app-label">Choose leads to export</p>
            <div role="radiogroup" aria-label="Export scope" className="mt-3 grid gap-3">
              {selectedCount ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked={scope === "selected"}
                  onClick={() => {
                    setScope("selected");
                    setError("");
                  }}
                  className={scope === "selected" ? "option-card option-card-active text-left" : "option-card text-left"}
                >
                  <span className="block font-semibold">Export selected leads</span>
                  <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                    Export the {selectedCount} {pluralize(selectedCount, "lead")} currently selected in My Leads.
                  </span>
                </button>
              ) : null}

              <button
                type="button"
                role="radio"
                aria-checked={scope === "recent"}
                onClick={() => {
                  setScope("recent");
                  setError("");
                }}
                className={scope === "recent" ? "option-card option-card-active text-left" : "option-card text-left"}
              >
                <span className="block font-semibold">Export most recent leads</span>
                <span className="mt-1 block text-xs text-[var(--text-secondary)]">Choose a recent slice sorted by scrape time.</span>
              </button>

              {scope === "recent" ? (
                <label className="block rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-secondary)] p-3">
                  <span className="app-label">How many recent leads?</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={Math.max(recentMax, 1)}
                    value={recentCount}
                    onChange={(event) => {
                      setRecentCount(event.target.value);
                      setError("");
                    }}
                    className="app-input mt-2 w-full"
                    aria-describedby="recent-export-help"
                  />
                  <span id="recent-export-help" className="mt-2 block text-xs leading-5 text-[var(--text-secondary)]">
                    Newest leads first. Maximum available: {recentMax.toLocaleString()}.
                  </span>
                </label>
              ) : null}

              <button
                type="button"
                role="radio"
                aria-checked={scope === "all"}
                onClick={() => {
                  setScope("all");
                  setError("");
                }}
                className={scope === "all" ? "option-card option-card-active text-left" : "option-card text-left"}
              >
                <span className="block font-semibold">Export all saved leads</span>
                <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                  Export every saved lead in your workspace ({totalLeads.toLocaleString()} total).
                </span>
                <span className="mt-2 block text-xs text-[var(--warning)]">Large exports may take longer to prepare.</span>
              </button>
            </div>
          </div>

          {error ? (
            <div role="alert" aria-live="polite" className="app-alert app-alert-error">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={exporting} className="btn-secondary justify-center disabled:cursor-not-allowed disabled:opacity-60">
              Cancel
            </button>
            <button type="button" onClick={() => void runExport()} disabled={exporting} className="btn-primary justify-center sm:whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {exporting ? exportLoadingLabel(format) : primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function validatedRecentPreview(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const count = Number(trimmed);
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}
