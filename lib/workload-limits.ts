export const WORKLOAD_LIMITS = {
  nicheSearch: {
    maxRequestedLeads: 50,
    maxPlacesPages: 3,
    maxDetailsCalls: 0,
    providerConcurrency: 1,
  },
  cityScan: {
    maxZones: 24,
    maxCategorySearches: 46,
    maxProviderCalls: 48,
    cityResolutionCalls: 2,
    maxRequestedOpportunities: 100,
    providerConcurrency: 2,
    maxActivePerUser: 1,
    stateTtlSeconds: 60 * 60,
    staleAfterMs: 10 * 60 * 1_000,
    batchLockSeconds: 45,
  },
  websiteResearch: {
    maxRedirects: 3,
    maxResponseBytes: 350_000,
    maxPages: 10,
    requestTimeoutMs: 8_000,
    maxDurationMs: 50_000,
  },
  restaurantEnrichment: {
    maxLeadsPerRequest: 50,
    maxConcurrency: 5,
  },
  exports: {
    maxRows: 10_000,
    maxSelectedIds: 500,
    googleSheetsBatchRows: 500,
    maxCellLength: 20_000,
  },
} as const;

export type CityScanWorkloadEstimate = {
  zones: number;
  categorySearches: number;
  maxPlacesRequests: number;
  possibleDetailsRequests: number;
  requestedOpportunities: number;
};

export function estimateCityScanWorkload(input: {
  zones: number;
  categorySearches: number;
  requestedOpportunities: number;
}): CityScanWorkloadEstimate {
  return {
    zones: Math.min(Math.max(Math.floor(input.zones), 0), WORKLOAD_LIMITS.cityScan.maxZones),
    categorySearches: Math.min(
      Math.max(Math.floor(input.categorySearches), 0),
      WORKLOAD_LIMITS.cityScan.maxCategorySearches,
    ),
    maxPlacesRequests: Math.min(
      WORKLOAD_LIMITS.cityScan.maxProviderCalls,
      WORKLOAD_LIMITS.cityScan.cityResolutionCalls + Math.max(Math.floor(input.categorySearches), 0),
    ),
    possibleDetailsRequests: WORKLOAD_LIMITS.nicheSearch.maxDetailsCalls,
    requestedOpportunities: Math.min(
      Math.max(Math.floor(input.requestedOpportunities), 0),
      WORKLOAD_LIMITS.cityScan.maxRequestedOpportunities,
    ),
  };
}
