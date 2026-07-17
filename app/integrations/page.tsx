import Link from "next/link";
import { ArrowRight, CheckCircle2, FileSpreadsheet, HelpCircle, Link2, Sheet } from "lucide-react";
import CopyButton from "@/components/CopyButton";

const serviceAccountEmail = "leadhunter-sheets@leadhunter-498411.iam.gserviceaccount.com";

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <section className="app-card">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(124,92,252,0.12)] text-[var(--accent)]">
            <Link2 className="h-5 w-5" />
          </span>
          <div>
            <p className="app-label text-[var(--accent)]">Workspace setup</p>
            <h1 className="app-page-title mt-2">Integrations</h1>
            <p className="mt-2 app-muted">Connect LeadHunter to the tools your team already uses.</p>
          </div>
        </div>
      </section>

      <section className="app-card overflow-hidden p-0">
        <div className="border-b border-white/10 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
                <FileSpreadsheet className="h-6 w-6" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-white">Google Sheets</h2>
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                    Available
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                  Share your Google Sheet with this email as an Editor. This permission allows LeadHunter to write the leads you choose into the spreadsheet.
                </p>
              </div>
            </div>
            <Link href="/leads" className="btn-primary h-11 justify-center">
              Go to My Leads
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="app-label">Service account email</p>
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-white/10 bg-[var(--bg)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <code className="break-all text-sm text-emerald-200">{serviceAccountEmail}</code>
              <CopyButton value={serviceAccountEmail} label="Copy email" />
            </div>

            <h3 className="mt-8 app-section-title">Set up Google Sheets in four steps</h3>
            <ol className="mt-5 space-y-3">
              {[
                ["Step 1", "Open the Google Sheet where you want to receive leads."],
                ["Step 2", "Click Share and add the LeadHunter service-account email as an Editor."],
                ["Step 3", "Copy the spreadsheet ID from the URL."],
                ["Step 4", "Go to My Leads, click Sync to Google Sheets, paste the ID, choose the tab, and sync."],
              ].map(([step, copy]) => (
                <li key={step} className="flex gap-4 rounded-xl border border-white/[0.08] bg-[var(--bg)] p-4">
                  <span className="flex h-8 shrink-0 items-center rounded-lg bg-[rgba(124,92,252,0.12)] px-3 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--accent)]">
                    {step}
                  </span>
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">{copy}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-[var(--bg)] p-5">
              <div className="flex items-center gap-3">
                <Sheet className="h-5 w-5 text-emerald-300" />
                <h3 className="font-semibold text-white">Find the spreadsheet ID</h3>
              </div>
              <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                <div className="flex gap-1.5 border-b border-white/10 px-3 py-2">
                  <span className="h-2 w-2 rounded-full bg-red-400/60" />
                  <span className="h-2 w-2 rounded-full bg-amber-300/60" />
                  <span className="h-2 w-2 rounded-full bg-emerald-400/60" />
                </div>
                <div className="overflow-x-auto p-4 font-mono text-xs text-[var(--text-muted)]">
                  https://docs.google.com/spreadsheets/d/
                  <span className="rounded bg-[rgba(124,92,252,0.2)] px-1.5 py-1 text-violet-200">
                    1AbCdEfGhIjKlMnOp
                  </span>
                  /edit
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
                The spreadsheet ID is the part between <code>/d/</code> and <code>/edit</code>.
              </p>
            </div>

            <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.06] p-5">
              <div className="flex items-center gap-3">
                <HelpCircle className="h-5 w-5 text-violet-300" />
                <h3 className="font-semibold text-white">Why is this necessary?</h3>
              </div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
                {[
                  "Google requires edit permission before an external service can write data.",
                  "The spreadsheet ID identifies the destination spreadsheet.",
                  "The sheet tab name identifies the destination tab.",
                  "LeadHunter only writes the leads you choose to sync.",
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
