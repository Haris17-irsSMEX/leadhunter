import { hasMeaningfulRestaurantIntelligence, isRestaurantLead } from "@/lib/lead-kind";
import type { DeliveryPlatformId, DeliveryPlatformStatus, Lead } from "@/lib/types";
import { normalizePublicHttpUrl } from "@/lib/urls";

export const RESTAURANT_DELIVERY_PLATFORMS: ReadonlyArray<{
  id: DeliveryPlatformId;
  label: string;
}> = [
  { id: "ubereats", label: "Uber Eats" },
  { id: "doordash", label: "DoorDash" },
  { id: "grubhub", label: "Grubhub" },
  { id: "deliveroo", label: "Deliveroo" },
  { id: "justeat", label: "Just Eat" },
];

export type RestaurantDeliveryCheckState = "complete" | "partial" | "failed" | "not_checked";

export function getRestaurantPlatformStatus(lead: Lead, platform: DeliveryPlatformId) {
  if (platform === "ubereats") return lead.delivery_ubereats_status;
  if (platform === "doordash") return lead.delivery_doordash_status;
  if (platform === "grubhub") return lead.delivery_grubhub_status;
  if (platform === "deliveroo") return lead.delivery_deliveroo_status;
  return lead.delivery_justeat_status;
}

function rawRestaurantPlatformUrl(lead: Lead, platform: DeliveryPlatformId) {
  if (platform === "ubereats") return lead.delivery_ubereats_menu_url;
  if (platform === "doordash") return lead.delivery_doordash_menu_url;
  if (platform === "grubhub") return lead.delivery_grubhub_menu_url;
  if (platform === "deliveroo") return lead.delivery_deliveroo_menu_url;
  return lead.delivery_justeat_menu_url;
}

export function getSafeRestaurantPlatformUrl(lead: Lead, platform: DeliveryPlatformId) {
  const value = rawRestaurantPlatformUrl(lead, platform)?.trim();
  if (!value || !/^https?:\/\//i.test(value)) return "";

  try {
    const normalized = normalizePublicHttpUrl(value);
    const hostname = new URL(normalized).hostname.toLowerCase();
    if (hostname === "metadata.google.internal" || hostname.endsWith(".internal") || hostname.endsWith(".localhost")) {
      return "";
    }
    return normalized;
  } catch {
    return "";
  }
}

export function isRestaurantDeliveryContext(lead: Lead) {
  return isRestaurantLead(lead) || hasMeaningfulRestaurantIntelligence(lead);
}

export function shouldIncludeRestaurantDeliveryColumns(leads: Lead[]) {
  return getRestaurantExportPlatforms(leads).length > 0;
}

function selectedPlatforms(lead: Lead) {
  const enrichment = lead.raw_metadata?.restaurant_enrichment;
  if (!enrichment || typeof enrichment !== "object" || Array.isArray(enrichment)) return [];
  const selected = (enrichment as Record<string, unknown>).selected_platforms;
  if (!Array.isArray(selected)) return [];
  const validIds = new Set(RESTAURANT_DELIVERY_PLATFORMS.map(({ id }) => id));
  return selected.filter((value): value is DeliveryPlatformId => typeof value === "string" && validIds.has(value as DeliveryPlatformId));
}

function hasCheckedRestaurantPlatform(lead: Lead, platform: DeliveryPlatformId) {
  const status = getRestaurantPlatformStatus(lead, platform);
  return Boolean(status && status !== "not_checked") || Boolean(getSafeRestaurantPlatformUrl(lead, platform));
}

export function getRestaurantExportPlatforms(leads: Lead[]) {
  const platformIds = new Set<DeliveryPlatformId>();

  for (const lead of leads) {
    if (!isRestaurantLead(lead)) continue;

    const selected = selectedPlatforms(lead);
    if (selected.length) {
      selected.forEach((platform) => platformIds.add(platform));
      continue;
    }

    RESTAURANT_DELIVERY_PLATFORMS.forEach(({ id }) => {
      if (hasCheckedRestaurantPlatform(lead, id)) {
        platformIds.add(id);
      }
    });
  }

  return RESTAURANT_DELIVERY_PLATFORMS.map(({ id }) => id).filter((id) => platformIds.has(id));
}

export function getRestaurantDeliveryCheckState(lead: Lead): RestaurantDeliveryCheckState {
  if (!isRestaurantDeliveryContext(lead)) return "not_checked";

  const selected = selectedPlatforms(lead);
  const platforms = selected.length ? selected : RESTAURANT_DELIVERY_PLATFORMS.map(({ id }) => id);
  const statuses = platforms
    .map((platform) => getRestaurantPlatformStatus(lead, platform))
    .filter((status): status is DeliveryPlatformStatus => Boolean(status && status !== "not_checked"));

  if (statuses.length) {
    if (statuses.every((status) => status === "error")) return "failed";
    if (statuses.some((status) => status === "error" || status === "unclear")) return "partial";
    if (selected.length && statuses.length < selected.length) return "partial";
    return "complete";
  }

  if (RESTAURANT_DELIVERY_PLATFORMS.some(({ id }) => Boolean(getSafeRestaurantPlatformUrl(lead, id)))) {
    return "complete";
  }
  if (lead.restaurant_enrichment_status === "completed") return "complete";
  if (lead.restaurant_enrichment_status === "partial") return "partial";
  if (lead.restaurant_enrichment_status === "error") return "failed";
  return "not_checked";
}

export function getFoundRestaurantDeliveryPlatforms(lead: Lead) {
  if (!isRestaurantLead(lead)) return [];
  return RESTAURANT_DELIVERY_PLATFORMS.filter(
    ({ id }) => getRestaurantPlatformStatus(lead, id) === "found" || Boolean(getSafeRestaurantPlatformUrl(lead, id)),
  );
}

export function getRestaurantDeliverySummary(lead: Lead) {
  if (!isRestaurantLead(lead)) return "";
  const found = getFoundRestaurantDeliveryPlatforms(lead);
  if (found.length) return found.map(({ label }) => label).join(", ");

  const state = getRestaurantDeliveryCheckState(lead);
  if (state === "complete") return "None found";
  if (state === "partial") return "Partial check";
  if (state === "failed") return "Check failed";
  return "Not checked";
}

export function getRestaurantPlatformExportValue(lead: Lead, platform: DeliveryPlatformId) {
  if (!isRestaurantLead(lead)) return "";
  const url = getSafeRestaurantPlatformUrl(lead, platform);
  const status = getRestaurantPlatformStatus(lead, platform);

  if (status === "found" || url) return url || "Found";
  if (status === "not_found") return "Not found";
  if (status === "unclear") return "Partial";
  if (status === "error") return "Check failed";
  return "Not checked";
}

export function restaurantDeliveryStatusLabel(lead: Lead) {
  const state = getRestaurantDeliveryCheckState(lead);
  if (state === "complete") return "Delivery check complete";
  if (state === "partial") return "Delivery check partial";
  if (state === "failed") return "Delivery check failed";
  return "Delivery not checked";
}
