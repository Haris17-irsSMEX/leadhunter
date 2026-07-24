import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  Globe2,
  Layers3,
  Mail,
  MapPin,
  Phone,
  Search,
  Sheet,
  ShieldCheck,
  TableProperties,
  Target,
  Utensils,
} from "lucide-react";
import PublicFooter from "@/components/public/PublicFooter";
import PublicHeader from "@/components/public/PublicHeader";
import { PLAN_NAMES, PLANS, type PlanName } from "@/lib/plans";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "irssmex@gmail.com";
const signupHref = "/login?mode=signup";
const demoHref = `mailto:${supportEmail}?subject=LeadHunter%20Demo%20Request`;

export const metadata: Metadata = {
  title: {
    absolute: "LeadHunter - Build Targeted Local Lead Lists",
  },
  description:
    "Find local businesses by niche and city, collect useful public contact information, avoid duplicates, and export clean lead lists to Google Sheets, CSV, or Excel.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "LeadHunter - Build Targeted Local Lead Lists",
    description:
      "Find local businesses by niche and city, collect useful public contact information, avoid duplicates, and export clean lead lists.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "LeadHunter - Build Targeted Local Lead Lists",
    description: "Turn public business information into organized, export-ready lead lists.",
  },
};

const audiences = [
  "Marketing agencies",
  "Lead-generation agencies",
  "Freelancers",
  "Web developers",
  "SEO teams",
  "Appointment setters",
  "Outbound sales teams",
];

const manualTasks = [
  "Searching Google Maps repeatedly",
  "Opening business websites one by one",
  "Copying phone numbers and locations",
  "Looking for public emails or contact pages",
  "Cleaning inconsistent spreadsheets",
  "Removing businesses already saved",
];

const workflow = [
  {
    icon: Target,
    number: "01",
    title: "Choose a niche and city",
    copy: "Define the local market you want to research, such as dentists in Los Angeles.",
  },
  {
    icon: ClipboardCheck,
    number: "02",
    title: "Collect useful business information",
    copy: "Save business names, websites, phones, locations, and public contact information when available.",
  },
  {
    icon: Filter,
    number: "03",
    title: "Filter and organize",
    copy: "Use source, website, contactability, and relevant restaurant-platform filters while avoiding duplicate leads.",
  },
  {
    icon: Download,
    number: "04",
    title: "Export and start outreach",
    copy: "Move the list into Google Sheets, CSV, or Excel for the outreach process your team already uses.",
  },
];

const nicheExamples = [
  ["Dentists", "Los Angeles"],
  ["Roofers", "Boston"],
  ["Restaurants", "London"],
  ["Gyms", "New York"],
  ["Salons", "Manchester"],
  ["Marketing agencies", "Miami"],
];

const leadFields = [
  ["Business name", Building2],
  ["Website", Globe2],
  ["Phone number", Phone],
  ["Location", MapPin],
  ["Industry or category", Layers3],
  ["Public email when available", Mail],
  ["Public contact page", ExternalLink],
  ["Website status and source", Filter],
  ["Scrape date", ClipboardCheck],
];

const agencyUseCases = [
  ["Local-business prospecting", "Research businesses by service category and location before building a focused campaign."],
  ["Website development outreach", "Find listings without a website attached and prioritize prospects for web-design conversations."],
  ["SEO campaigns", "Create niche and city lists for local SEO audits, reviews, and service outreach."],
  ["Marketing-service outreach", "Organize relevant businesses before offering paid media, content, or growth services."],
  ["Lead-generation campaigns", "Build clean client-ready lists with source details and duplicate prevention."],
  ["Appointment-setting campaigns", "Give setters structured contact options including email, contact page, phone, and website."],
];

const planFeatures: Record<PlanName, string[]> = {
  free: ["Google Maps lead discovery", "Hacker News community leads", "Saved lead workspace", "CSV export"],
  starter: ["Supported lead sources", "CSV and Excel export", "Website-status filters", "Saved lead workspace"],
  pro: ["Google Sheets sync", "Public email discovery", "Advanced lead filters", "Priority support"],
  agency: ["Higher-volume prospecting", "Google Sheets workflows", "Restaurant campaign filters", "Priority onboarding"],
};

