import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms",
  description: "LeadHunter early-access terms.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#080a12] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to LeadHunter
        </Link>
        <div className="mt-10 rounded-[26px] border border-white/10 bg-[#111522] p-6 sm:p-10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600">
              <Zap className="h-5 w-5" />
            </span>
            <span className="font-bold">LeadHunter</span>
          </div>
          <h1 className="mt-10 text-4xl font-semibold tracking-[-0.04em]">Early-access terms</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated: July 17, 2026</p>
          <div className="mt-8 space-y-7 text-sm leading-7 text-slate-300">
            <section>
              <h2 className="text-lg font-semibold text-white">Early-access service</h2>
              <p className="mt-2">
                LeadHunter is provided as an evolving early-access product. Features, provider availability, limits, and pricing may change. Paid self-serve checkout is not active in this release.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-white">Acceptable use</h2>
              <p className="mt-2">
                Users may use LeadHunter to discover, organize, and export public business information for lawful purposes. Users must not use the service to access private data, evade source restrictions, overload third-party services, or violate applicable laws or platform terms.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-white">Outreach responsibility</h2>
              <p className="mt-2">
                LeadHunter does not automate outreach. Users are responsible for the content, targeting, consent, and legal compliance of any outreach they perform using exported data.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-white">Data accuracy and availability</h2>
              <p className="mt-2">
                Public source data can be incomplete, outdated, or unavailable. Email enrichment is optional and is not guaranteed to find or verify an address. Third-party API or credit availability may temporarily affect some sources.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-white">Accounts and limits</h2>
              <p className="mt-2">
                Users are responsible for keeping account credentials secure. Monthly lead limits apply to protect the early-access service and its paid data providers. Access may be limited for abuse or security concerns.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-white">Contact</h2>
              <p className="mt-2">
                Questions about these terms can be sent to{" "}
                <a href="mailto:irssmex@gmail.com" className="text-violet-300 underline underline-offset-4">
                  irssmex@gmail.com
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
