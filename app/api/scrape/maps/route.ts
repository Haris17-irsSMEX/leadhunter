import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { getSupabaseServiceClient, withScrapedAt } from "@/lib/db";
import { checkDeliveryPlatforms, DELIVERY_PLATFORM_IDS } from "@/lib/delivery-platforms";
import { findRestaurantPublicEmail } from "@/lib/restaurant-email";
import { scrapeGoogleMaps } from "@/lib/sgai";
import type { DeliveryPlatformId, Lead } from "@/lib/types";
import { getUsageSummary, MonthlyLimitError } from "@/lib/usage";

export const runtime = "nodejs";

type WebsiteFilter = "all" | "has_website" | "no_website";
type DeliveryFilter =
  | "all"
  | "any_selected_found"
  | "ubereats_found"
  | "doordash_found"
  | "grubhub_found"
  | "deliveroo_found"
  | "justeat_found";

type EnrichmentResult = {
  leads: Lead[];
  warnings: string[];
  enrichedCount: number;
  requestedCount: number;
};

function websiteFilter(value: unknown): WebsiteFilter {
  return value === "has_website" || value === "no_website" ? value : "all";
}

function deliveryFilter(value: unknown): DeliveryFilter {
  return value === "any_selected_found" ||
    value === "ubereats_found" ||
    value === "doordash_found" ||
    value === "grubhub_found" ||
    value === "deliveroo_found" ||
    value === "justeat_found"
    ? value
    : "all";
}

function deliveryPlatforms(value: unknown): DeliveryPlatformId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter((platform): platform is DeliveryPlatformId =>
        typeof platform === "string" && DELIVERY_PLATFORM_IDS.includes(platform as DeliveryPlatformId),
      ),
    ),
  ];
}

function hasWebsite(lead: Pick<Lead, "website">) {
  return Boolean(lead.website?.trim());
}

function matchesWebsiteFilter(lead: Lead, filter: WebsiteFilter) {
  if (filter === "has_website") {
    return hasWebsite(lead);
  }

  if (filter === "no_website") {
    return !hasWebsite(lead);
  }

  return true;
}

function platformStatus(lead: Lead, platform: DeliveryPlatformId) {
  if (platform === "ubereats") {
    return lead.delivery_ubereats_status;
  }
  if (platform === "doordash") {
    return lead.delivery_doordash_status;
  }
  if (platform === "grubhub") {
    return lead.delivery_grubhub_status;
  }
  if (platform === "deliveroo") {
    return lead.delivery_deliveroo_status;
  }

  return lead.delivery_justeat_status;
}

function matchesDeliveryFilter(lead: Lead, filter: DeliveryFilter, selectedPlatforms: DeliveryPlatformId[]) {
  if (filter === "all") {
    return true;
  }

  if (filter === "any_selected_found") {
    return selectedPlatforms.some((platform) => platformStatus(lead, platform) === "found");
  }

  const platform = filter.replace(/_found$/, "") as DeliveryPlatformId;
  return platformStatus(lead, platform) === "found";
}

function restaurantEnrichmentEnabled() {
  return process.env.RESTAURANT_ENRICHMENT_ENABLED?.trim().toLowerCase() === "true";
}

function restaurantEnrichmentMaxPerRequest() {
  const configured = Number(process.env.RESTAURANT_ENRICHMENT_MAX_PER_REQUEST ?? 10);
  return Number.isFinite(configured) ? Math.min(Math.max(Math.floor(configured), 0), 50) : 10;
}

function restaurantEnrichmentConcurrency() {
  const configured = Number(process.env.RESTAURANT_ENRICHMENT_CONCURRENCY ?? 2);
  return Number.isFinite(configured) ? Math.min(Math.max(Math.floor(configured), 1), 5) : 2;
}

function normalizeText(value?: string) {
  return value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() ?? "";
}

function normalizePhone(value?: string) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 7 ? digits : "";
}

