import type { Lead } from "@/lib/types";
import { normalizePublicHttpUrl } from "@/lib/urls";

const restaurantSignals = [
  "restaurant",
  "restaurants",
  "pizza",
  "burger",
  "cafe",
  "coffee_shop",
  "coffee shop",
  "bakery",
  "bar",
  "fast_food",
  "fast food",
  "food_delivery",
  "food delivery",
  "meal_takeaway",
  "meal takeaway",
  "meal_delivery",
  "meal delivery",
  "diner",
  "steak_house",
  "steak house",
  "seafood_restaurant",
  "seafood restaurant",
  "indian_restaurant",
  "indian restaurant",
  "chinese_restaurant",
  "chinese restaurant",
  "italian_restaurant",
  "italian restaurant",
  "british_restaurant",
  "british restaurant",
  "takeaway",
  "bistro",
  "brasserie",
  "sushi",
  "taco",
  "grill",
  "food truck",
];

const agencySignals = [
  "marketing",
  "advertising",
  "digital agency",
  "seo",
  "web design",
  "creative agency",
  "branding",
  "media agency",
  "lead generation",
  "consulting",
  "consultant",
  "agency",
];

const localServiceSignals = [
  "plumber",
  "electrician",
  "roofing",
  "hvac",
  "cleaning",
  "landscaping",
  "lawyer",
  "dentist",
  "salon",
  "spa",
  "gym",
  "clinic",
  "contractor",
  "repair",
  "local service",
];

function normalize(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesSignal(text: string, signals: string[]) {
  const normalizedText = ` ${normalize(text)} `;

  return signals.some((signal) => normalizedText.includes(` ${normalize(signal)} `));
}

function strongLeadText(lead: Lead) {
  return [lead.industry, lead.source_url, lead.description, lead.raw_metadata?.query, lead.raw_metadata?.category]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join(" ");
}

function weakLeadText(lead: Lead) {
  return [lead.company_name, lead.location]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join(" ");
}

export function isRestaurantSearchText(value?: string | null) {
  return includesSignal(value ?? "", restaurantSignals);
}

export function isAgencyLead(lead: Lead) {
  return includesSignal(`${strongLeadText(lead)} ${weakLeadText(lead)}`, agencySignals);
}

export function isRestaurantLead(lead: Lead) {
  const strongText = strongLeadText(lead);

  if (includesSignal(strongText, restaurantSignals)) {
    return true;
  }

  if (isAgencyLead(lead)) {
    return false;
  }

  return includesSignal(weakLeadText(lead), restaurantSignals);
}

export function isLocalServiceLead(lead: Lead) {
  return includesSignal(`${strongLeadText(lead)} ${weakLeadText(lead)}`, localServiceSignals);
}

const deliveryStatusKeys = [
  "delivery_ubereats_status",
  "delivery_doordash_status",
  "delivery_grubhub_status",
  "delivery_deliveroo_status",
  "delivery_justeat_status",
] as const;

const deliveryUrlKeys = [
  "delivery_ubereats_menu_url",
  "delivery_doordash_menu_url",
  "delivery_grubhub_menu_url",
  "delivery_deliveroo_menu_url",
  "delivery_justeat_menu_url",
] as const;

export function hasMeaningfulRestaurantIntelligence(lead: Lead) {
  const checkedPlatform = deliveryStatusKeys.some((key) => {
    const status = lead[key];
    return Boolean(status && status !== "not_checked");
  });

  if (checkedPlatform) {
    return true;
  }

  const storedListingUrl = deliveryUrlKeys.some((key) => {
    const value = lead[key]?.trim();
    if (!value || !/^https?:\/\//i.test(value)) return false;
    try {
      normalizePublicHttpUrl(value);
      return true;
    } catch {
      return false;
    }
  });

  if (storedListingUrl) {
    return true;
  }

  return Boolean(
    isRestaurantLead(lead) &&
      lead.restaurant_enrichment_status &&
      lead.restaurant_enrichment_status !== "not_checked",
  );
}
