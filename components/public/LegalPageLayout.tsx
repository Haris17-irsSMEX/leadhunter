import type { ReactNode } from "react";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";

export type LegalSection = {
  content: ReactNode;
  id: string;
  title: string;
};

export default function LegalPageLayout({
  eyebrow,
  title,
  summary,
  updatedAt,
  sections,
  supportEmail,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  updatedAt: string;
  sections: LegalSection[];
  supportEmail: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--page-background)] text-[var(--text-primary)]">
      <PublicHeader />

      <main>
        <section className="relative overflow-hidden border-b border-[var(--border-default)] bg-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(20,99,255,0.10),transparent_34%),radial-gradient(circle_at_16%_90%,rgba(14,165,233,0.06),transparent_30%)]"
          />
          <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <p className="text-sm font-bold text-[var(--primary)]">{eyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-[-0.045em] text-[var(--text-primary)] sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-[var(--text-secondary)] sm:text-lg">{summary}</p>
            <p className="mt-6 text-sm font-medium text-[var(--text-muted)]">Last updated: {updatedAt}</p>
          </div>
        </section>

        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-8 lg:py-16">
          <aside className="hidden lg:block">
            <nav
              aria-label={`${title} sections`}
              className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-[18px] border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-small)]"
            >
              <p className="px-2 text-xs font-bold text-[var(--text-muted)]">ON THIS PAGE</p>
              <ul className="mt-3 space-y-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="block rounded-xl px-2.5 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="min-w-0 rounded-[22px] border border-[var(--border-default)] bg-white px-5 py-2 shadow-[var(--shadow-card)] sm:px-8 lg:px-10">
            {sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-28 border-b border-[var(--border-default)] py-8 last:border-0 sm:py-10"
              >
                <h2 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)] sm:text-2xl">
                  {section.title}
                </h2>
                <div className="mt-4 space-y-4 text-[15px] leading-7 text-[var(--text-secondary)]">{section.content}</div>
              </section>
            ))}
          </article>
        </div>
      </main>

      <PublicFooter supportEmail={supportEmail} />
    </div>
  );
}