function normalizeWebsite(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return `${url.hostname.replace(/^www\./i, "").toLowerCase()}${url.pathname.replace(/\/+$/, "")}`.replace(/\/$/, "");
  } catch {
    return trimmed.toLowerCase().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
  }
}

function dedupeKeys(lead: Lead) {
  const keys: string[] = [];
  const placeId = lead.source_external_id?.trim() || (typeof lead.raw_metadata?.google_place_id === "string" ? lead.raw_metadata.google_place_id : "");
  const website = normalizeWebsite(lead.website);
  const phone = normalizePhone(lead.phone);
  const name = normalizeText(lead.company_name);
  const location = normalizeText(lead.location);

  if (placeId) {
    keys.push(`place:${placeId}`);
  }
  if (website) {
    keys.push(`website:${website}`);
  }
  if (phone) {
    keys.push(`phone:${phone}`);
  }
  if (name && location) {
    keys.push(`name-location:${name}|${location}`);
  }

  return keys;
}

function indexLead(index: Map<string, Lead>, lead: Lead) {
  for (const key of dedupeKeys(lead)) {
    index.set(key, lead);
  }
}

function restaurantEnrichmentUpdate(lead: Lead) {
  const update: Partial<Lead> = {};

  if (lead.email) {
    update.email = lead.email;
  }
  if (lead.email_source_url) {
    update.email_source_url = lead.email_source_url;
  }
  if (typeof lead.email_confidence === "number") {
    update.email_confidence = lead.email_confidence;
  }
  if (lead.delivery_ubereats_status) {
    update.delivery_ubereats_status = lead.delivery_ubereats_status;
  }
  if (lead.delivery_ubereats_menu_url) {
    update.delivery_ubereats_menu_url = lead.delivery_ubereats_menu_url;
  }
  if (typeof lead.delivery_ubereats_confidence === "number") {
    update.delivery_ubereats_confidence = lead.delivery_ubereats_confidence;
  }
  if (lead.delivery_doordash_status) {
    update.delivery_doordash_status = lead.delivery_doordash_status;
  }
  if (lead.delivery_doordash_menu_url) {
    update.delivery_doordash_menu_url = lead.delivery_doordash_menu_url;
  }
  if (typeof lead.delivery_doordash_confidence === "number") {
    update.delivery_doordash_confidence = lead.delivery_doordash_confidence;
  }
  if (lead.delivery_grubhub_status) {
    update.delivery_grubhub_status = lead.delivery_grubhub_status;
  }
  if (lead.delivery_grubhub_menu_url) {
    update.delivery_grubhub_menu_url = lead.delivery_grubhub_menu_url;
  }
  if (typeof lead.delivery_grubhub_confidence === "number") {
    update.delivery_grubhub_confidence = lead.delivery_grubhub_confidence;
  }
  if (lead.delivery_deliveroo_status) {
    update.delivery_deliveroo_status = lead.delivery_deliveroo_status;
  }
  if (lead.delivery_deliveroo_menu_url) {
    update.delivery_deliveroo_menu_url = lead.delivery_deliveroo_menu_url;
  }
  if (typeof lead.delivery_deliveroo_confidence === "number") {
    update.delivery_deliveroo_confidence = lead.delivery_deliveroo_confidence;
  }
  if (lead.delivery_justeat_status) {
    update.delivery_justeat_status = lead.delivery_justeat_status;
  }
  if (lead.delivery_justeat_menu_url) {
    update.delivery_justeat_menu_url = lead.delivery_justeat_menu_url;
  }
  if (typeof lead.delivery_justeat_confidence === "number") {
    update.delivery_justeat_confidence = lead.delivery_justeat_confidence;
  }
  if (lead.restaurant_enrichment_status) {
    update.restaurant_enrichment_status = lead.restaurant_enrichment_status;
  }
  if (lead.restaurant_enriched_at) {
    update.restaurant_enriched_at = lead.restaurant_enriched_at;
  }
  if (lead.raw_metadata) {
    update.raw_metadata = lead.raw_metadata;
  }

  return update;
}

