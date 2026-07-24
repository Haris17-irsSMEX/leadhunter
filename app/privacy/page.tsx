import type { Metadata } from "next";
import LegalPageLayout, { type LegalSection } from "@/components/public/LegalPageLayout";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "irssmex@gmail.com";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How LeadHunter handles account information, public business data, integrations, and operational data.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "LeadHunter Privacy Policy",
    description: "How LeadHunter handles account information, public business data, integrations, and operational data.",
    url: "/privacy",
  },
  twitter: {
    card: "summary",
    title: "LeadHunter Privacy Policy",
    description: "How LeadHunter handles account information, public business data, integrations, and operational data.",
  },
};

const sections: LegalSection[] = [
  {
    id: "overview",
    title: "Overview",
    content: (
      <>
        <p>
          This Privacy Policy explains how LeadHunter processes information when users create an account, request lead
          research, save lead records, enrich public contact information, and use export or integration features.
        </p>
        <p>
          LeadHunter is designed to organize publicly available business information. This policy is a product
          disclosure and is not legal advice.
        </p>
      </>
    ),
  },
  {
    id: "information-you-provide",
    title: "Information you provide",
    content: (
      <>
        <p>We process information users provide directly, including:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Account email address and authentication credentials submitted through the sign-in or signup flow.</li>
          <li>Search terms, locations, URLs, filters, and source choices submitted to run lead research.</li>
          <li>Spreadsheet IDs, tab names, export selections, and other integration inputs.</li>
          <li>Support requests, plan inquiries, and other communications sent to us.</li>
        </ul>
      </>
    ),
  },
  {
    id: "accounts-authentication",
    title: "Accounts and Supabase authentication",
    content: (
      <>
        <p>
          LeadHunter uses Supabase for account authentication and session management. Authentication tokens are stored
          in secure, HTTP-only cookies according to the application's session configuration.
        </p>
        <p>
          LeadHunter does not sell user login credentials. Users are responsible for keeping their account credentials
          secure and for notifying support if they believe an account has been compromised.
        </p>
      </>
    ),
  },
  {
    id: "public-business-data",
    title: "Public business lead data",
    content: (
      <>
        <p>
          At a user's request, LeadHunter may collect and organize publicly available business information such as
          business names, websites, phone numbers, addresses, categories, source URLs, and public contact information.
        </p>
        <p>
          Public source data can be incomplete, outdated, or unavailable. LeadHunter does not guarantee that every
          field will be present or current.
        </p>
      </>
    ),
  },
  {
    id: "google-maps",
    title: "Google Maps and Google Places usage",
    content: (
      <p>
        LeadHunter uses configured Google Places or related Google services to process local-business searches.
        Information returned by those services is handled according to the product workflow and the applicable Google
        terms. LeadHunter does not automate or bypass the private Google Maps user interface.
      </p>
    ),
  },
  {
    id: "public-contact-discovery",
    title: "Public website contact discovery",
    content: (
      <>
        <p>
          When a business website is available, public email discovery may inspect a limited set of public website
          pages, such as the homepage, contact page, about page, team page, or locations page.
        </p>
        <p>
          LeadHunter may store a public email address, the page where it was found, a confidence score, or a detected
          public contact-page URL. It does not log into private pages, bypass access controls, or guarantee that an email
          will be found.
        </p>
      </>
    ),
  },
  {
    id: "restaurant-signals",
    title: "Restaurant delivery-platform presence",
    content: (
      <>
        <p>
          For restaurant campaigns, LeadHunter may infer public delivery-platform presence from public search-result
          titles, snippets, and URLs. It may store a matching public listing URL and confidence status.
        </p>
        <p>
          LeadHunter does not claim access to private restaurant-platform dashboards and does not claim official
          partnership or verification. Platform presence may require manual verification.
        </p>
      </>
    ),
  },
  {
    id: "community-sources",
    title: "Community-source data",
    content: (
      <p>
        When community features are enabled, LeadHunter may process public posts or listings from supported startup
        communities. Availability depends on source configuration and provider access. Private posts and account-only
        data are outside the intended workflow.
      </p>
    ),
  },
  {
    id: "sheets-exports",
    title: "Google Sheets, CSV, and Excel",
    content: (
      <>
        <p>
          LeadHunter exports only the saved lead records and filters selected by the authenticated user. Internal
          identifiers and raw metadata are excluded from customer-facing export formats.
        </p>
        <p>
          For Google Sheets, users provide a spreadsheet ID and tab name and grant the configured service account
          permission to edit the destination spreadsheet. Users can remove that permission through Google Sheets.
        </p>
      </>
    ),
  },
  {
    id: "usage-logs",
    title: "Usage and operational logs",
    content: (
      <p>
        LeadHunter processes usage counts, scrape-job status, source types, timestamps, error information, and other
        operational records needed to enforce plan allowances, prevent abuse, diagnose failures, and operate the
        service.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and session storage",
    content: (
      <p>
        LeadHunter uses authentication cookies to maintain secure sessions and may use limited browser storage for
        product preferences. Disabling required session cookies may prevent access to authenticated features.
      </p>
    ),
  },
  {
    id: "service-providers",
    title: "Service providers",
    content: (
      <p>
        LeadHunter relies on providers such as Supabase, Google Places, Google Sheets, hosting infrastructure, Upstash
        when configured, ScrapeGraphAI for enabled extraction sources, and configured search providers for delivery
        presence checks. Their processing is subject to their own terms and privacy practices.
      </p>
    ),
  },
  {
    id: "retention",
    title: "Data retention",
    content: (
      <p>
        Account, lead, job, usage, and integration records are retained for as long as reasonably necessary to provide
        the service, maintain security, resolve disputes, and meet legal obligations. Retention periods may vary by
        record type and operational need.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    content: (
      <p>
        LeadHunter uses reasonable technical and organizational safeguards, including authenticated access, user-level
        data isolation, protected server credentials, and secure session cookies. No online service can guarantee
        absolute security, and LeadHunter does not claim certifications that have not been obtained.
      </p>
    ),
  },
  {
    id: "choices",
    title: "User choices and privacy requests",
    content: (
      <p>
        Users can choose which searches to run, which records to save or delete, which leads to export, and which
        spreadsheets receive synced data. For account-data or privacy requests, contact{" "}
        <a href={`mailto:${supportEmail}`} className="font-semibold text-[var(--primary)] hover:underline">
          {supportEmail}
        </a>
        .
      </p>
    ),
  },
  {
    id: "international-users",
    title: "International users",
    content: (
      <p>
        LeadHunter may be accessed from multiple countries, and service providers may process information in different
        jurisdictions. Users remain responsible for ensuring that their use of business information and outreach
        complies with laws that apply to them.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children's privacy",
    content: (
      <p>
        LeadHunter is a business research service and is not directed to children. Users must be old enough to enter
        into a binding agreement in their jurisdiction.
      </p>
    ),
  },
  {
    id: "changes-contact",
    title: "Policy changes and contact",
    content: (
      <>
        <p>
          We may update this policy as LeadHunter's features, providers, or legal requirements change. The updated date
          at the top of this page identifies the latest published version.
        </p>
        <p>
          Questions or requests can be sent to{" "}
          <a href={`mailto:${supportEmail}`} className="font-semibold text-[var(--primary)] hover:underline">
            {supportEmail}
          </a>
          .
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      eyebrow="Legal"
      title="Privacy Policy"
      summary="How LeadHunter handles account information, public business data, integrations, and operational records."
      updatedAt="July 24, 2026"
      sections={sections}
      supportEmail={supportEmail}
    />
  );
}
