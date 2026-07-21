import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Globe2,
  Mail,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  TableProperties,
  Users,
  Zap,
} from "lucide-react";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "irssmex@gmail.com";
const demoLink = `mailto:${supportEmail}?subject=LeadHunter%20Demo%20Request`;
const agencyLink = `mailto:${supportEmail}?subject=LeadHunter%20Agency%20Plan`;
const serviceAccountEmail = "leadhunter-sheets@leadhunter-498411.iam.gserviceaccount.com";

export const metadata: Metadata = {
  title: "LeadHunter - Build Targeted Lead Lists Faster",
  description:
    "Find business leads from Google Maps and startup communities, organize them, and export them to CSV, Excel, or Google Sheets.",
  alternates: {
    canonical: "https://leadhunter.irssmex.com",
  },
};

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Google Sheets", href: "#google-sheets" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const features = [
  {
    icon: MapPin,
    title: "Google Maps lead discovery",
    copy: "Collect public business names, websites, phone numbers, addresses, categories, and source details by niche, location, and website status.",
  },
  {
    icon: Globe2,
    title: "Website-status targeting",
    copy: "Filter Google Maps results by all businesses, businesses with websites, or businesses with no website listed.",
  },
  {
    icon: TableProperties,
    title: "Central lead workspace",
    copy: "Search, filter, review, expand, copy, open, and clean up saved prospects from one focused workspace.",
  },
  {
    icon: Download,
    title: "CSV and Excel export",
    copy: "Move a full list or selected leads into the formats your outreach workflow already uses.",
  },
  {
    icon: FileSpreadsheet,
    title: "Google Sheets sync",
    copy: "Send recent, selected, or all saved leads to the spreadsheet and tab your team chooses.",
  },
  {
    icon: Globe2,
    title: "Community intent leads",
    copy: "Find public Hacker News launches, hiring signals, and discussions that show timely business intent.",
  },
  {
    icon: Mail,
    title: "Optional email enrichment",
    copy: "Search public contact and about pages when a business website is available. Results are not guaranteed.",
  },
  {
    icon: MapPin,
    title: "Restaurant campaign enrichment",
    copy: "For restaurant campaigns, check public website emails where available and delivery-platform presence across major US and UK platforms.",
  },
];

const audiences = [
  ["Marketing agencies", "Build targeted lists by niche, city, source, and website status for focused client campaigns."],
  ["Web developers", "Find businesses with no website listed and pitch website, SEO, or digital services."],
  ["SEO agencies", "Identify local businesses by category and location before preparing audit or outreach workflows."],
  ["Freelancers", "Create focused prospect lists without copying business details across browser tabs."],
  ["Lead generation teams", "Turn repetitive business research into an organized, export-ready workflow."],
  ["Appointment setters", "Keep fresh prospects in one place before moving them into an outreach process."],
  ["Outbound sales teams", "Explore local businesses and startup signals before exporting clean outreach lists."],
];

const campaignCards = [
  {
    title: "Find businesses without websites.",
    copy: "Filter Google Maps results to find local businesses with no website listed, then pitch website, SEO, or digital services.",
  },
  {
    title: "Build outreach lists for any niche.",
    copy: "Search by business type and location, save qualified leads, and export them to CSV, Excel, or Google Sheets.",
  },
  {
    title: "Useful for restaurant and local-service campaigns.",
    copy: "Find restaurants and local businesses by city, category, website status, phone number, and source.",
  },
  {
    title: "Restaurant campaign enrichment.",
    copy: "Scrape restaurants from Google Maps, find public website emails where available, and check public delivery-platform presence across Uber Eats, DoorDash, Grubhub, Deliveroo, and Just Eat.",
  },
];

