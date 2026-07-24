import type { Metadata } from "next";
import LegalPageLayout, { type LegalSection } from "@/components/public/LegalPageLayout";

const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "irssmex@gmail.com";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms governing access to and use of LeadHunter.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "LeadHunter Terms of Service",
    description: "Terms governing access to and use of LeadHunter.",
    url: "/terms",
  },
  twitter: {
    card: "summary",
    title: "LeadHunter Terms of Service",
    description: "Terms governing access to and use of LeadHunter.",
  },
};

const sections: LegalSection[] = [
  {
    id: "acceptance",
    title: "Acceptance of terms",
    content: (
      <p>
        By accessing or using LeadHunter, you agree to these Terms of Service. If you do not agree, do not create an
        account or use the service.
      </p>
    ),
  },
  {
    id: "eligibility",
    title: "Eligibility",
    content: (
      <p>
        You must be legally able to enter into a binding agreement in your jurisdiction. If you use LeadHunter on
        behalf of a company or client, you represent that you have authority to do so.
      </p>
    ),
  },
  {
    id: "account-registration",
    title: "Account registration and security",
    content: (
      <p>
        You must provide accurate account information, protect your credentials, and promptly notify support of
        suspected unauthorized access. You are responsible for activity performed through your account.
      </p>
    ),
  },
  {
    id: "user-responsibilities",
    title: "User responsibilities",
    content: (
      <p>
        You are responsible for the searches you request, the records you save or export, the people or businesses you
        contact, and the lawful use of information obtained through LeadHunter.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    content: (
      <>
        <p>You may use LeadHunter only for lawful business research and outreach preparation. You must not:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Perform unlawful scraping or use LeadHunter to violate applicable platform terms.</li>
          <li>Bypass access controls, authentication, rate limits, robots protections, or technical restrictions.</li>
          <li>Steal credentials, access private dashboards, or obtain data without authorization.</li>
          <li>Use collected information for harassment, deceptive outreach, or unlawful discrimination.</li>
          <li>Send unlawful automated messages, spam, or communications without required consent.</li>
          <li>Resell data in violation of applicable law, contractual obligations, or source terms.</li>
          <li>Overload, disrupt, reverse engineer, or attempt to compromise LeadHunter or its providers.</li>
        </ul>
      </>
    ),
  },
  {
    id: "outreach-compliance",
    title: "Outreach and anti-spam compliance",
    content: (
      <p className="font-semibold text-[var(--navy-secondary)]">
        Users are responsible for ensuring that their outreach complies with applicable laws, including marketing,
        privacy, and anti-spam rules.
      </p>
    ),
  },
  {
    id: "public-source-data",
    title: "Public-source data",
    content: (
      <p>
        LeadHunter organizes information returned by configured public sources and provider APIs. A record appearing
        publicly does not remove your responsibility to use it lawfully, respect source terms, and verify it before
        relying on it.
      </p>
    ),
  },
  {
    id: "third-party-platforms",
    title: "Third-party platforms and terms",
    content: (
      <p>
        Google Maps, Google Places, Google Sheets, community sources, delivery platforms, and other third-party services
        are governed by their own terms. LeadHunter is not affiliated with or endorsed by those platforms, and provider
        availability may change.
      </p>
    ),
  },
  {
    id: "data-accuracy",
    title: "Data accuracy limitations",
    content: (
      <p>
        Public business information may be incomplete, inaccurate, duplicated, or outdated. Search coverage varies by
        city, niche, source, and provider. You should verify material information before using it for decisions or
        outreach.
      </p>
    ),
  },
  {
    id: "email-limitations",
    title: "Email and contact availability",
    content: (
      <p>
        LeadHunter finds public emails and contact pages when available. It does not guarantee that every lead will
        include an email, that an address belongs to a particular owner, or that a contact method is current.
      </p>
    ),
  },
  {
    id: "delivery-limitations",
    title: "Delivery-platform presence limitations",
    content: (
      <p>
        Delivery-platform presence is inferred from public search results and confidence scoring. A found status is not
        official verification, partnership confirmation, or proof that a listing is active. Users should verify the
        public listing before relying on it.
      </p>
    ),
  },
  {
    id: "usage-limits",
    title: "Usage limits",
    content: (
      <p>
        Monthly lead allowances and operational safeguards apply by plan. Usage limits may be enforced to protect the
        service and its providers. Enrichment of an existing lead does not necessarily count the same way as saving a
        new lead, as described in the product.
      </p>
    ),
  },
  {
    id: "plans-billing",
    title: "Free and paid plans",
    content: (
      <p>
        LeadHunter currently supports free, starter, pro, and agency plan records. Self-serve Paddle checkout is not
        connected in this release, and early-access plan changes may be handled manually. Paid functionality,
        allowances, and billing procedures may change before general availability.
      </p>
    ),
  },
  {
    id: "suspension",
    title: "Suspension and account disabling",
    content: (
      <p>
        We may limit, suspend, or disable accounts for security concerns, abuse, nonpayment where applicable, violations
        of these Terms, harm to the service or providers, or legal requirements. Disabled users may contact support if
        they believe the action was made in error.
      </p>
    ),
  },
  {
    id: "intellectual-property",
    title: "Intellectual property",
    content: (
      <p>
        LeadHunter's software, branding, interface, and original content are owned by or licensed to the LeadHunter
        operator. These Terms do not transfer ownership of the service or third-party source data.
      </p>
    ),
  },
  {
    id: "third-party-services",
    title: "Third-party services",
    content: (
      <p>
        The service depends on third-party infrastructure and APIs. We are not responsible for outages, restrictions,
        policy changes, inaccuracies, or actions of third-party providers, though we may try to provide clear errors or
        partial results.
      </p>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    content: (
      <p>
        LeadHunter is provided on an as-available basis. To the extent permitted by law, we disclaim implied warranties
        of merchantability, fitness for a particular purpose, non-infringement, uninterrupted availability, and perfect
        data accuracy.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    content: (
      <p>
        To the maximum extent permitted by law, the LeadHunter operator will not be liable for indirect, incidental,
        special, consequential, or punitive damages, lost profits, lost opportunities, provider outages, or decisions
        made using public-source data.
      </p>
    ),
  },
  {
    id: "indemnification",
    title: "Indemnification",
    content: (
      <p>
        To the extent permitted by law, you agree to defend and indemnify the LeadHunter operator against claims arising
        from your unlawful use of the service, your outreach, your violation of these Terms, or your violation of
        another party's rights.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Termination",
    content: (
      <p>
        You may stop using LeadHunter at any time. We may terminate or discontinue access where necessary for security,
        legal compliance, service operation, or material violations of these Terms. Provisions intended to survive
        termination remain in effect.
      </p>
    ),
  },
  {
    id: "governing-law",
    title: "Governing law",
    content: (
      <p>
        The governing law and venue will be stated in the production legal terms before self-serve paid billing is
        introduced. Mandatory consumer protections and other laws that cannot be waived continue to apply.
      </p>
    ),
  },
  {
    id: "changes-contact",
    title: "Changes and contact",
    content: (
      <>
        <p>
          We may update these Terms as the service, provider relationships, or legal requirements change. Continued use
          after an update means you accept the revised Terms where permitted by law.
        </p>
        <p>
          Questions can be sent to{" "}
          <a href={`mailto:${supportEmail}`} className="font-semibold text-[var(--primary)] hover:underline">
            {supportEmail}
          </a>
          .
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPageLayout
      eyebrow="Legal"
      title="Terms of Service"
      summary="The rules and responsibilities that apply when accessing or using LeadHunter."
      updatedAt="July 24, 2026"
      sections={sections}
      supportEmail={supportEmail}
    />
  );
}
