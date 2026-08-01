import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, PublicApiError } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/db";
import { checkDeliveryPlatforms, DELIVERY_PLATFORM_IDS } from "@/lib/delivery-platforms";
import { saveGoogleMapsLeads } from "@/lib/google-maps-leads";
import { findRestaurantPublicEmail } from "@/lib/restaurant-email";
import { logWorkflowEvent } from "@/lib/operational-errors";
import { GooglePlacesProviderError, scrapeGoogleMapsWithMeta } from "@/lib/sgai";
import type { DeliveryPlatformId, Lead } from "@/lib/types";
import { getUsageSummary, MonthlyLimitError } from "@/lib/usage";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

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
  return Number.isFinite(configured)
    ? Math.min(Math.max(Math.floor(configured), 0), WORKLOAD_LIMITS.restaurantEnrichment.maxLeadsPerRequest)
    : 10;
}

function restaurantEnrichmentConcurrency() {
  const configured = Number(process.env.RESTAURANT_ENRICHMENT_CONCURRENCY ?? 2);
  return Number.isFinite(configured)
    ? Math.min(Math.max(Math.floor(configured), 1), WORKLOAD_LIMITS.restaurantEnrichment.maxConcurrency)
    : 2;
}

function publicGooglePlacesError(error: GooglePlacesProviderError) {
  const providerStatus = error.providerStatus?.toUpperCase();

  if (error.httpStatus === 429 || providerStatus === "RESOURCE_EXHAUSTED") {
    return new PublicApiError(
      "Google Maps search is temporarily unavailable because the provider quota was reached. Please try again shortly.",
      503,
      "GOOGLE_MAPS_PROVIDER_QUOTA",
    );
  }

  if (
    error.httpStatus === 401 ||
    error.httpStatus === 403 ||
    providerStatus === "PERMISSION_DENIED" ||
    providerStatus === "UNAUTHENTICATED" ||
    providerStatus === "MISSING_API_KEY"
  ) {
    return new PublicApiError(
      "Google Maps search is temporarily unavailable due to a provider configuration issue.",
      503,
      "GOOGLE_MAPS_PROVIDER_CONFIGURATION",
    );
  }

  if (providerStatus === "TIMEOUT") {
    return new PublicApiError(
      "Google Maps search timed out. Please try again shortly.",
      504,
      "GOOGLE_MAPS_PROVIDER_TIMEOUT",
    );
  }

  return new PublicApiError(
    "Google Maps search is temporarily unavailable. Please try again shortly.",
    502,
    "GOOGLE_MAPS_PROVIDER_FAILURE",
  );
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
    const numResults = Number.isFinite(requestedResults)
      ? Math.min(Math.max(requestedResults, 1), WORKLOAD_LIMITS.nicheSearch.maxRequestedLeads)
      : 20;
    const filter = websiteFilter(body.websiteFilter);
    const shouldEnrichRestaurants = body.restaurantEnrichment === true;
    const selectedDeliveryPlatforms = deliveryPlatforms(body.deliveryPlatforms);
    const selectedDeliveryFilter = deliveryFilter(body.deliveryFilter);
    const warnings: string[] = [];

    if (!query || !location) {
      return NextResponse.json({ error: "Both query and location are required." }, { status: 400 });
    }

    const preflightUsage = await getUsageSummary(user);

    if (!preflightUsage.isAdmin && preflightUsage.remaining <= 0) {
      logWorkflowEvent("google-maps", "monthly limit guard", {
        plan: preflightUsage.plan,
        used: preflightUsage.used,
        allowance: preflightUsage.limit,
        providerInvocationStarted: false,
      });
      throw new MonthlyLimitError(preflightUsage);
    }

    logWorkflowEvent("google-maps", "provider invocation", {
      plan: preflightUsage.plan,
      used: preflightUsage.used,
      allowance: preflightUsage.limit,
      providerInvocationStarted: true,
    });

    const providerResult = await scrapeGoogleMapsWithMeta(query, location, numResults);
    const providerLeads = providerResult.value;
    const scrapedLeads = providerLeads.filter((lead) => matchesWebsiteFilter(lead, filter));

    logWorkflowEvent("google-maps", "search results", {
      query: `${query} in ${location}`,
      requested: numResults,
      providerResultCount: providerLeads.length,
      filteredResultCount: scrapedLeads.length,
      websiteFilter: filter,
      providerCalls: providerResult.providerCalls,
      cacheHit: providerResult.cached,
    });

    let leads = scrapedLeads;
    let enrichmentResult: EnrichmentResult | null = null;

    if (shouldEnrichRestaurants && scrapedLeads.length > 0) {
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
      outcome: providerLeads.length > 0 ? "success" : "zero_results",
      requested: numResults,
      providerCount: providerLeads.length,
      count: leads.length,
      inserted: saved.inserted.length,
      updated: saved.leads.filter((lead) => lead.scrape_status === "updated").length,
      skippedDuplicates: saved.skippedDuplicates,
      leads: saved.leads,
      usage: saved.usage,
      warnings: [...new Set([...warnings, ...saved.warnings])],
      workload: {
        providerCalls: providerResult.providerCalls,
        cacheHits: providerResult.cached ? 1 : 0,
        cacheMisses: providerResult.cached ? 0 : 1,
        resultsFiltered: providerLeads.length - scrapedLeads.length,
      },
    });
  } catch (error) {
    if (error instanceof GooglePlacesProviderError) {
      return apiErrorResponse(publicGooglePlacesError(error), "Google Maps scrape failed.");
    }

    return apiErrorResponse(error, "Google Maps scrape failed.");
  }
}
