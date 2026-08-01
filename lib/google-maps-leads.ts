import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabaseServiceClient, withScrapedAt } from "@/lib/db";
import type { Lead } from "@/lib/types";
import { getUsageSummary, MonthlyLimitError } from "@/lib/usage";

export function normalizeGoogleMapsText(value?: string) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function normalizePhone(value?: string) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 7 ? digits : "";
}

function normalizeWebsite(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return `${url.hostname.replace(/^www\./i, "").toLowerCase()}${url.pathname.replace(/\/+$/, "")}`.replace(/\/$/, "");
  } catch {
    return trimmed.toLowerCase().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
  }
}

export function googleMapsDedupeKeys(lead: Lead) {
  const keys: string[] = [];
  const placeId = lead.source_external_id?.trim() ||
    (typeof lead.raw_metadata?.google_place_id === "string" ? lead.raw_metadata.google_place_id : "");
  const website = normalizeWebsite(lead.website);
  const phone = normalizePhone(lead.phone);
  const name = normalizeGoogleMapsText(lead.company_name);
  const location = normalizeGoogleMapsText(lead.location);

  if (placeId) keys.push(`place:${placeId}`);
  if (website) keys.push(`website:${website}`);
  if (phone) keys.push(`phone:${phone}`);
  if (name && location) keys.push(`name-location:${name}|${location}`);
  return keys;
}

function leadPoint(lead: Lead) {
  const location = lead.raw_metadata?.location;
  if (!location || typeof location !== "object" || Array.isArray(location)) return null;
  const latitude = "latitude" in location ? location.latitude : undefined;
  const longitude = "longitude" in location ? location.longitude : undefined;
  return typeof latitude === "number" && typeof longitude === "number" ? { latitude, longitude } : null;
}

function distanceMeters(a: NonNullable<ReturnType<typeof leadPoint>>, b: NonNullable<ReturnType<typeof leadPoint>>) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function isProximityDuplicate(a: Lead, b: Lead) {
  if (!normalizeGoogleMapsText(a.company_name) || normalizeGoogleMapsText(a.company_name) !== normalizeGoogleMapsText(b.company_name)) {
    return false;
  }
  const aPoint = leadPoint(a);
  const bPoint = leadPoint(b);
  return Boolean(aPoint && bPoint && distanceMeters(aPoint, bPoint) <= 150);
}

function restaurantEnrichmentUpdate(lead: Lead) {
  const update: Partial<Lead> = {};
  const directFields: Array<keyof Lead> = [
    "email",
    "email_source_url",
    "email_confidence",
    "delivery_ubereats_status",
    "delivery_ubereats_menu_url",
    "delivery_ubereats_confidence",
    "delivery_doordash_status",
    "delivery_doordash_menu_url",
    "delivery_doordash_confidence",
    "delivery_grubhub_status",
    "delivery_grubhub_menu_url",
    "delivery_grubhub_confidence",
    "delivery_deliveroo_status",
    "delivery_deliveroo_menu_url",
    "delivery_deliveroo_confidence",
    "delivery_justeat_status",
    "delivery_justeat_menu_url",
    "delivery_justeat_confidence",
    "restaurant_enrichment_status",
    "restaurant_enriched_at",
    "raw_metadata",
  ];

  for (const field of directFields) {
    const value = lead[field];
    if (value !== undefined && value !== null && value !== "") {
      (update as Record<string, unknown>)[field] = value;
    }
  }
  return update;
}

async function updateExistingLeadWithEnrichment(existing: Lead, enrichedLead: Lead, allowedUserIds: string[]) {
  if (!existing.id || !enrichedLead.restaurant_enrichment_status || enrichedLead.restaurant_enrichment_status === "not_checked") {
    return { lead: { ...existing, scrape_status: "already_saved" as const } };
  }
  const update = restaurantEnrichmentUpdate(enrichedLead);
  if (existing.email?.trim()) {
    delete update.email;
    delete update.email_source_url;
    delete update.email_confidence;
  }
  if (!Object.keys(update).length) return { lead: { ...existing, scrape_status: "already_saved" as const } };

  const { data, error } = await getSupabaseServiceClient()
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

export async function saveGoogleMapsLeads(
  leads: Lead[],
  user: Pick<User, "id" | "email">,
  allowedUserIds: string[],
  options: { proximityDedupe?: boolean } = {},
) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.from("leads").select("*").eq("source", "google_maps").in("user_id", allowedUserIds);
  if (error) throw new Error(error.message);

  const existingLeads = (data ?? []) as Lead[];
  const existingIndex = new Map<string, Lead>();
  for (const existingLead of existingLeads) {
    for (const key of googleMapsDedupeKeys(existingLead)) existingIndex.set(key, existingLead);
  }

  const inserted: Lead[] = [];
  const duplicates: Lead[] = [];
  const newCandidates: Lead[] = [];
  const warnings: string[] = [];
  for (const lead of leads) {
    const keyedMatch = googleMapsDedupeKeys(lead).map((key) => existingIndex.get(key)).find(Boolean);
    const existing = keyedMatch || (options.proximityDedupe ? existingLeads.find((item) => isProximityDuplicate(item, lead)) : undefined);

    if (existing) {
      const updated = await updateExistingLeadWithEnrichment(existing, lead, allowedUserIds);
      duplicates.push(updated.lead);
      if (updated.warning) warnings.push(updated.warning);
      continue;
    }

    newCandidates.push(lead);
    existingLeads.push(lead);
    for (const key of googleMapsDedupeKeys(lead)) existingIndex.set(key, lead);
  }

  const usage = await getUsageSummary(user);
  const allowedNewCount = usage.isAdmin ? newCandidates.length : Math.min(newCandidates.length, usage.remaining);
  if (newCandidates.length > 0 && allowedNewCount <= 0) throw new MonthlyLimitError(usage);

  for (const lead of newCandidates.slice(0, allowedNewCount)) {
    const { data: insertedLead, error: insertError } = await supabase
      .from("leads")
      .insert(withScrapedAt({ ...lead, user_id: user.id }))
      .select("*")
      .single();
    if (insertError?.code === "23505") {
      duplicates.push({ ...lead, scrape_status: "skipped_duplicate" });
      continue;
    }
    if (insertError) throw new Error(insertError.message);
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
