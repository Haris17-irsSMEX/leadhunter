import Link from "next/link";
import { CalendarClock, TrendingUp } from "lucide-react";
import type { UsageSummary } from "@/lib/usage";

export default function MonthlyLimitNotice({
  usage,
  supportEmail,
}: {
  usage: UsageSummary;
  supportEmail: string;
}) {
  return (
    <section
      className="rounded-[22px] border border-[var(--warning-border)] bg-[var(--warning-soft)] p-5 shadow-[var(--shadow-small)] sm:p-6"
      aria-labelledby="monthly-limit-title"
      role="status"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--warning-border)] bg-white text-[var(--warning)]">
              <CalendarClock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="monthly-limit-title" className="text-xl font-bold text-[var(--text-primary)]">
                Monthly lead limit reached
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                You have used your current monthly lead allowance.
              </p>
            </div>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Current plan", usage.planLabel],
              ["Leads used", usage.used.toLocaleString()],
              ["Monthly allowance", usage.limit.toLocaleString()],
              ["Leads remaining", "0"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[var(--warning-border)] bg-white/80 px-4 py-3">
                <dt className="text-xs font-semibold text-[var(--text-secondary)]">{label}</dt>
                <dd className="mt-1 text-sm font-bold text-[var(--text-primary)]">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            Your allowance resets at the beginning of the next calendar month.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <a
            href={`mailto:${supportEmail}?subject=LeadHunter%20Plan%20Upgrade`}
            className="btn-primary justify-center"
          >
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
            Request plan upgrade
          </a>
          <Link href="/leads" className="btn-secondary justify-center">
            View saved leads
          </Link>
        </div>
      </div>
    </section>
  );
}