const faqItems = [
  [
    "What is LeadHunter?",
    "LeadHunter is a workspace for finding public local-business information, organizing relevant prospects, avoiding duplicate saved leads, and exporting clean lists for outreach.",
  ],
  [
    "What information can it find?",
    "Available fields can include business name, website, phone, location, category, source, public email, and public contact page. The exact information depends on the public source.",
  ],
  [
    "Does every lead include an email?",
    "No. LeadHunter finds public emails and contact pages when available. Some businesses do not publish an email address.",
  ],
  [
    "Can I find businesses without websites?",
    "Yes. The No website filter finds businesses whose Google Maps listing does not include a website. It does not prove the business has no online presence elsewhere.",
  ],
  [
    "How does restaurant delivery-platform checking work?",
    "For selected restaurant campaigns, LeadHunter checks public search results for delivery-platform presence and stores public listing URLs when found. These signals may require verification.",
  ],
  [
    "Does LeadHunter avoid duplicates?",
    "LeadHunter uses stable business or source identifiers where available and avoids repeatedly saving the same lead into one user's workspace.",
  ],
  [
    "Can I export to Google Sheets?",
    "Yes. You can sync matching saved leads to a Google Sheet, or export customer-friendly CSV and Excel files.",
  ],
  [
    "Which cities and countries can I search?",
    "You can search local niches across many cities and countries supported by the underlying public data provider. Result quantity and field availability vary by location.",
  ],
  [
    "Is LinkedIn scraping included?",
    "No. LinkedIn scraping is not currently included.",
  ],
  [
    "Is LeadHunter affiliated with Google Maps or delivery platforms?",
    "No. LeadHunter is not affiliated with or endorsed by Google Maps, Uber Eats, DoorDash, Grubhub, Deliveroo, Just Eat, or other third-party platforms.",
  ],
];

function envEnabled(name: string, fallback: boolean) {
  const value = process.env[name];
  return value === undefined ? fallback : value.trim().toLowerCase() === "true";
}

function getEnabledCommunitySources() {
  if (!envEnabled("COMMUNITIES_ENABLED", false)) {
    return [];
  }

  return [
    envEnabled("HACKERNEWS_ENABLED", true) ? "Hacker News" : null,
    envEnabled("REDDIT_ENABLED", true) ? "Reddit prototype" : null,
    envEnabled("INDIEHACKERS_ENABLED", false) ? "Indie Hackers" : null,
    envEnabled("PRODUCTHUNT_ENABLED", false) ? "Product Hunt" : null,
  ].filter((source): source is string => Boolean(source));
}

