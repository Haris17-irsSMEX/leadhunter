import type { ReactNode } from "react";
import LeadHunterLogo from "@/components/branding/LeadHunterLogo";

type EdgeStateScreenProps = {
  eyebrow?: string;
  title: string;
  description: string;
  icon: ReactNode;
  actions: ReactNode;
  footer?: ReactNode;
  tone?: "info" | "warning" | "error";
};

const toneClasses = {
  info: "border-blue-200 bg-blue-50 text-blue-700",
  warning: "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]",
  error: "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]",
} as const;

export default function EdgeStateScreen({
  eyebrow,
  title,
  description,
  icon,
  actions,
  footer,
  tone = "info",
}: EdgeStateScreenProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)] px-4 py-10 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(20,99,255,0.10),transparent_30%),radial-gradient(circle_at_88%_88%,rgba(14,165,233,0.08),transparent_32%)]"
      />
      <section className="relative w-full max-w-xl rounded-[24px] border border-[var(--border-default)] bg-white p-6 shadow-[var(--shadow-elevated)] sm:p-9">
        <a href="/" className="inline-flex min-h-11 items-center rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)]">
          <LeadHunterLogo size="md" />
        </a>

        <div className={`mt-8 flex h-12 w-12 items-center justify-center rounded-2xl border ${toneClasses[tone]}`}>
          {icon}
        </div>

        {eyebrow ? <p className="mt-6 text-sm font-bold text-[var(--accent)]">{eyebrow}</p> : null}
        <h1 className={`${eyebrow ? "mt-2" : "mt-6"} text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl`}>
          {title}
        </h1>
        <p className="mt-4 text-base leading-7 text-[var(--text-secondary)]">{description}</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{actions}</div>
        {footer ? <div className="mt-6 border-t border-[var(--border-default)] pt-5 text-sm text-[var(--text-secondary)]">{footer}</div> : null}
      </section>
    </main>
  );
}
