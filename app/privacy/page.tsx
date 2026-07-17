import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy",
  description: "LeadHunter early-access privacy information.",
};

export default function PrivacyPage() {
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
          <h1 className="mt-10 text-4xl font-semibold tracking-[-0.04em]">Early-access privacy notice</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated: July 17, 2026</p>
          <div className="mt-8 space-y-7 text-sm leading-7 text-slate-300">
            <section>
              <h2 className="text-lg font-semibold text-white">Information we process</h2>
              <p className="mt-2">
                LeadHunter processes account email addresses, saved lead records, scrape job activity, and integration inputs needed to provide the service. Lead data is collected from public business pages and supported public sources at the user&apos;s request.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-white">How information is used</h2>
              <p className="mt-2">
                We use this information to authenticate users, run requested searches, save and export leads, enforce plan limits, operate Google Sheets sync, diagnose failures, and support the early-access product.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-white">Service providers</h2>
              <p className="mt-2">
                LeadHunter relies on infrastructure and APIs including Supabase, Google Places, Google Sheets, Upstash when configured, and ScrapeGraphAI for supported extraction features. Their processing is subject to their own terms and privacy practices.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-white">Google Sheets</h2>
              <p className="mt-2">
                LeadHunter writes only the lead records a user chooses to sync to the spreadsheet and tab they provide. Users can remove the service account&apos;s access from Google Sheets at any time.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-white">Contact</h2>
              <p className="mt-2">
                For privacy questions or account-data requests, email{" "}
                <a href="mailto:irssmex@gmail.com" className="text-violet-300 underline underline-offset-4">
                  irssmex@gmail.com
                </a>
                . Because LeadHunter is in early access, this notice may be updated as the product and its legal requirements mature.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