function SectionHeading({
  eyebrow,
  title,
  copy,
  centered = false,
}: {
  eyebrow: string;
  title: string;
  copy?: string;
  centered?: boolean;
}) {
  return (
    <div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="text-sm font-bold text-[var(--primary)]">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {copy ? <p className="mt-5 text-base leading-7 text-[var(--text-secondary)] sm:text-lg">{copy}</p> : null}
    </div>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[650px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[40px] bg-[radial-gradient(circle,rgba(20,99,255,0.18),transparent_68%)] blur-2xl"
      />
      <div className="overflow-hidden rounded-[24px] border border-blue-100 bg-white shadow-[0_24px_70px_rgba(20,99,255,0.14)]">
        <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-4">
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">Google Maps Finder</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Illustrative product preview</p>
          </div>
          <span className="app-badge badge-info">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Local search
          </span>
        </div>

        <div className="grid gap-3 bg-[var(--surface-secondary)] p-4 sm:grid-cols-2 sm:p-5">
          <div className="rounded-xl border border-[var(--border-default)] bg-white p-3">
            <p className="text-[11px] font-bold text-[var(--text-muted)]">BUSINESS TYPE</p>
            <p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">Dentists</p>
          </div>
          <div className="rounded-xl border border-[var(--border-default)] bg-white p-3">
            <p className="text-[11px] font-bold text-[var(--text-muted)]">LOCATION</p>
            <p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">Los Angeles, CA</p>
          </div>
          <div className="rounded-xl border border-[var(--border-default)] bg-white p-3">
            <p className="text-[11px] font-bold text-[var(--text-muted)]">WEBSITE FILTER</p>
            <p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">All businesses</p>
          </div>
          <div className="flex min-h-[62px] items-center justify-center rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(20,99,255,0.20)]">
            <Search className="mr-2 h-4 w-4" aria-hidden="true" />
            Search and save leads
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">Saved business information</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Public fields appear when available.</p>
            </div>
            <span className="badge-hot">Duplicate-safe workspace</span>
          </div>

          <div className="mt-4 grid gap-3">
            {[
              { name: "Example dental practice", contact: "Website and phone available", email: "Public email found" },
              { name: "Example local clinic", contact: "Phone and contact page available", email: "Contact form available" },
            ].map((lead) => (
              <div
                key={lead.name}
                className="grid gap-3 rounded-2xl border border-[var(--border-default)] p-4 sm:grid-cols-[1.15fr_1fr_auto] sm:items-center"
              >
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{lead.name}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Google Maps source</p>
                </div>
                <p className="text-xs font-medium text-[var(--text-secondary)]">{lead.contact}</p>
                <span className="badge-hot justify-self-start">{lead.email}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border-default)] pt-4">
            <span className="btn-secondary min-h-9 px-3 py-1.5 text-xs">Export to CSV</span>
            <span className="btn-secondary min-h-9 px-3 py-1.5 text-xs">Export to Excel</span>
            <span className="btn-primary min-h-9 px-3 py-1.5 text-xs">
              <Sheet className="h-3.5 w-3.5" aria-hidden="true" />
              Sync to Google Sheets
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const enabledCommunitySources = getEnabledCommunitySources();

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--page-background)] text-[var(--text-primary)]">
      <PublicHeader signupHref={signupHref} />

      <main>
        <section className="relative overflow-hidden border-b border-[var(--border-default)] bg-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_5%,rgba(20,99,255,0.13),transparent_32%),radial-gradient(circle_at_8%_68%,rgba(14,165,233,0.06),transparent_30%)]"
          />
          <div className="relative mx-auto grid max-w-[1440px] gap-14 px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8 lg:py-28">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-[var(--primary-soft)] px-3.5 py-2 text-xs font-bold text-[var(--primary)]">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Local-business lead research for practical outreach
              </span>
              <h1 className="mt-6 text-[42px] font-extrabold leading-[1.02] tracking-[-0.055em] text-[var(--text-primary)] sm:text-6xl lg:text-[68px]">
                Build targeted local lead lists in minutes.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--text-secondary)]">
                Find businesses in almost any niche and city, collect useful contact information, avoid duplicate
                leads, and export clean lists for outreach.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={signupHref} className="btn-primary h-12 px-6">
                  Start free
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="#how-it-works" className="btn-secondary h-12 px-6">
                  See how it works
                </Link>
              </div>
              <p className="mt-4 text-sm font-medium text-[var(--text-muted)]">
                No credit card required | Free plan includes {PLANS.free.monthlyLeadLimit.toLocaleString()} leads per
                month
              </p>
            </div>

            <ProductPreview />
          </div>
        </section>

        <section aria-labelledby="audience-heading" className="border-b border-[var(--border-default)] bg-white">
          <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8">
            <h2 id="audience-heading" className="text-center text-sm font-bold text-[var(--text-secondary)]">
              Built for teams that turn focused research into outreach
            </h2>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              {audiences.map((audience) => (
                <span
                  key={audience}
                  className="rounded-full border border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 py-2 text-sm font-semibold text-[var(--navy-secondary)]"
                >
                  {audience}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="product" className="scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto grid max-w-[1280px] gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <SectionHeading
              eyebrow="One focused workspace"
              title="Stop building lead lists manually."
              copy="LeadHunter brings the repetitive parts of local-business research into one organized workflow."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {manualTasks.map((task) => (
                <div key={task} className="app-card flex min-h-[96px] items-start gap-3 p-4 shadow-[var(--shadow-small)]">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                    <span aria-hidden="true">-</span>
                  </span>
                  <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">{task}</p>
                </div>
              ))}
              <div className="app-alert app-alert-info sm:col-span-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                <p className="font-semibold">LeadHunter brings that workflow into one focused workspace.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 border-y border-[var(--border-default)] bg-white px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-[1280px]">
            <SectionHeading
              centered
              eyebrow="Simple workflow"
              title="From search to outreach in four steps."
              copy="Keep research, filtering, and exports in one practical sequence."
            />
            <div className="relative mt-12 grid gap-4 lg:grid-cols-4">
              <div aria-hidden="true" className="absolute left-[12%] right-[12%] top-9 hidden h-px bg-blue-200 lg:block" />
              {workflow.map(({ icon: Icon, number, title, copy }) => (
                <article key={number} className="relative rounded-[20px] border border-[var(--border-default)] bg-white p-6 shadow-[var(--shadow-card)]">
                  <div className="flex items-center justify-between">
                    <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)] text-white shadow-[0_8px_20px_rgba(20,99,255,0.18)]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-extrabold text-blue-300">{number}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-[var(--text-primary)]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-[1280px]">
            <SectionHeading
              eyebrow="Flexible local research"
              title="Search almost any local niche in any city."
              copy="Choose the market that matches your campaign. Result quantity and field availability depend on public source information."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {nicheExamples.map(([niche, city]) => (
                <article key={`${niche}-${city}`} className="app-card group flex items-center gap-4 transition hover:-translate-y-0.5 hover:border-blue-200">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
                    <MapPin className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-bold text-[var(--text-primary)]">{niche}</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{city}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--border-default)] bg-white px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto grid max-w-[1280px] gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <SectionHeading
              eyebrow="Customer-facing lead data"
              title="Useful lead data for practical outreach."
              copy="Review the fields that are available, choose the best contact method, and keep the original source close at hand."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {leadFields.map(([label, Icon]) => {
                const FieldIcon = Icon as typeof Building2;
                return (
                  <div key={String(label)} className="flex items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--primary)] shadow-[var(--shadow-small)]">
                      <FieldIcon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-semibold text-[var(--navy-secondary)]">{String(label)}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-[var(--text-muted)] lg:col-start-2">
              Public contact information is not available for every business.
            </p>
          </div>
        </section>

        <section id="website-opportunity" className="scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto grid max-w-[1280px] overflow-hidden rounded-[24px] border border-blue-100 bg-white shadow-[var(--shadow-card)] lg:grid-cols-2">
            <div className="p-7 sm:p-10 lg:p-14">
              <SectionHeading
                eyebrow="For web developers and agencies"
                title="Find businesses that may need a website."
                copy="Find businesses whose Google Maps listing does not include a website, then build a focused prospect list for web, SEO, or digital-service outreach."
              />
              <ul className="mt-8 space-y-4">
                {[
                  "Search a niche and city",
                  "Select the No website filter",
                  "Save businesses that fit the campaign",
                  "Use available phone or contact information",
                  "Avoid businesses already saved in your workspace",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-6 text-[var(--text-secondary)]">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center bg-[var(--surface-secondary)] p-6 sm:p-10">
              <div className="w-full rounded-[20px] border border-blue-100 bg-white p-5 shadow-[var(--shadow-card)]">
                <p className="text-xs font-bold text-[var(--text-muted)]">WEBSITE FILTER</p>
                <div className="mt-4 grid gap-2">
                  {["All businesses", "Has website", "No website"].map((filter) => (
                    <div
                      key={filter}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold ${
                        filter === "No website"
                          ? "border-blue-300 bg-[var(--primary-soft)] text-[var(--primary)]"
                          : "border-[var(--border-default)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {filter}
                      {filter === "No website" ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : null}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
                  A missing Google Maps website does not prove the business has no online presence elsewhere.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="use-cases" className="scroll-mt-24 border-y border-[var(--border-default)] bg-white px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-[1280px]">
            <SectionHeading
              centered
              eyebrow="Agency use cases"
              title="Built for the outreach services agencies already sell."
              copy="Create focused prospect lists around real campaign goals instead of starting from an unstructured spreadsheet."
            />
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {agencyUseCases.map(([title, copy], index) => (
                <article key={title} className="app-card">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                    {index % 2 === 0 ? <BriefcaseBusiness className="h-5 w-5" /> : <Target className="h-5 w-5" />}
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-[var(--text-primary)]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="restaurant-intelligence" className="scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-[1280px] overflow-hidden rounded-[26px] border border-blue-200 bg-[linear-gradient(135deg,#EFF6FF_0%,#FFFFFF_56%,#ECFDF3_130%)] p-7 shadow-[var(--shadow-card)] sm:p-10 lg:p-14">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)] text-white shadow-[0_8px_20px_rgba(20,99,255,0.18)]">
                  <Utensils className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="mt-6 text-3xl font-extrabold tracking-[-0.04em] text-[var(--text-primary)] sm:text-4xl">
                  Restaurant outreach with public delivery-platform signals.
                </h2>
                <p className="mt-5 text-base leading-7 text-[var(--text-secondary)]">
                  Restaurant campaigns can find public website emails when available, check public delivery-platform
                  presence, store public listing URLs, and filter matching leads before export.
                </p>
                <div className="app-alert app-alert-warning mt-6">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <p>Platform presence is based on publicly available search results and may require verification.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[20px] border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-small)]">
                  <p className="text-xs font-bold text-[var(--text-muted)]">USA-FOCUSED PLATFORMS</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {["Uber Eats", "DoorDash", "Grubhub"].map((platform) => (
                      <span key={platform} className="badge-hot">{platform}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-small)]">
                  <p className="text-xs font-bold text-[var(--text-muted)]">UK-FOCUSED PLATFORMS</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {["Uber Eats", "Deliveroo", "Just Eat"].map((platform) => (
                      <span key={platform} className="badge-hot">{platform}</span>
                    ))}
                  </div>
                </div>
                {[
                  "Search restaurant businesses",
                  "Find public website emails when available",
                  "Check selected public platform presence",
                  "Store public listing or menu URLs",
                  "Filter and export matching leads",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl border border-[var(--border-default)] bg-white p-4 sm:col-span-2">
                    <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success)]" aria-hidden="true" />
                    <p className="text-sm font-semibold text-[var(--navy-secondary)]">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--border-default)] bg-white px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1100px] flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-bold text-[var(--primary)]">Community intent leads</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-[var(--text-primary)]">
                Discover opportunities beyond local directories.
              </h2>
              <p className="mt-4 leading-7 text-[var(--text-secondary)]">
                Explore supported startup communities for public posts that may show buying intent. Community
                availability depends on the source and provider configuration.
              </p>
            </div>
            <div className="flex max-w-md flex-wrap gap-2">
              {enabledCommunitySources.length ? (
                enabledCommunitySources.map((source) => (
                  <span key={source} className="app-badge badge-info">{source}</span>
                ))
              ) : (
                <span className="badge-cold">Community sources are configuration-dependent</span>
              )}
            </div>
          </div>
        </section>

        <section id="exports" className="scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto grid max-w-[1280px] gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <SectionHeading
              eyebrow="Move clean data forward"
              title="Export clean lists and move faster."
              copy="Export matching saved leads without exposing internal IDs or development fields."
            />
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["Google Sheets", FileSpreadsheet, "Sync selected or filtered leads to the spreadsheet and tab you choose."],
                ["CSV", TableProperties, "Download a UTF-8 customer-facing lead list for flexible workflows."],
                ["Excel", Download, "Export a formatted workbook with clean columns and readable widths."],
              ].map(([title, Icon, copy]) => {
                const ExportIcon = Icon as typeof FileSpreadsheet;
                return (
                  <article key={String(title)} className="app-card">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
                      <ExportIcon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-lg font-bold text-[var(--text-primary)]">{String(title)}</h3>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{String(copy)}</p>
                  </article>
                );
              })}
            </div>
            <div className="grid gap-3 text-sm text-[var(--text-secondary)] sm:grid-cols-2 lg:col-start-2">
              {[
                "Website-status filters",
                "Public-email filters",
                "Contactability filters",
                "Delivery-platform filters for restaurant campaigns",
                "Duplicate-safe saved workspace",
                "Customer-facing columns",
              ].map((item) => (
                <p key={item} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden="true" />
                  {item}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 border-y border-[var(--border-default)] bg-white px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-[1280px]">
            <SectionHeading
              centered
              eyebrow="Early-access plans"
              title="Choose the allowance that fits your workflow."
              copy="Self-serve billing is not connected yet. Start free or contact us about early-access plan changes."
            />
            <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {PLAN_NAMES.map((planName) => {
                const plan = PLANS[planName];
                const featured = planName === "pro";
                const free = planName === "free";
                const contactHref = `mailto:${supportEmail}?subject=LeadHunter%20${encodeURIComponent(plan.label)}%20Plan`;

                return (
                  <article
                    key={planName}
                    className={`relative flex flex-col rounded-[22px] border bg-white p-6 ${
                      featured
                        ? "border-blue-300 shadow-[0_18px_45px_rgba(20,99,255,0.12)]"
                        : "border-[var(--border-default)] shadow-[var(--shadow-small)]"
                    }`}
                  >
                    {featured ? (
                      <span className="absolute right-5 top-5 rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-bold text-[var(--primary)]">
                        For active teams
                      </span>
                    ) : null}
                    <h3 className="text-lg font-bold text-[var(--text-primary)]">{plan.label}</h3>
                    <p className="mt-5 text-4xl font-extrabold tracking-[-0.04em] text-[var(--text-primary)]">
                      ${plan.price}
                      {plan.price > 0 ? <span className="text-sm font-medium text-[var(--text-muted)]"> / month</span> : null}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[var(--primary)]">
                      {plan.monthlyLeadLimit.toLocaleString()} leads per month
                    </p>
                    <ul className="mt-6 flex-1 space-y-3">
                      {planFeatures[planName].map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5 text-sm leading-6 text-[var(--text-secondary)]">
                          <Check className="mt-1 h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden="true" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    {free ? (
                      <Link href={signupHref} className="btn-primary mt-7 w-full">
                        Start free
                      </Link>
                    ) : (
                      <a
                        href={contactHref}
                        className={`${featured ? "btn-primary" : "btn-secondary"} mt-7 w-full`}
                      >
                        Contact us
                      </a>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-[900px]">
            <SectionHeading
              centered
              eyebrow="Frequently asked questions"
              title="Straight answers about how LeadHunter works."
            />
            <div className="mt-10 space-y-3">
              {faqItems.map(([question, answer]) => (
                <details key={question} className="group rounded-[18px] border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-small)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-base font-bold text-[var(--text-primary)]">
                    {question}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)] transition group-open:rotate-45">
                      <span aria-hidden="true">+</span>
                    </span>
                  </summary>
                  <p className="mt-4 pr-10 text-sm leading-7 text-[var(--text-secondary)]">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
          <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[28px] bg-[var(--navy)] px-6 py-14 text-center shadow-[var(--shadow-elevated)] sm:px-10 sm:py-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(20,99,255,0.55),transparent_34%),radial-gradient(circle_at_88%_90%,rgba(22,163,74,0.20),transparent_30%)]"
            />
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-3xl font-extrabold tracking-[-0.04em] text-white sm:text-5xl">
                Build your next lead list without the manual research.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-blue-100">
                Choose a niche, choose a city, and turn public business information into an organized outreach list.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href={signupHref} className="btn-primary h-12 px-6">
                  Start free
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <a
                  href={demoHref}
                  className="inline-flex h-12 items-center justify-center rounded-[13px] border border-white/25 bg-white/10 px-6 text-sm font-bold text-white transition hover:bg-white/15"
                >
                  Book a demo
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter supportEmail={supportEmail} />
    </div>
  );
}
