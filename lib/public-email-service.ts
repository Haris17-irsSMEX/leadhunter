import "server-only";

import type { User } from "@supabase/supabase-js";
import { getAllowedUserIds } from "@/lib/auth";
import { getContactPageUrl } from "@/lib/contactability";
import { getSupabaseServiceClient } from "@/lib/db";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import { classifyPublicEmail } from "@/lib/outreach-intelligence";
import type { PublicWebResearchContext } from "@/lib/public-web";
import { findPublicBusinessEmail, type PublicEmailResult } from "@/lib/restaurant-email";
import type { Lead } from "@/lib/types";

type UserIdentity = Pick<User, "id" | "email">;

export const PUBLIC_EMAIL_RESEARCH_VERSION = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function hasCurrentPublicEmailResearch(lead: Pick<Lead, "raw_metadata">) {
  const metadata = isRecord(lead.raw_metadata) ? lead.raw_metadata : {};
  const contact = isRecord(metadata.contact_enrichment) ? metadata.contact_enrichment : {};
  return contact.email_research_version === PUBLIC_EMAIL_RESEARCH_VERSION;
}

async function loadOwnedLead(user: UserIdentity, leadId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .in("user_id", getAllowedUserIds(user))
    .single();
  if (error) throw new Error(error.message);
  return data as Lead;
}

export async function enrichLeadPublicEmail(
  user: UserIdentity,
  lead: Lead,
  options: { context?: PublicWebResearchContext; forceRefresh?: boolean } = {},
) {
  if (!lead.id) throw new Error("Lead id is required for email enrichment.");

  const currentLead = await loadOwnedLead(user, lead.id);
  const currentEmail = cleanSafePublicEmail(currentLead.email);
  const currentContactPage = getContactPageUrl(currentLead) ?? undefined;
  if (currentEmail && !options.forceRefresh) {
    return {
      lead: currentLead,
      result: {
        email: currentEmail,
        sourceUrl: currentLead.email_source_url,
        contactPageUrl: currentContactPage,
        confidence: currentLead.email_confidence,
        status: "found",
        cached: true,
      } satisfies PublicEmailResult,
      emailAlreadyExisted: true,
    };
  }

  const result = await findPublicBusinessEmail(currentLead.website, options.context, {
    forceRefresh: options.forceRefresh,
  });
  const latestLead = await loadOwnedLead(user, lead.id);
  const persistedEmail = cleanSafePublicEmail(latestLead.email);
  const discoveredEmail = cleanSafePublicEmail(result.email);
  const effectiveEmail = persistedEmail ?? discoveredEmail;
  const contactPageUrl = result.contactPageUrl ?? getContactPageUrl(latestLead) ?? undefined;
  const metadata = isRecord(latestLead.raw_metadata) ? latestLead.raw_metadata : {};
  const contactMetadata = isRecord(metadata.contact_enrichment) ? metadata.contact_enrichment : {};
  const update: Record<string, unknown> = {
    raw_metadata: {
      ...metadata,
      contact_enrichment: {
        ...contactMetadata,
        status: effectiveEmail ? "completed" : contactPageUrl ? "partial" : result.status,
        contact_page_url: contactPageUrl,
        email_type: classifyPublicEmail(effectiveEmail),
        email_research_version: PUBLIC_EMAIL_RESEARCH_VERSION,
        checked_at: new Date().toISOString(),
      },
    },
  };

  if (discoveredEmail && (!persistedEmail || persistedEmail === discoveredEmail)) {
    update.email = persistedEmail ?? discoveredEmail;
    update.email_source_url = result.sourceUrl ?? latestLead.email_source_url ?? null;
    update.email_confidence = result.confidence ?? latestLead.email_confidence ?? null;
  } else if (latestLead.email && !persistedEmail) {
    update.email = null;
  }

  const { data, error } = await getSupabaseServiceClient()
    .from("leads")
    .update(update)
    .eq("id", lead.id)
    .in("user_id", getAllowedUserIds(user))
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return {
    lead: data as Lead,
    result: {
      ...result,
      email: effectiveEmail,
      contactPageUrl,
      status: effectiveEmail ? "found" : result.status,
    } satisfies PublicEmailResult,
    emailAlreadyExisted: Boolean(persistedEmail),
  };
}
