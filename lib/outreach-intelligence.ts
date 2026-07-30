import { getContactPageUrl } from "@/lib/contactability";
import { isUsableDecisionMakerCandidate } from "@/lib/decision-maker-validation";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import { hasMeaningfulRestaurantIntelligence } from "@/lib/lead-kind";
import type { DecisionMaker, DecisionMakerEmailType, Lead } from "@/lib/types";

export type OutreachReadinessStatus =
  | "Outreach ready"
  | "Contactable"
  | "Needs enrichment"
  | "Weak contact options"
  | "Not currently contactable";

export type OutreachIntelligence = {
  bestContactMethod:
    | "Decision-maker email"
    | "WhatsApp"
    | "Business email"
    | "Contact form"
    | "Phone"
    | "Website only"
    | "Not currently contactable";
  opportunitySignals: string[];
  suggestedAngle: string;
  readinessScore: number;
  readinessStatus: OutreachReadinessStatus;
};

const roleBasedPrefixes = new Set([
  "sales",
  "marketing",
  "partnerships",
  "booking",
  "reservations",
  "events",
  "catering",
  "manager",
]);
const generalPrefixes = new Set(["info", "hello", "contact", "support", "admin", "team", "office"]);
const personalDomains = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com"]);

export function classifyPublicEmail(email?: string | null, personName?: string): DecisionMakerEmailType | undefined {
  const safeEmail = cleanSafePublicEmail(email);
  if (!safeEmail) {
    return undefined;
  }

  const [local = "", domain = ""] = safeEmail.toLowerCase().split("@");
  if (personalDomains.has(domain)) {
    return "public_personal";
  }
  if (roleBasedPrefixes.has(local)) {
    return "role_based";
  }
  if (generalPrefixes.has(local)) {
    return "general_business";
  }

  const nameTokens = (personName ?? "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 1);
  if (nameTokens.length && nameTokens.some((token) => local.includes(token))) {
    return "decision_maker_work";
  }

  return "unknown";
}

export function getPrimaryDecisionMaker(lead: Lead): DecisionMaker | undefined {
  const candidates = (lead.decision_makers ?? []).filter((candidate) =>
    isUsableDecisionMakerCandidate(candidate, lead.company_name),
  );
  return candidates.find((candidate) => candidate.is_primary) ?? candidates[0];
}

function readinessStatus(score: number): OutreachReadinessStatus {
  if (score >= 80) return "Outreach ready";
  if (score >= 60) return "Contactable";
  if (score >= 40) return "Needs enrichment";
  if (score >= 20) return "Weak contact options";
  return "Not currently contactable";
}

export function getOutreachIntelligence(lead: Lead): OutreachIntelligence {
  const primary = getPrimaryDecisionMaker(lead);
  const businessEmail = cleanSafePublicEmail(lead.email);
  const decisionMakerEmail = cleanSafePublicEmail(primary?.public_work_email);
  const contactPage = getContactPageUrl(lead);
  const hasWhatsApp = lead.public_whatsapp_status === "confirmed_public" && Boolean(lead.public_whatsapp_url);
  const signals: string[] = [];

  if (!lead.website?.trim()) {
    signals.push("Google Maps listing does not include a website.");
  } else {
    signals.push("Business website is available.");
  }
  if (contactPage) {
    signals.push("Public contact page is available.");
  } else if (lead.website?.trim()) {
    signals.push("No public contact page was found.");
  }
  if (businessEmail) {
    signals.push("Public business email is available.");
  } else if (lead.phone?.trim()) {
    signals.push("Phone outreach is currently available.");
  }
  if (primary) {
    signals.push("A public decision-maker candidate was identified.");
  } else {
    signals.push("Decision-maker research is still needed.");
  }
  if (hasWhatsApp) {
    signals.push("An explicitly public business WhatsApp link was found.");
  }
  if (hasMeaningfulRestaurantIntelligence(lead)) {
    const platforms = [
      lead.delivery_ubereats_status,
      lead.delivery_doordash_status,
      lead.delivery_grubhub_status,
      lead.delivery_deliveroo_status,
      lead.delivery_justeat_status,
    ];
    if (platforms.some((status) => status === "found")) {
      signals.push("Public delivery-platform presence was found.");
    } else if (platforms.some((status) => status === "not_found")) {
      signals.push("A selected delivery platform was checked without a public listing match.");
    }
  }

  let score = 0;
  if (decisionMakerEmail && primary?.email_type === "decision_maker_work") score += 30;
  if (primary?.name && primary.role) score += 20;
  if (primary?.public_profile_url) score += 5;
  if (businessEmail && !decisionMakerEmail) score += 15;
  if (contactPage) score += 10;
  if (lead.phone?.trim()) score += 10;
  if (hasWhatsApp) score += 10;
  if (signals.length) score += 5;
  if (lead.website?.trim()) score += 5;
  score = Math.min(100, score);

  const bestContactMethod = decisionMakerEmail
    ? "Decision-maker email"
    : hasWhatsApp
      ? "WhatsApp"
      : businessEmail
        ? "Business email"
        : contactPage
          ? "Contact form"
          : lead.phone?.trim()
            ? "Phone"
            : lead.website?.trim()
              ? "Website only"
              : "Not currently contactable";

  let suggestedAngle = "Research the business before choosing a relevant, permission-based outreach angle.";
  if (!lead.website?.trim()) {
    suggestedAngle = "Offer a professional website and lead-capture setup.";
  } else if (primary) {
    suggestedAngle = "Personalize the outreach to the identified decision-maker and reference their role.";
  } else if (hasWhatsApp) {
    suggestedAngle = "Use a short, permission-based WhatsApp introduction.";
  } else if (contactPage) {
    suggestedAngle = "Use the public contact form with a concise, niche-specific introduction.";
  } else if (lead.phone?.trim()) {
    suggestedAngle = "Use a phone-first introduction and offer a short audit.";
  }

  if (hasMeaningfulRestaurantIntelligence(lead)) {
    const found = [
      lead.delivery_ubereats_status,
      lead.delivery_doordash_status,
      lead.delivery_grubhub_status,
      lead.delivery_deliveroo_status,
      lead.delivery_justeat_status,
    ].some((status) => status === "found");
    suggestedAngle = found
      ? "Consider offering restaurant marketing, listing optimization, or conversion support."
      : "Ask whether expanding delivery-channel visibility would be useful.";
  }

  return {
    bestContactMethod,
    opportunitySignals: [...new Set(signals)],
    suggestedAngle,
    readinessScore: score,
    readinessStatus: readinessStatus(score),
  };
}
