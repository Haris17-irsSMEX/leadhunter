"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, Loader2, X } from "lucide-react";
import { useToast } from "@/lib/useToast";

type SheetMode = "selected" | "recent" | "all";

type Props = {
  open: boolean;
  onClose: () => void;
  selectedIds?: string[];
  totalLeads: number;
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

export default function GoogleSheetsModal({ open, onClose, selectedIds = [], totalLeads, onActionComplete }: Props) {
  const { showToast } = useToast();
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("Leads");
  const [mode, setMode] = useState<SheetMode>(selectedIds.length ? "selected" : "recent");
  const [recentCount, setRecentCount] = useState(20);
  const [loadingMode, setLoadingMode] = useState<SheetMode | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ rowsWritten: number; url: string } | null>(null);

  useEffect(() => {
    if (open) {
      setMode(selectedIds.length ? "selected" : "recent");
      setError("");
      setSuccess(null);
    }
  }, [open, selectedIds.length]);

  if (!open) {
    return null;
  }

  async function runExport(targetMode: SheetMode) {
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

      setSuccess({ rowsWritten, url });
      showToast(`Google Sheets updated with ${rowsWritten} rows.`, "success");
      onActionComplete?.();
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : "Google Sheets export failed.";
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
      ? `Export selected leads (${selectedCount})`
      : mode === "all"
        ? `Replace entire sheet with ALL leads (${totalLeads} total)`
        : `Export ${Math.min(Math.max(recentCount, 1), 500)} recent leads`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="app-card w-full max-w-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[rgba(124,92,252,0.12)] text-[var(--accent)]">
              <FileSpreadsheet className="h-4 w-4" />
            </span>
            <div>
              <h2 className="app-section-title">Export to Google Sheets</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Choose exactly what should be sent to the sheet.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Close Google Sheets modal">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="app-label">Spreadsheet ID</span>
            <input
              value={spreadsheetId}
              onChange={(event) => setSpreadsheetId(event.target.value)}
              className="app-input mt-2 w-full"
              placeholder="1AbCDefGhIJKlmnop..."
            />
          </label>

          <label className="block">
            <span className="app-label">Sheet tab name</span>
            <input value={sheetName} onChange={(event) => setSheetName(event.target.value)} className="app-input mt-2 w-full" />
          </label>

          <div className="grid gap-2">
            {selectedCount ? (
              <button
                type="button"
                onClick={() => setMode("selected")}
                className={mode === "selected" ? "option-card option-card-active text-left" : "option-card text-left"}
              >
                <span className="block font-semibold">Export selected leads ({selectedCount})</span>
                <span className="mt-1 block text-xs text-[var(--text-secondary)]">Send exactly the leads currently checked in the table.</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setMode("recent")}
              className={mode === "recent" ? "option-card option-card-active text-left" : "option-card text-left"}
            >
              <span className="block font-semibold">Export most recent leads</span>
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
              <span className="block text-sm font-semibold">Replace entire sheet with ALL leads ({totalLeads} total)</span>
              <span className="mt-1 block text-xs">Advanced: clears existing sheet rows before writing every saved lead.</span>
            </button>
          </div>

          {success ? (
            <div className="rounded-[10px] border border-[rgba(52,211,153,0.28)] bg-[rgba(52,211,153,0.12)] px-4 py-3 text-sm text-[var(--success)]">
              {success.rowsWritten} rows written.{" "}
              <a href={success.url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
                Open Sheet
              </a>
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
              onClick={() => void runExport(mode)}
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
