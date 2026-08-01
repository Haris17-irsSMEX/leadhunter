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
  completeEnrichment: {
    maxLeadIdsPerBulkRequest: 5,
    batchConcurrency: 2,
    maxActivePerUser: 3,
    activeLockSeconds: 10 * 60,
    staleAfterMs: 15 * 60 * 1_000,
    freshnessMs: 7 * 24 * 60 * 60 * 1_000,
    forceRefreshCooldownSeconds: 5 * 60,
    rateLimitWindowSeconds: 15 * 60,
    rateLimitLeads: 60,
    maxPagesPerLead: 10,
    maxTotalPagesPerBulkRequest: 50,
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
  optionalEnrichmentLeads: number;
};

export function estimateCityScanWorkload(input: {
  zones: number;
  categorySearches: number;
  requestedOpportunities: number;
  completeEnrichment: boolean;
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
    optionalEnrichmentLeads: input.completeEnrichment
      ? Math.min(
          Math.max(Math.floor(input.requestedOpportunities), 0),
          WORKLOAD_LIMITS.completeEnrichment.maxLeadIdsPerBulkRequest,
        )
      : 0,
  };
}

export function estimateCompleteEnrichmentWorkload(leadCount: number) {
  const leads = Math.min(
    Math.max(Math.floor(leadCount), 0),
    WORKLOAD_LIMITS.completeEnrichment.maxLeadIdsPerBulkRequest,
  );
  return {
    leads,
    websites: leads,
    maxWebsitePages: Math.min(
      leads * WORKLOAD_LIMITS.completeEnrichment.maxPagesPerLead,
      WORKLOAD_LIMITS.completeEnrichment.maxTotalPagesPerBulkRequest,
    ),
    maxPublicSearchLookups: leads,
  };
}
