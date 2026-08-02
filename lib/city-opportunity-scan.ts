import "server-only";

import type { User } from "@supabase/supabase-js";
import { getAllowedUserIds } from "@/lib/auth";
import {
  getCityScanTypePacks,
  type CityScanCategoryGroupId,
} from "@/lib/city-scan-categories";
import { generateCityScanZones, isPointInsideBounds, type CityScanZone } from "@/lib/city-scan-grid";
import { insertJob, updateJob } from "@/lib/db";
import { googleMapsDedupeKeys, normalizeGoogleMapsText, saveGoogleMapsLeads } from "@/lib/google-maps-leads";
import { getCategorySummary } from "@/lib/lead-category";
import { logWorkflowEvent } from "@/lib/operational-errors";
import { redis } from "@/lib/redis";
import { withRetry } from "@/lib/retry-policy";
import {
  GooglePlacesProviderError,
  resolveGoogleCityWithMeta,
  searchGooglePlacesNearbyWithMeta,
  type GoogleCitySuggestion,
  type GoogleGeoPoint,
  type GoogleNearbyPlace,
  type ResolvedGoogleCity,
} from "@/lib/sgai";
import type { Lead } from "@/lib/types";
import { getUsageSummary, MonthlyLimitError, type UsageSummary } from "@/lib/usage";
import {
  estimateCityScanWorkload,
  type CityScanWorkloadEstimate,
  WORKLOAD_LIMITS,
} from "@/lib/workload-limits";

export type CityScanStatus = "processing" | "complete" | "partial" | "cancelled" | "failed";

type CityScanTask = {
  id: string;
  zone: CityScanZone;
  types: string[];
  groupIds: CityScanCategoryGroupId[];
  status: "pending" | "completed" | "failed";
  attempts: number;
  errorCode?: string;
};

type SeenPlace = {
  name: string;
  point: GoogleGeoPoint;
};

export type CityScanCoverage = {
  zonesPlanned: number;
  zonesCompleted: number;
  categoryGroupsSelected: number;
  categoryGroupsSearched: number;
  providerCalls: number;
  providerCallCap: number;
  businessesChecked: number;
  websiteListedFiltered: number;
  unavailableWebsiteStatus: number;
  unusableFiltered: number;
  outsideBoundaryFiltered: number;
  duplicatesRemoved: number;
  newLeadsSaved: number;
  alreadyInWorkspace: number;
  opportunitiesFound: number;
  failedTasks: number;
  cacheHits: number;
  cacheMisses: number;
  retries: number;
  providerFailures: number;
};

