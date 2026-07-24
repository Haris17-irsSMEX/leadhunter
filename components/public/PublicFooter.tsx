import Link from "next/link";
import LeadHunterLogo from "@/components/branding/LeadHunterLogo";

const productLinks = [
  ["Product", "/#product"],
  ["How it works", "/#how-it-works"],
  ["Restaurant intelligence", "/#restaurant-intelligence"],
  ["Pricing", "/#pricing"],
];

const useCaseLinks = [
  ["Agencies", "/#use-cases"],
  ["Web developers", "/#website-opportunity"],
  ["Restaurant campaigns", "/#restaurant-intelligence"],
  ["Export workflows", "/#exports"],
];

export default function PublicFooter({ supportEmail }: { supportEmail: string }) {
  return (
    <footer className="border-t border-[var(--border-default)] bg-white">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.35fr_0.65fr_0.65fr_0.8fr] lg:px-8">
        <div className="max-w-sm">
          <Link href="/" aria-label="LeadHunter home">
            <LeadHunterLogo size="md" />
          </Link>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
            Organize publicly available business information into focused, export-ready lead lists.
          </p>
          <p className="mt-5 text-xs leading-5 text-[var(--text-muted)]">
            LeadHunter helps organize publicly available business information. Users are responsible for following
            applicable outreach, privacy, and platform rules.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Product</h2>
          <ul className="mt-4 space-y-3">
            {productLinks.map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="text-sm text-[var(--text-secondary)] transition hover:text-[var(--primary)]">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Use cases</h2>
          <ul className="mt-4 space-y-3">
            {useCaseLinks.map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="text-sm text-[var(--text-secondary)] transition hover:text-[var(--primary)]">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Company</h2>
          <ul className="mt-4 space-y-3">
            <li>
              <Link href="/privacy" className="text-sm text-[var(--text-secondary)] transition hover:text-[var(--primary)]">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="text-sm text-[var(--text-secondary)] transition hover:text-[var(--primary)]">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href="/login" className="text-sm text-[var(--text-secondary)] transition hover:text-[var(--primary)]">
                Log in
              </Link>
            </li>
            <li>
              <Link
                href="/login?mode=signup"
                className="text-sm text-[var(--text-secondary)] transition hover:text-[var(--primary)]"
              >
                Get started
              </Link>
            </li>
            <li>
              <a
                href={`mailto:${supportEmail}`}
                className="break-all text-sm text-[var(--text-secondary)] transition hover:text-[var(--primary)]"
              >
                {supportEmail}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--border-default)]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-5 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>Copyright {new Date().getFullYear()} LeadHunter. All rights reserved.</p>
          <p>
            LeadHunter by{" "}
            <a
              href="https://irssmex.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:text-[var(--primary)]"
            >
              irsSMEX
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
