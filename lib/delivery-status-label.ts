import type { DeliveryPlatformId, Lead } from "@/lib/types";

const PROVIDER_LIMIT_MESSAGE = "Delivery search provider limit reached";

function platformMetadata(lead: Lead, platform: DeliveryPlatformId) {
  const enrichment = lead.raw_metadata?.restaurant_enrichment;

  if (!enrichment || typeof enrichment !== "object" || !("delivery_platforms" in enrichment)) {
    return undefined;
  }

  const platforms = enrichment.delivery_platforms;

  if (!platforms || typeof platforms !== "object" || Array.isArray(platforms)) {
    return undefined;
  }

  return (platforms as Record<string, unknown>)[platform];
}

export function hasProviderLimitMetadata(lead: Lead, platform: DeliveryPlatformId) {
  const metadata = platformMetadata(lead, platform);

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  const snippet = "matchedSnippet" in metadata ? String(metadata.matchedSnippet ?? "") : "";
  return snippet.includes(PROVIDER_LIMIT_MESSAGE) || snippet.includes("quota/rate limit");
}

export function deliveryStatusLabelForLead(lead: Lead, platform: DeliveryPlatformId) {
  const status =
    platform === "ubereats"
      ? lead.delivery_ubereats_status
      : platform === "doordash"
        ? lead.delivery_doordash_status
        : platform === "grubhub"
          ? lead.delivery_grubhub_status
          : platform === "deliveroo"
            ? lead.delivery_deliveroo_status
            : lead.delivery_justeat_status;

  if (status === "found") {
    return "Found";
  }
  if (status === "not_found") {
    return "Not found";
  }
  if (status === "unclear") {
    return "Unclear";
  }
  if (status === "error") {
    return hasProviderLimitMetadata(lead, platform) ? "Provider limit" : "Provider error";
  }

  return "Not checked";
}