export type CityScanState = {
  id: string;
  userId: string;
  status: CityScanStatus;
  city: ResolvedGoogleCity;
  categoryGroupIds: CityScanCategoryGroupId[];
  requestedOpportunities: number;
  tasks: CityScanTask[];
  resultLeadIds: string[];
  resultStatuses: Record<string, Lead["scrape_status"]>;
  seenKeys: string[];
  seenPlaces: SeenPlace[];
  warnings: string[];
  coverage: CityScanCoverage;
  workload: CityScanWorkloadEstimate;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type CityScanPublicResult = {
  jobId: string;
  status: CityScanStatus;
  city: Pick<ResolvedGoogleCity, "name" | "label" | "country">;
  requested: number;
  coverage: CityScanCoverage;
  leads: Lead[];
  warnings: string[];
  canRetry: boolean;
  workload: CityScanWorkloadEstimate;
};

const memoryStates = new Map<string, CityScanState>();
const memoryActiveScans = new Map<string, string>();
const memoryBatchLocks = new Set<string>();

function stateKey(id: string) {
  return `city-scan:state:${id}`;
}

function activeKey(userId: string) {
  return `city-scan:active:${userId}`;
}

function batchKey(id: string) {
  return `city-scan:batch:${id}`;
}

async function saveState(state: CityScanState) {
  state.updatedAt = new Date().toISOString();
  memoryStates.set(state.id, state);
  if (redis) {
    try {
      await redis.set(stateKey(state.id), JSON.stringify(state), { ex: WORKLOAD_LIMITS.cityScan.stateTtlSeconds });
    } catch {
      logWorkflowEvent("city-scan", "state cache unavailable", { jobId: state.id });
    }
  }
}

async function loadState(id: string) {
  let state: CityScanState | null = null;
  if (redis) {
    try {
      const stored = await redis.get<string>(stateKey(id));
      if (stored) state = (typeof stored === "string" ? JSON.parse(stored) : stored) as CityScanState;
    } catch {
      // The in-process state remains available for the current server instance.
    }
  }
  state ??= memoryStates.get(id) ?? null;
  if (!state) return null;
  state.updatedAt ||= state.startedAt;
  state.coverage.cacheHits ??= 0;
  state.coverage.cacheMisses ??= 0;
  state.coverage.retries ??= 0;
  state.coverage.providerFailures ??= 0;
  state.workload ??= estimateCityScanWorkload({
    zones: state.coverage.zonesPlanned,
    categorySearches: state.tasks.length,
    requestedOpportunities: state.requestedOpportunities,
  });
  return state;
}

async function acquireActiveScan(userId: string, id: string) {
  if (redis) {
    try {
      const result = await redis.set(activeKey(userId), id, { ex: WORKLOAD_LIMITS.cityScan.stateTtlSeconds, nx: true });
      return result === "OK";
    } catch {
      // Fall through to the bounded in-process lock.
    }
  }
  if (memoryActiveScans.has(userId)) return false;
  memoryActiveScans.set(userId, id);
  return true;
}

async function releaseActiveScan(userId: string, id: string) {
  if (redis) {
    try {
      const active = await redis.get<string>(activeKey(userId));
      if (active === id) await redis.del(activeKey(userId));
    } catch {
      // The Redis lock expires automatically.
    }
  }
  if (memoryActiveScans.get(userId) === id) memoryActiveScans.delete(userId);
}

async function acquireBatchLock(id: string) {
  if (redis) {
    try {
      return (await redis.set(batchKey(id), "1", { ex: WORKLOAD_LIMITS.cityScan.batchLockSeconds, nx: true })) === "OK";
    } catch {
      // Fall through to the bounded in-process lock.
    }
  }
  if (memoryBatchLocks.has(id)) return false;
  memoryBatchLocks.add(id);
  return true;
}

async function releaseBatchLock(id: string) {
  if (redis) {
    try {
      await redis.del(batchKey(id));
    } catch {
      // The Redis lock expires automatically.
    }
  }
  memoryBatchLocks.delete(id);
}

export class CityScanError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly extra?: { suggestions?: GoogleCitySuggestion[]; usage?: UsageSummary },
  ) {
    super(message);
    this.name = "CityScanError";
  }
}

function providerErrorCode(error: unknown) {
  if (!(error instanceof GooglePlacesProviderError)) return "unknown_error";
  if (error.httpStatus === 429 || error.providerStatus === "RESOURCE_EXHAUSTED") return "provider_quota";
  if (error.providerStatus === "TIMEOUT") return "provider_timeout";
  if (error.httpStatus === 401 || error.httpStatus === 403 || error.stage === "configuration") return "configuration_error";
  if ([400, 404, 422].includes(error.httpStatus) || error.providerStatus === "INVALID_ARGUMENT") return "invalid_request";
  return "provider_unavailable";
}

function isRetryableTask(task: CityScanTask) {
  return (
    task.status === "failed" &&
    task.attempts < 3 &&
    ["provider_timeout", "provider_unavailable", "provider_quota", "stale_job"].includes(task.errorCode ?? "")
  );
}

function pointDistanceMeters(a: GoogleGeoPoint, b: GoogleGeoPoint) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function scanDedupeKeys(place: GoogleNearbyPlace) {
  const keys = [`place:${place.id}`];
  const phone = place.nationalPhoneNumber?.replace(/\D/g, "") ?? "";
  const name = normalizeGoogleMapsText(place.name);
  const address = normalizeGoogleMapsText(place.formattedAddress);
  if (phone.length >= 7) keys.push(`phone:${phone}`);
  if (name && address) keys.push(`name-address:${name}|${address}`);
  return keys;
}