async function updateExistingLeadWithEnrichment(
  existing: Lead,
  enrichedLead: Lead,
  allowedUserIds: string[],
) {
  if (!existing.id || !enrichedLead.restaurant_enrichment_status || enrichedLead.restaurant_enrichment_status === "not_checked") {
    return { lead: { ...existing, scrape_status: "already_saved" as const } };
  }

  const update = restaurantEnrichmentUpdate(enrichedLead);

  if (!Object.keys(update).length) {
    return { lead: { ...existing, scrape_status: "already_saved" as const } };
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", existing.id)
    .in("user_id", allowedUserIds)
    .select("*")
    .single();

  if (error) {
    return {
      lead: { ...existing, scrape_status: "already_saved" as const },
      warning: `Could not update enrichment for ${existing.company_name}.`,
    };
  }

  return { lead: { ...(data as Lead), scrape_status: "updated" as const } };
}

async function supportsRestaurantEnrichmentStorage() {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase
    .from("leads")
    .select(
      "email_source_url,email_confidence,delivery_ubereats_status,delivery_ubereats_menu_url,delivery_ubereats_confidence,delivery_doordash_status,delivery_doordash_menu_url,delivery_doordash_confidence,delivery_grubhub_status,delivery_grubhub_menu_url,delivery_grubhub_confidence,delivery_deliveroo_status,delivery_deliveroo_menu_url,delivery_deliveroo_confidence,delivery_justeat_status,delivery_justeat_menu_url,delivery_justeat_confidence,restaurant_enrichment_status,restaurant_enriched_at",
    )
    .limit(1);

  if (!error) {
    return true;
  }

  const missingColumn =
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.message.toLowerCase().includes("could not find") ||
    error.message.toLowerCase().includes("column");

  if (missingColumn) {
    return false;
  }

  throw new Error(error.message);
}

function overallEnrichmentStatus(statuses: string[]) {
  if (statuses.every((status) => status === "error")) {
    return "error" as const;
  }

  if (statuses.some((status) => status === "error" || status === "not_checked")) {
    return "partial" as const;
  }

  return "completed" as const;
}

function selectedPlatformFields(deliveryResult: Awaited<ReturnType<typeof checkDeliveryPlatforms>>, selectedPlatforms: DeliveryPlatformId[]) {
  const fields: Partial<Lead> = {};

  for (const platform of selectedPlatforms) {
    const result = deliveryResult.results[platform];

    if (platform === "ubereats") {
      fields.delivery_ubereats_status = result.status;
      fields.delivery_ubereats_menu_url = result.menuUrl;
      fields.delivery_ubereats_confidence = result.confidence;
    } else if (platform === "doordash") {
      fields.delivery_doordash_status = result.status;
      fields.delivery_doordash_menu_url = result.menuUrl;
      fields.delivery_doordash_confidence = result.confidence;
    } else if (platform === "grubhub") {
      fields.delivery_grubhub_status = result.status;
      fields.delivery_grubhub_menu_url = result.menuUrl;
      fields.delivery_grubhub_confidence = result.confidence;
    } else if (platform === "deliveroo") {
      fields.delivery_deliveroo_status = result.status;
      fields.delivery_deliveroo_menu_url = result.menuUrl;
      fields.delivery_deliveroo_confidence = result.confidence;
    } else {
      fields.delivery_justeat_status = result.status;
      fields.delivery_justeat_menu_url = result.menuUrl;
      fields.delivery_justeat_confidence = result.confidence;
    }
  }

  return fields;
}

async function enrichRestaurantLead(lead: Lead, selectedPlatforms: DeliveryPlatformId[]) {
  const warnings: string[] = [];
  const [emailResult, deliveryResult] = await Promise.all([
    findRestaurantPublicEmail(lead.website),
    checkDeliveryPlatforms(lead.company_name, lead.location, selectedPlatforms),
  ]);
  warnings.push(...deliveryResult.warnings);

  const deliveryStatuses = selectedPlatforms.map((platform) => deliveryResult.results[platform].status);
  const statuses = [emailResult.status, ...deliveryStatuses];
  const restaurantEnrichmentStatus = overallEnrichmentStatus(statuses);
  const enrichedAt = new Date().toISOString();

  return {
    lead: {
      ...lead,
      ...(emailResult.email
        ? {
            email: emailResult.email,
            email_source_url: emailResult.sourceUrl,
            email_confidence: emailResult.confidence,
          }
        : {}),
      ...selectedPlatformFields(deliveryResult, selectedPlatforms),
      restaurant_enrichment_status: restaurantEnrichmentStatus,
      restaurant_enriched_at: enrichedAt,
      raw_metadata: {
        ...(lead.raw_metadata ?? {}),
        restaurant_enrichment: {
          email_status: emailResult.status,
          email_source_url: emailResult.sourceUrl,
          contact_page_url: emailResult.contactPageUrl,
          delivery_platforms: deliveryResult.results,
          selected_platforms: selectedPlatforms,
          enriched_at: enrichedAt,
        },
      },
    } satisfies Lead,
    warnings,
  };
}

async function enrichRestaurantLeads(leads: Lead[], selectedPlatforms: DeliveryPlatformId[]): Promise<EnrichmentResult> {
  const max = restaurantEnrichmentMaxPerRequest();
  const concurrency = restaurantEnrichmentConcurrency();
  const warnings: string[] = [];

  if (!restaurantEnrichmentEnabled()) {
    return {
      leads,
      warnings: ["Restaurant enrichment is disabled. Set RESTAURANT_ENRICHMENT_ENABLED=true in .env.local."],
      enrichedCount: 0,
      requestedCount: leads.length,
    };
  }

  if (max <= 0) {
    return {
      leads,
      warnings: ["Restaurant enrichment max per request is set to 0, so no leads were enriched."],
      enrichedCount: 0,
      requestedCount: leads.length,
    };
  }

  const enrichTargets = leads.slice(0, max);
  const enrichedLeads = [...leads];
  let enrichedCount = 0;
  let shouldStopForRateLimit = false;

  for (let index = 0; index < enrichTargets.length; index += concurrency) {
    const batch = enrichTargets.slice(index, index + concurrency);
    const enriched = await Promise.allSettled(batch.map((lead) => enrichRestaurantLead(lead, selectedPlatforms)));

    enriched.forEach((result, batchIndex) => {
      const leadIndex = index + batchIndex;

      if (result.status === "fulfilled") {
        enrichedLeads[leadIndex] = result.value.lead;
        warnings.push(...result.value.warnings);
        enrichedCount += 1;

        if (result.value.warnings.some((warning) => warning.includes("Delivery search provider limit reached"))) {
          shouldStopForRateLimit = true;
        }
        return;
      }

      warnings.push(`Restaurant enrichment failed for ${leads[leadIndex]?.company_name ?? "one lead"}.`);
    });

    if (shouldStopForRateLimit) {
      warnings.push("Delivery search provider limit reached. Some platform checks were not completed.");
      break;
    }
  }

  if (leads.length > max) {
    warnings.push(`Restaurant enrichment checked ${enrichTargets.length} of ${leads.length} leads in this request.`);
  }

  return { leads: enrichedLeads, warnings: [...new Set(warnings)], enrichedCount, requestedCount: leads.length };
}

async function saveGoogleMapsLeads(leads: Lead[], user: { id: string; email?: string }, allowedUserIds: string[]) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("source", "google_maps")
    .in("user_id", allowedUserIds);

  if (error) {
    throw new Error(error.message);
  }

  const existingIndex = new Map<string, Lead>();
  for (const existingLead of (data ?? []) as Lead[]) {
    indexLead(existingIndex, existingLead);
  }

  const inserted: Lead[] = [];
  const duplicates: Lead[] = [];
  const newCandidates: Lead[] = [];
  const warnings: string[] = [];

  for (const lead of leads) {
    const existing = dedupeKeys(lead)
      .map((key) => existingIndex.get(key))
      .find(Boolean);

    if (existing) {
      const updated = await updateExistingLeadWithEnrichment(existing, lead, allowedUserIds);
      duplicates.push(updated.lead);
      if (updated.warning) {
        warnings.push(updated.warning);
      }
      continue;
    }

    newCandidates.push(lead);
    indexLead(existingIndex, lead);
  }

  const usage = await getUsageSummary(user);
  const allowedNewCount = usage.isAdmin ? newCandidates.length : Math.min(newCandidates.length, usage.remaining);

  if (newCandidates.length > 0 && allowedNewCount <= 0) {
    throw new MonthlyLimitError(usage);
  }

  for (const lead of newCandidates.slice(0, allowedNewCount)) {
    const { data: insertedLead, error: insertError } = await supabase
      .from("leads")
      .insert(withScrapedAt({ ...lead, user_id: user.id }))
      .select("*")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        duplicates.push({ ...lead, scrape_status: "skipped_duplicate" });
        continue;
      }

      throw new Error(insertError.message);
    }

    inserted.push({ ...(insertedLead as Lead), scrape_status: "new" });
  }

  return {
    inserted,
    skippedDuplicates: duplicates.length,
    leads: [...inserted, ...duplicates],
    usage,
    warnings,
  };
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      query?: string;
      location?: string;
      numResults?: number;
      websiteFilter?: unknown;
      restaurantEnrichment?: boolean;
      deliveryPlatforms?: unknown;
      deliveryFilter?: unknown;
    };
    const query = body.query?.trim();
    const location = body.location?.trim();
    const requestedResults = Number(body.numResults ?? 20);
    const numResults = Number.isFinite(requestedResults) ? Math.min(Math.max(requestedResults, 1), 50) : 20;
    const filter = websiteFilter(body.websiteFilter);
    const shouldEnrichRestaurants = body.restaurantEnrichment === true;
    const selectedDeliveryPlatforms = deliveryPlatforms(body.deliveryPlatforms);
    const selectedDeliveryFilter = deliveryFilter(body.deliveryFilter);
    const warnings: string[] = [];

    if (!query || !location) {
      return NextResponse.json({ error: "Both query and location are required." }, { status: 400 });
    }

    const scrapedLeads = (await scrapeGoogleMaps(query, location, numResults)).filter((lead) => matchesWebsiteFilter(lead, filter));
    let leads = scrapedLeads;
    let enrichmentResult: EnrichmentResult | null = null;

    if (shouldEnrichRestaurants) {
      const hasStorage = await supportsRestaurantEnrichmentStorage();

      if (hasStorage) {
        const enrichment = await enrichRestaurantLeads(scrapedLeads, selectedDeliveryPlatforms);
        enrichmentResult = enrichment;
        leads = enrichment.leads.filter((lead) => matchesDeliveryFilter(lead, selectedDeliveryFilter, selectedDeliveryPlatforms));
        warnings.push(...enrichment.warnings);
      } else {
        warnings.push("Restaurant enrichment fields are not available yet. Apply the restaurant enrichment migration before enabling this feature.");
      }
    }

    const saved = await saveGoogleMapsLeads(leads, user, getAllowedUserIds(user));

    if (enrichmentResult && enrichmentResult.requestedCount > enrichmentResult.enrichedCount) {
      warnings.push(
        `Saved ${saved.inserted.length} leads. Enriched ${enrichmentResult.enrichedCount} now. The rest can be enriched later.`,
      );
    }

    return NextResponse.json({
      requested: numResults,
      count: leads.length,
      inserted: saved.inserted.length,
      skippedDuplicates: saved.skippedDuplicates,
      leads: saved.leads,
      usage: saved.usage,
      warnings: [...new Set([...warnings, ...saved.warnings])],
    });
  } catch (error) {
    return apiErrorResponse(error, "Google Maps scrape failed.");
  }
}