const pricing = [
  {
    name: "Free",
    price: "$0",
    note: "For trying the core workflow",
    features: ["25 leads per month", "Google Maps lead discovery", "Hacker News community leads", "Saved leads", "CSV export"],
    cta: "Start Free",
    href: "/login",
  },
  {
    name: "Starter",
    price: "$19",
    suffix: "/month",
    note: "For regular prospecting",
    features: ["500 leads per month", "Google Maps and supported lead sources", "CSV and Excel export", "Saved lead workspace"],
    cta: "Get Early Access",
    href: "/login",
  },
  {
    name: "Pro",
    price: "$49",
    suffix: "/month",
    note: "For active outbound teams",
    features: ["2,500 leads per month", "Google Sheets sync", "Optional email enrichment", "Advanced lead filters", "Priority support"],
    cta: "Get Early Access",
    href: "/login",
    featured: true,
  },
  {
    name: "Agency",
    price: "$99",
    suffix: "/month",
    note: "For higher-volume workflows",
    features: ["10,000 leads per month", "Higher-volume prospecting", "Google Sheets workflows", "Priority onboarding", "Agency-focused support"],
    cta: "Book a Demo",
    href: agencyLink,
  },
];

const faqs = [
  [
    "What is LeadHunter?",
    "LeadHunter helps agencies and outbound teams discover public business leads, organize promising prospects, and export them for outreach.",
  ],
  [
    "What information can it find?",
    "Depending on the source, LeadHunter can collect public business names, websites, phone numbers, addresses, categories, descriptions, source links, and community intent signals.",
  ],
  [
    "Does LeadHunter always find emails?",
    "No. Email enrichment searches public website pages when a website is available. Some businesses do not publish an email address, so results are not guaranteed.",
  ],
  [
    "How does Google Sheets sync work?",
    "Share your spreadsheet with the LeadHunter service account, enter the spreadsheet ID and tab name, then choose the saved leads you want to sync.",
  ],
  [
    "Why must I share my spreadsheet with the LeadHunter service account?",
    "Google Sheets only allows approved accounts to edit a spreadsheet. Editor access lets LeadHunter write the leads you explicitly choose into that sheet.",
  ],
  [
    "Where do I find my spreadsheet ID?",
    "It is the long value between /d/ and /edit in the Google Sheets URL.",
  ],
  [
    "Which sources currently work best?",
    "Google Maps and Hacker News are the most reliable early-access sources. Additional community and website sources depend on their provider availability.",
  ],
  [
    "Is outreach automated?",
    "No. LeadHunter helps users discover, organize, and export public lead data. Users remain responsible for their outreach and compliance.",
  ],
  ["Do I need a credit card for early access?", "No. A credit card is not required to create a free early-access account."],
  ["Can I book a demo?", "Yes. Use the Book Demo link to email the irsSMEX team and arrange a walkthrough."],
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7C5CFC,#5B3FE0)] text-white shadow-[0_10px_35px_rgba(124,92,252,0.28)]">
        <Zap className="h-5 w-5" />
      </span>
      <span className="text-lg font-bold tracking-[-0.02em] text-white">LeadHunter</span>
    </Link>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto mt-14 max-w-6xl">
      <div className="absolute -inset-8 -z-10 rounded-[40px] bg-violet-500/10 blur-3xl" />
      <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[#111522] shadow-[0_45px_120px_rgba(0,0,0,0.48)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-slate-400">
            Google Maps finder
          </span>
        </div>

        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[0.8fr_0.8fr_0.4fr_0.5fr_auto] lg:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Business type</span>
            <span className="mt-2 flex h-12 items-center rounded-xl border border-white/10 bg-[#090c14] px-4 text-sm text-white">
              Web design agencies
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Location</span>
            <span className="mt-2 flex h-12 items-center rounded-xl border border-white/10 bg-[#090c14] px-4 text-sm text-white">
              Austin, Texas
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Results</span>
            <span className="mt-2 flex h-12 items-center rounded-xl border border-white/10 bg-[#090c14] px-4 text-sm text-white">
              20
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Website filter</span>
            <span className="mt-2 flex h-12 items-center rounded-xl border border-white/10 bg-[#090c14] px-4 text-sm text-white">
              No website
            </span>
          </label>
          <span className="flex h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white">
            <Search className="h-4 w-4" />
            Search &amp; Scrape
          </span>
        </div>

        <div className="border-t border-white/10">
          <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <p className="text-sm font-semibold text-white">Lead results</p>
              <p className="mt-1 text-xs text-slate-500">Public business details saved to your workspace</p>
            </div>
            <div className="flex gap-2">
              <span className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Export CSV</span>
              <span className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Sync to Sheets</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead className="bg-black/15 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-7 py-3 font-medium">Company</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                  <th className="px-5 py-3 font-medium">Website</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-7 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {[
                  ["Northline Studio", "Austin, TX", "northlinestudio.com"],
                  ["Signal Creative", "Austin, TX", "signalcreative.co"],
                  ["Cedar Digital", "Round Rock, TX", "cedardigital.com"],
                ].map(([company, location, website]) => (
                  <tr key={company}>
                    <td className="px-7 py-4 font-medium text-white">{company}</td>
                    <td className="px-5 py-4 text-slate-400">{location}</td>
                    <td className="px-5 py-4 text-slate-400">{website}</td>
                    <td className="px-5 py-4">
                      <span className="whitespace-nowrap rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300">
                        Google Maps
                      </span>
                    </td>
                    <td className="px-7 py-4 text-right text-xs text-slate-500">Saved</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#080a12] text-white">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.07] bg-[#080a12]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Brand />
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary navigation">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-sm text-slate-400 transition hover:text-white">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            <a href={demoLink} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.05]">
              Book Demo
            </a>
            <Link href="/login" className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500">
              Get Early Access
            </Link>
          </div>
          <details className="group relative sm:hidden">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-white/10 text-slate-300">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </summary>
            <div className="absolute right-0 top-12 w-64 rounded-2xl border border-white/10 bg-[#121625] p-3 shadow-2xl">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className="block rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/[0.05]">
                  {link.label}
                </a>
              ))}
              <a href={demoLink} className="mt-2 block rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/[0.05]">
                Book Demo
              </a>
              <Link href="/login" className="mt-2 block rounded-xl bg-violet-600 px-3 py-2.5 text-center text-sm font-semibold">
                Get Early Access
              </Link>
            </div>
          </details>
        </div>
      </header>

      <section className="relative px-4 pb-24 pt-36 sm:px-6 sm:pt-44 lg:px-8">
        <div className="pointer-events-none absolute inset-0 -z-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,92,252,0.18),transparent_38%),radial-gradient(circle_at_15%_45%,rgba(33,211,163,0.06),transparent_25%)]" />
        <div className="relative mx-auto max-w-7xl">
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/[0.08] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-violet-200">
              <Sparkles className="h-3.5 w-3.5" />
              Lead discovery for agencies and outbound teams
            </span>
            <h1 className="mt-7 text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-[78px]">
              Build targeted lead lists in minutes, not hours.
            </h1>
            <p className="mx-auto mt-7 max-w-2xl text-pretty text-lg leading-8 text-slate-400 sm:text-xl">
              Search Google Maps and startup communities, save the best prospects, and export them to CSV, Excel, or Google Sheets.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/login" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 text-sm font-semibold transition hover:bg-violet-500">
                Get Early Access
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={demoLink} className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 px-6 text-sm font-semibold transition hover:bg-white/[0.05]">
                Book a Demo
              </a>
            </div>
            <p className="mt-4 text-sm text-slate-500">No credit card required during early access.</p>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section className="border-y border-white/[0.07] bg-white/[0.018] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-300">The manual-list problem</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Stop building lead lists by hand.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "Copying companies from Google Maps takes hours.",
              "Research gets scattered across tabs and spreadsheets.",
              "Teams repeat the same searches and manual cleanup.",
              "Export and organization become another task to manage.",
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-2xl border border-white/[0.07] bg-[#0d101a] p-5 text-sm leading-6 text-slate-300">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-400" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-300">How it works</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">From target market to outreach-ready list.</h2>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {[
              ["01", Search, "Search", "Choose a business type, location, directory, website, or community source."],
              ["02", ClipboardCheck, "Save", "LeadHunter collects public business details and saves them to your lead workspace."],
              ["03", Download, "Export", "Send your leads to CSV, Excel, or Google Sheets for outreach."],
            ].map(([step, Icon, title, copy]) => {
              const StepIcon = Icon as typeof Search;
              return (
                <article key={String(title)} className="relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#111522] p-7">
                  <span className="absolute right-5 top-3 text-6xl font-bold text-white/[0.035]">{String(step)}</span>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                    <StepIcon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-8 text-xl font-semibold">{String(title)}</h3>
                  <p className="mt-3 leading-7 text-slate-400">{String(copy)}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-24 border-y border-white/[0.07] bg-white/[0.018] px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-300">A focused lead workflow</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">The useful parts of prospecting, in one place.</h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, copy }) => (
              <article key={title} className="rounded-[22px] border border-white/[0.08] bg-[#0d101a] p-6 transition hover:border-violet-400/25">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-violet-300">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{copy}</p>
              </article>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-slate-500">
            Additional community sources are being expanded during early access.
          </p>
        </div>
      </section>

      <section className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-300">Practical use cases</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Built for teams that always need fresh prospects.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-400">
              Find restaurants, clinics, law firms, agencies, SaaS companies, or other target businesses by niche and location.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {audiences.map(([title, copy]) => (
              <article key={title} className="rounded-[20px] border border-white/[0.08] bg-[#111522] p-5">
                <Building2 className="h-5 w-5 text-violet-300" />
                <h3 className="mt-5 font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{copy}</p>
              </article>
            ))}
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {campaignCards.map((card) => (
              <article key={card.title} className="rounded-[22px] border border-white/[0.08] bg-[#0d101a] p-6">
                <h3 className="text-lg font-semibold">{card.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{card.copy}</p>
              </article>
            ))}
          </div>
          <p className="mt-8 max-w-3xl text-sm leading-7 text-slate-500">
            Delivery-platform presence is based on public search signals and confidence scoring. It is not official verification.
            Ratings and deeper delivery insights may be added later through compliant data sources or official integrations.
          </p>
        </div>
      </section>

      <section id="google-sheets" className="scroll-mt-24 border-y border-white/[0.07] bg-[#0d101a] px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-300">Google Sheets integration</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Move leads directly into Google Sheets.</h2>
            <p className="mt-6 text-lg leading-8 text-slate-400">
              Send recent or saved leads into your spreadsheet so your team can begin outreach without copying and pasting rows manually.
            </p>
            <div className="mt-8 space-y-4">
              {["Choose a spreadsheet", "Choose a sheet tab", "Sync selected or recent leads", "Replace a tab with all saved leads when needed"].map(
                (item) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-slate-300">
                    <Check className="h-4 w-4 text-emerald-400" />
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="rounded-[26px] border border-white/[0.08] bg-[#141927] p-5 shadow-2xl sm:p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">Connect your spreadsheet</p>
                <p className="mt-1 text-xs text-slate-500">Four clear steps, no Google OAuth required</p>
              </div>
            </div>
            <ol className="mt-7 grid gap-3">
              {[
                "Open the Google Sheet you want to use.",
                `Share it with ${serviceAccountEmail} as an Editor.`,
                "Copy the spreadsheet ID from its URL.",
                "Paste the ID in LeadHunter and choose a tab.",
              ].map((item, index) => (
                <li key={item} className="flex gap-3 rounded-xl border border-white/[0.07] bg-black/15 p-4 text-sm leading-6 text-slate-300">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-xs font-semibold text-violet-300">
                    {index + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-xl border border-white/[0.08] bg-[#090c14] p-4 font-mono text-xs text-slate-500">
              https://docs.google.com/spreadsheets/d/
              <span className="rounded bg-violet-500/15 px-1.5 py-1 text-violet-200">SPREADSHEET_ID</span>
              /edit
            </div>
            <details className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-white">
                Why is sharing required?
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Google Sheets only allows approved accounts to edit a spreadsheet. Sharing the spreadsheet with the LeadHunter service account gives LeadHunter permission to write your selected leads into that sheet.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                The spreadsheet ID is the long value between <code>/d/</code> and <code>/edit</code>. It tells LeadHunter which spreadsheet to update.
              </p>
            </details>
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-24 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-300">Early Access Pricing</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Simple early-access pricing</h2>
            <p className="mt-5 text-lg text-slate-400">Start free, then choose a plan that matches your monthly prospecting volume.</p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {pricing.map((plan) => (
              <article
                key={plan.name}
                className={`relative flex rounded-[24px] border p-6 ${
                  plan.featured
                    ? "border-violet-400/50 bg-violet-500/[0.08] shadow-[0_24px_80px_rgba(124,92,252,0.14)]"
                    : "border-white/[0.08] bg-[#111522]"
                }`}
              >
                <div className="flex w-full flex-col">
                  {plan.featured ? (
                    <span className="absolute right-5 top-5 rounded-full bg-violet-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em]">
                      Most flexible
                    </span>
                  ) : null}
                  <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">{plan.name}</p>
                  <div className="mt-5 flex items-end gap-1">
                    <span className="text-4xl font-semibold tracking-[-0.04em]">{plan.price}</span>
                    {plan.suffix ? <span className="pb-1 text-sm text-slate-500">{plan.suffix}</span> : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{plan.note}</p>
                  <ul className="mt-7 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5 text-sm leading-6 text-slate-300">
                        <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {plan.href.startsWith("mailto:") ? (
                    <a href={plan.href} className="mt-8 inline-flex h-11 items-center justify-center rounded-xl border border-white/10 text-sm font-semibold transition hover:bg-white/[0.05]">
                      {plan.cta}
                    </a>
                  ) : (
                    <Link
                      href={plan.href}
                      className={`mt-8 inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition ${
                        plan.featured ? "bg-violet-600 hover:bg-violet-500" : "border border-white/10 hover:bg-white/[0.05]"
                      }`}
                    >
                      {plan.cta}
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
          <p className="mx-auto mt-7 max-w-2xl text-center text-sm leading-6 text-slate-500">
            Paid subscriptions will be activated during early access. Self-serve Paddle checkout is coming next.
          </p>
        </div>
      </section>

      <section id="faq" className="scroll-mt-24 border-y border-white/[0.07] bg-white/[0.018] px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.65fr_1.35fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-300">FAQ</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Questions before you start?</h2>
            <p className="mt-5 leading-7 text-slate-400">
              LeadHunter is in early access. These answers describe the product as it works today.
            </p>
          </div>
          <div className="space-y-3">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group rounded-2xl border border-white/[0.08] bg-[#0d101a] p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {question}
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
                </summary>
                <p className="mt-4 pr-8 text-sm leading-7 text-slate-400">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[30px] border border-violet-400/20 bg-[radial-gradient(circle_at_20%_20%,rgba(124,92,252,0.24),transparent_45%),#121625] px-6 py-14 text-center sm:px-12">
          <ShieldCheck className="mx-auto h-8 w-8 text-violet-300" />
          <h2 className="mt-6 text-4xl font-semibold tracking-[-0.04em]">Turn your next market into an organized lead list.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-400">
            Start with Google Maps, save the prospects worth reviewing, and export them when your team is ready.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/login" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 text-sm font-semibold hover:bg-violet-500">
              Get Early Access
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a href={demoLink} className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 px-6 text-sm font-semibold hover:bg-white/[0.05]">
              Book Demo
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.08] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Brand />
            <p className="mt-3 text-sm text-slate-500">LeadHunter by irsSMEX</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400">
            <a href="https://irssmex.com" target="_blank" rel="noreferrer" className="hover:text-white">irsSMEX</a>
            <a href={`mailto:${supportEmail}`} className="hover:text-white">Contact</a>
            <Link href="/login" className="hover:text-white">Get Early Access</Link>
            <a href={demoLink} className="hover:text-white">Book Demo</a>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