function isDuplicatePlace(state: CityScanState, place: GoogleNearbyPlace) {
  const keys = scanDedupeKeys(place);
  if (keys.some((key) => state.seenKeys.includes(key))) return true;
  const normalizedName = normalizeGoogleMapsText(place.name);
  return state.seenPlaces.some(
    (seen) => seen.name === normalizedName && pointDistanceMeters(seen.point, place.location) <= 150,
  );
}

function rememberPlace(state: CityScanState, place: GoogleNearbyPlace) {
  state.seenKeys.push(...scanDedupeKeys(place));
  state.seenKeys = [...new Set(state.seenKeys)];
  state.seenPlaces.push({ name: normalizeGoogleMapsText(place.name), point: place.location });
}

function validWebsite(value?: string) {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function opportunityScore(place: GoogleNearbyPlace) {
  let score = 40;
  if (place.nationalPhoneNumber) score += 25;
  if (place.businessStatus === "OPERATIONAL") score += 15;
  if (typeof place.rating === "number") score += 5;
  if ((place.userRatingCount ?? 0) >= 5) score += 10;
  if (place.primaryType || place.types.length) score += 5;
  return Math.min(100, score);
}

function opportunityStrength(score: number) {
  if (score >= 85) return "Strong";
  if (score >= 65) return "Good";
  return "Needs research";
}

function placeToLead(place: GoogleNearbyPlace, state: CityScanState, task: CityScanTask): Lead {
  const industry = [place.primaryType, ...place.types]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(", ");
  const score = opportunityScore(place);
  return {
    company_name: place.name,
    phone: place.nationalPhoneNumber,
    location: place.formattedAddress,
    country: state.city.country,
    industry,
    source: "google_maps",
    source_url: place.googleMapsUri || "https://www.google.com/maps",
    source_external_id: place.id,
    job_id: state.id,
    description: `No website is listed on this business's Google Maps profile.`,
    raw_metadata: {
      google_place_id: place.id,
      business_status: place.businessStatus,
      types: place.types,
      primary_type: place.primaryType,
      primary_type_display_name: place.primaryTypeDisplayName,
      rating: place.rating,
      user_rating_count: place.userRatingCount,
      google_maps_url: place.googleMapsUri,
      location: place.location,
      website_status: "no_website_listed",
      city_scan: {
        normalized_city: state.city.label,
        category_groups: task.groupIds,
        zone_id: task.zone.id,
        opportunity_score: score,
        opportunity_strength: opportunityStrength(score),
        category: getCategorySummary(industry) || place.primaryTypeDisplayName || "Local business",
      },
    },
  };
}

function leadOpportunityScore(lead: Lead) {
  const metadata = lead.raw_metadata?.city_scan;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return 0;
  const value = "opportunity_score" in metadata ? metadata.opportunity_score : undefined;
  return typeof value === "number" ? value : 0;
}

function computeCoverage(state: CityScanState) {
  const completedZoneIds = new Set(
    state.tasks
      .map((task) => task.zone.id)
      .filter((zoneId) => state.tasks.filter((task) => task.zone.id === zoneId).every((task) => task.status !== "pending")),
  );
  const searchedGroups = new Set(
    state.tasks.filter((task) => task.status === "completed").flatMap((task) => task.groupIds),
  );
  state.coverage.zonesCompleted = completedZoneIds.size;
  state.coverage.categoryGroupsSearched = searchedGroups.size;
  state.coverage.failedTasks = state.tasks.filter((task) => task.status === "failed").length;
}

async function fetchLeadsForState(state: CityScanState, userId: string) {
  if (!state.resultLeadIds.length) return [];
  const { getSupabaseServiceClient } = await import("@/lib/db");
  const { data, error } = await getSupabaseServiceClient()
    .from("leads")
    .select("*")
    .eq("user_id", userId)
    .in("id", state.resultLeadIds);
  if (error) throw new Error(error.message);
  const order = new Map(state.resultLeadIds.map((id, index) => [id, index]));
  return ((data ?? []) as Lead[])
    .map((lead) => ({ ...lead, scrape_status: state.resultStatuses?.[lead.id ?? ""] }))
    .sort((a, b) => (order.get(a.id ?? "") ?? 0) - (order.get(b.id ?? "") ?? 0));
}

async function publicResult(state: CityScanState): Promise<CityScanPublicResult> {
  return {
    jobId: state.id,
    status: state.status,
    city: { name: state.city.name, label: state.city.label, country: state.city.country },
    requested: state.requestedOpportunities,
    coverage: state.coverage,
    leads: await fetchLeadsForState(state, state.userId),
    warnings: state.warnings,
    canRetry:
      state.coverage.providerCalls < state.coverage.providerCallCap &&
      state.tasks.some(isRetryableTask),
    workload: state.workload,
  };
}

function isStale(state: CityScanState) {
  const timestamp = new Date(state.updatedAt || state.startedAt).getTime();
  return state.status === "processing" && Number.isFinite(timestamp) && Date.now() - timestamp > WORKLOAD_LIMITS.cityScan.staleAfterMs;
}

async function recoverStaleState(state: CityScanState) {
  if (!isStale(state)) return false;
  state.warnings.push("The previous scan was interrupted. Completed results were preserved and retry is available.");
  state.tasks.filter((task) => task.status === "pending").forEach((task) => {
    task.status = "failed";
    task.errorCode = "stale_job";
  });
  await finishState(state, state.resultLeadIds.length ? "partial" : "failed");
  logWorkflowEvent("city-scan", "stale job recovered", {
    jobId: state.id,
    results: state.resultLeadIds.length,
    providerCalls: state.coverage.providerCalls,
  });
  return true;
}

async function recoverUserActiveScan(userId: string) {
  let activeId = memoryActiveScans.get(userId) ?? null;
  if (redis) {
    try {
      activeId = (await redis.get<string>(activeKey(userId))) ?? activeId;
    } catch {
      // Continue with the in-process active scan when Redis is unavailable.
    }
  }
  if (!activeId) return;
  const state = await loadState(String(activeId));
  if (!state) {
    await releaseActiveScan(userId, String(activeId));
    return;
  }
  if (state.status !== "processing") {
    await releaseActiveScan(userId, state.id);
    return;
  }
  await recoverStaleState(state);
}

async function finishState(state: CityScanState, status: CityScanStatus) {
  state.status = status;
  state.completedAt = new Date().toISOString();
  computeCoverage(state);
  await saveState(state);
  try {
    await updateJob(
      state.id,
      {
        status: status === "failed" ? "failed" : "done",
        results_count: state.resultLeadIds.length,
        error: status === "partial" ? "Some city scan areas could not be completed." : status === "cancelled" ? "Cancelled by user." : undefined,
        completed_at: state.completedAt,
      },
      state.userId,
    );
  } finally {
    await releaseActiveScan(state.userId, state.id);
  }
}

export async function startCityOpportunityScan(
  user: Pick<User, "id" | "email">,
  input: {
    city: string;
    cityPlaceId?: string;
    categoryGroupIds: CityScanCategoryGroupId[];
    requestedOpportunities: number;
  },
) {
  const cityInput = input.city.trim();
  if (!cityInput || cityInput.length > 160) {
    throw new CityScanError("We could not identify that city. Include the region or country and try again.", "invalid_city", 400);
  }
  if (!input.categoryGroupIds.length) {
    throw new CityScanError("Select at least one supported category group.", "invalid_request", 400);
  }
  const requested = Math.floor(input.requestedOpportunities);
  if (!Number.isFinite(requested) || requested < 1 || requested > WORKLOAD_LIMITS.cityScan.maxRequestedOpportunities) {
    throw new CityScanError("Maximum opportunities must be between 1 and 100.", "invalid_request", 400);
  }

  const usage = await getUsageSummary(user);
  if (!usage.isAdmin && usage.remaining <= 0) throw new MonthlyLimitError(usage);
  if (!usage.isAdmin && requested > usage.remaining) {
    throw new CityScanError(
      `This scan requests ${requested} opportunities, but your plan has ${usage.remaining} remaining this month.`,
      "scan_limit_exceeded",
      400,
      { usage },
    );
  }

  await recoverUserActiveScan(user.id);
  const id = crypto.randomUUID();
  if (!(await acquireActiveScan(user.id, id))) {
    throw new CityScanError(
      "A city scan is already running. Stop it or wait for it to finish before starting another.",
      "scan_already_active",
      409,
    );
  }

  try {
    let city: ResolvedGoogleCity;
    let cityResolutionProviderCalls = 0;
    let cityResolutionCached = false;
    try {
      const resolution = await resolveGoogleCityWithMeta(cityInput, input.cityPlaceId);
      city = resolution.value;
      cityResolutionProviderCalls = resolution.providerCalls;
      cityResolutionCached = resolution.cached;
    } catch (error) {
      if (error && typeof error === "object" && "suggestions" in error) {
        throw new CityScanError(
          "Several cities match that name. Choose the correct city to continue.",
          "ambiguous_city",
          409,
          { suggestions: (error as { suggestions: GoogleCitySuggestion[] }).suggestions },
        );
      }
      if (error instanceof GooglePlacesProviderError && error.providerStatus === "CITY_NOT_FOUND") {
        throw new CityScanError("We could not identify that city. Include the region or country and try again.", "city_not_found", 404);
      }
      if (error instanceof GooglePlacesProviderError && error.providerStatus === "UNSUPPORTED_AREA") {
        throw new CityScanError("That location is not a supported city scan area.", "unsupported_area", 400);
      }
      throw error;
    }

    const zones = generateCityScanZones(city.bounds);
    const packs = getCityScanTypePacks(input.categoryGroupIds);
    if (!packs.length) throw new CityScanError("No supported business categories were selected.", "invalid_request", 400);
    const nearbyCallBudget = WORKLOAD_LIMITS.cityScan.maxCategorySearches;
    const usableZones = zones.slice(
      0,
      Math.min(WORKLOAD_LIMITS.cityScan.maxZones, Math.max(1, Math.floor(nearbyCallBudget / packs.length))),
    );
    const tasks: CityScanTask[] = usableZones.flatMap((zone) =>
      packs.map((pack, index) => ({
        id: `${zone.id}-p${index + 1}`,
        zone,
        types: pack.types,
        groupIds: pack.groupIds,
        status: "pending" as const,
        attempts: 0,
      })),
    ).slice(0, nearbyCallBudget);
    const workload = estimateCityScanWorkload({
      zones: usableZones.length,
      categorySearches: tasks.length,
      requestedOpportunities: requested,
    });
    const now = new Date().toISOString();
    const state: CityScanState = {
      id,
      userId: user.id,
      status: "processing",
      city,
      categoryGroupIds: input.categoryGroupIds,
      requestedOpportunities: Math.min(requested, WORKLOAD_LIMITS.cityScan.maxRequestedOpportunities),
      tasks,
      resultLeadIds: [],
      resultStatuses: {},
      seenKeys: [],
      seenPlaces: [],
      warnings: [],
      coverage: {
        zonesPlanned: usableZones.length,
        zonesCompleted: 0,
        categoryGroupsSelected: input.categoryGroupIds.length,
        categoryGroupsSearched: 0,
        providerCalls: cityResolutionProviderCalls,
        providerCallCap: WORKLOAD_LIMITS.cityScan.maxProviderCalls,
        businessesChecked: 0,
        websiteListedFiltered: 0,
        unavailableWebsiteStatus: 0,
        unusableFiltered: 0,
        outsideBoundaryFiltered: 0,
        duplicatesRemoved: 0,
        newLeadsSaved: 0,
        alreadyInWorkspace: 0,
        opportunitiesFound: 0,
        failedTasks: 0,
        cacheHits: cityResolutionCached ? 1 : 0,
        cacheMisses: cityResolutionCached ? 0 : 1,
        retries: 0,
        providerFailures: 0,
      },
      workload,
      startedAt: now,
      updatedAt: now,
    };
    await insertJob(
      {
        id,
        status: "processing",
        source_type: "city_opportunity_scan",
        results_count: 0,
        created_at: state.startedAt,
      },
      user.id,
    );
    await saveState(state);
    logWorkflowEvent("city-scan", "started", {
      jobId: id,
      city: city.label,
      zones: usableZones.length,
      categoryGroups: input.categoryGroupIds.length,
      providerCallsPlanned: workload.maxPlacesRequests,
      cacheHit: cityResolutionCached,
    });
    return publicResult(state);
  } catch (error) {
    await releaseActiveScan(user.id, id);
    throw error;
  }
}

async function searchTask(state: CityScanState, task: CityScanTask) {
  const maxRetries = Math.max(0, Math.min(1, 2 - task.attempts));
  return withRetry(async () => {
    if (state.coverage.providerCalls >= state.coverage.providerCallCap) {
      throw new CityScanError("The bounded provider-call limit was reached.", "scan_limit_reached", 409);
    }
    task.attempts += 1;
    state.coverage.providerCalls += 1;
    try {
      const result = await searchGooglePlacesNearbyWithMeta(task.types, task.zone.center, task.zone.radiusMeters);
      if (result.cached) {
        state.coverage.providerCalls = Math.max(0, state.coverage.providerCalls - 1);
        state.coverage.cacheHits += 1;
      } else {
        state.coverage.cacheMisses += 1;
      }
      return result.value;
    } catch (error) {
      state.coverage.providerFailures += 1;
      throw error;
    }
  }, {
    maxRetries,
    shouldStop: async () => (await loadState(state.id))?.status === "cancelled",
    onRetry: () => {
      state.coverage.retries += 1;
    },
  });
}

export async function processCityOpportunityScanBatch(user: Pick<User, "id" | "email">, id: string) {
  const state = await loadState(id);
  if (!state || state.userId !== user.id) throw new CityScanError("City scan not found.", "scan_not_found", 404);
  if (await recoverStaleState(state)) return publicResult(state);
  if (state.status !== "processing") return publicResult(state);
  if (!(await acquireBatchLock(id))) throw new CityScanError("This scan batch is already processing.", "scan_busy", 409);

  try {
    const usage = await getUsageSummary(user);
    if (!usage.isAdmin && usage.remaining <= 0) {
      state.warnings.push("The scan stopped because your monthly lead allowance was reached. Completed results were preserved.");
      await finishState(state, state.resultLeadIds.length ? "partial" : "failed");
      return publicResult(state);
    }

    const pending = state.tasks
      .filter((task) => task.status === "pending")
      .slice(0, WORKLOAD_LIMITS.cityScan.providerConcurrency);
    if (!pending.length || state.resultLeadIds.length >= state.requestedOpportunities) {
      const hasFailures = state.tasks.some((task) => task.status === "failed");
      await finishState(state, hasFailures ? "partial" : "complete");
      return publicResult(state);
    }
    if (state.coverage.providerCalls >= state.coverage.providerCallCap) {
      state.warnings.push("The bounded provider-call limit was reached. Completed results were preserved.");
      await finishState(state, "partial");
      return publicResult(state);
    }

    const results = await Promise.allSettled(pending.map((task) => searchTask(state, task)));
    const latestState = await loadState(id);
    if (latestState?.status === "cancelled") return publicResult(latestState);
    const candidates: Lead[] = [];
    let providerQuotaReached = false;
    results.forEach((result, index) => {
      const task = pending[index];
      if (result.status === "rejected") {
        task.status = "failed";
        task.errorCode = providerErrorCode(result.reason);
        if (task.errorCode === "provider_quota") providerQuotaReached = true;
        state.warnings.push(
          task.errorCode === "provider_quota"
            ? "City scanning is temporarily unavailable because the location-data limit was reached. Discovered results were preserved."
            : "Some areas could not be scanned. Results from completed areas were preserved.",
        );
        return;
      }

      task.status = "completed";
      for (const place of result.value) {
        state.coverage.businessesChecked += 1;
        if (!isPointInsideBounds(place.location, state.city.bounds)) {
          state.coverage.outsideBoundaryFiltered += 1;
          continue;
        }
        if (place.businessStatus === "CLOSED_PERMANENTLY" || place.businessStatus === "CLOSED_TEMPORARILY") {
          state.coverage.unusableFiltered += 1;
          continue;
        }
        if (!place.types.some((type) => task.types.includes(type))) {
          state.coverage.unusableFiltered += 1;
          continue;
        }
        if (!place.websiteFieldRequested) {
          state.coverage.unavailableWebsiteStatus += 1;
          continue;
        }
        if (place.websiteUri) {
          if (validWebsite(place.websiteUri)) state.coverage.websiteListedFiltered += 1;
          else state.coverage.unavailableWebsiteStatus += 1;
          continue;
        }
        if (isDuplicatePlace(state, place)) {
          state.coverage.duplicatesRemoved += 1;
          continue;
        }
        rememberPlace(state, place);
        candidates.push(placeToLead(place, state, task));
      }
    });

    const remainingSlots = Math.max(0, state.requestedOpportunities - state.resultLeadIds.length);
    const rankedCandidates = candidates.sort((a, b) => leadOpportunityScore(b) - leadOpportunityScore(a)).slice(0, remainingSlots);
    if (rankedCandidates.length) {
      const saved = await saveGoogleMapsLeads(rankedCandidates, user, getAllowedUserIds(user), { proximityDedupe: true });
      for (const lead of saved.leads) {
        if (lead.id && !state.resultLeadIds.includes(lead.id)) state.resultLeadIds.push(lead.id);
        if (lead.id) state.resultStatuses[lead.id] = lead.scrape_status;
      }
      state.coverage.duplicatesRemoved += saved.skippedDuplicates;
      state.coverage.newLeadsSaved += saved.inserted.length;
      state.coverage.alreadyInWorkspace += saved.skippedDuplicates;
      state.warnings.push(...saved.warnings);
      state.coverage.opportunitiesFound = state.resultLeadIds.length;
    }

    state.warnings = [...new Set(state.warnings)];
    computeCoverage(state);
    const done = providerQuotaReached || state.resultLeadIds.length >= state.requestedOpportunities || !state.tasks.some((task) => task.status === "pending");
    if (done) {
      const hasFailures = providerQuotaReached || state.tasks.some((task) => task.status === "failed");
      await finishState(state, hasFailures ? "partial" : "complete");
    } else {
      await saveState(state);
      await updateJob(id, { results_count: state.resultLeadIds.length }, user.id);
    }
    return publicResult(state);
  } catch (error) {
    if (error instanceof MonthlyLimitError) {
      state.warnings.push("The scan stopped because your monthly lead allowance was reached. Completed results were preserved.");
      await finishState(state, state.resultLeadIds.length ? "partial" : "failed");
      return publicResult(state);
    }

    if (state.status === "processing") {
      state.warnings.push("The scan stopped unexpectedly. Completed results were preserved.");
      await finishState(state, state.resultLeadIds.length ? "partial" : "failed");
    }
    throw error;
  } finally {
    await releaseBatchLock(id);
  }
}

export async function getCityOpportunityScan(user: Pick<User, "id">, id: string) {
  const state = await loadState(id);
  if (!state || state.userId !== user.id) throw new CityScanError("City scan not found.", "scan_not_found", 404);
  await recoverStaleState(state);
  return publicResult(state);
}

export async function cancelCityOpportunityScan(user: Pick<User, "id">, id: string) {
  const state = await loadState(id);
  if (!state || state.userId !== user.id) throw new CityScanError("City scan not found.", "scan_not_found", 404);
  if (state.status === "processing") await finishState(state, "cancelled");
  return publicResult(state);
}

export async function retryCityOpportunityScan(user: Pick<User, "id">, id: string) {
  const state = await loadState(id);
  if (!state || state.userId !== user.id) throw new CityScanError("City scan not found.", "scan_not_found", 404);
  if (state.coverage.providerCalls >= state.coverage.providerCallCap) {
    throw new CityScanError("The bounded provider-call limit was reached. Completed results were preserved.", "scan_limit_reached", 409);
  }
  const retryable = state.tasks.filter(isRetryableTask);
  if (!retryable.length) throw new CityScanError("No failed scan areas are available to retry.", "invalid_request", 400);
  if (!(await acquireActiveScan(user.id, id))) {
    throw new CityScanError("A city scan is already running. Stop it or wait for it to finish before starting another.", "scan_already_active", 409);
  }
  retryable.forEach((task) => {
    task.status = "pending";
    task.errorCode = undefined;
  });
  state.status = "processing";
  state.completedAt = undefined;
  await updateJob(id, { status: "processing", error: undefined, completed_at: undefined }, user.id);
  await saveState(state);
  return publicResult(state);
}
