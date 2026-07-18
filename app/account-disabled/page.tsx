import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert, Zap } from "lucide-react";
import AccountDisabledActions from "@/components/AccountDisabledActions";

export const metadata: Metadata = {
  title: "Account disabled",
  robots: { index: false, follow: false },
};

export default function AccountDisabledPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080a12] px-4 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#14172a] p-8 shadow-2xl shadow-black/30 sm:p-10">
        <Link href="/" className="mb-8 inline-flex items-center gap-3 text-lg font-bold text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C5CFC,#5B3FE0)]">
            <Zap className="h-5 w-5" />
          </span>
          LeadHunter
        </Link>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-amber-200">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">Account disabled</h1>
        <p className="mt-3 leading-7 text-[var(--text-secondary)]">
          Your LeadHunter account is currently disabled. Contact{" "}
          <a className="font-medium text-[var(--accent)] hover:underline" href="mailto:irssmex@gmail.com">
            irssmex@gmail.com
          </a>{" "}
          if you believe this is a mistake.
        </p>
        <div className="mt-8">
          <AccountDisabledActions />
        </div>
      </section>
    </main>
  );
}
