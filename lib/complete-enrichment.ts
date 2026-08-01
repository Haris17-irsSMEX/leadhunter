import "server-only";

import { PublicApiError } from "@/lib/api-errors";
import { crawlPublicBusinessPages } from "@/lib/crawl4ai-client";
import { getAllowedUserIds } from "@/lib/auth";
import { getCompleteEnrichmentProgress } from "@/lib/complete-enrichment-status";
import { getContactPageUrl } from "@/lib/contactability";
import { attachDecisionMakers } from "@/lib/decision-maker-db";
import { researchLeadDecisionMakers } from "@/lib/decision-maker-service";
import { getSupabaseServiceClient } from "@/lib/db";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import { classifyPublicEmail, getOutreachIntelligence, getPrimaryDecisionMaker } from "@/lib/outreach-intelligence";
import { createPublicWebResearchContext, normalizePublicWebsiteUrl, seedPublicWebResearchPage } from "@/lib/public-web";
import { enrichLeadPublicEmail, hasCurrentPublicEmailResearch } from "@/lib/public-email-service";
import { redis } from "@/lib/redis";
import type { PublicEmailResult } from "@/lib/restaurant-email";
import { logWorkflowEvent, operationalError } from "@/lib/operational-errors";
import { startCooldown } from "@/lib/workload-guards";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";
import type { User } from "@supabase/supabase-js";
import type {
  CompleteEnrichmentOverallStatus,
  CompleteEnrichmentProgress,
  CompleteEnrichmentStepStatus,
  EnrichmentJobStep,
  Lead,
} from "@/lib/types";

type UserIdentity = Pick<User, "id" | "email">;
type EnrichmentLease = { release: () => Promise<void> };

const EMPTY_ENRICHMENT_METRICS = {
  websiteFetches: 0,
  websitePagesFetched: 0,
  publicSearchRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  providerFailures: 0,
  rejectedCandidates: 0,
  browserFallbackUsed: false,
  browserFallbackStatus: "not_used" as const,
  browserFallbackPages: 0,
  durationMs: 0,
};

const memoryLeadLocks = new Map<string, number>();
const memoryUserActive = new Map<string, number>();
const memoryRateLimits = new Map<string, { count: number; expiresAt: number }>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeMetadata(lead: Lead) {
  return isRecord(lead.raw_metadata) ? lead.raw_metadata : {};
}

function mergeProgressMetadata(
  lead: Lead,
  progress: CompleteEnrichmentProgress,
  additions: Record<string, unknown> = {},
) {
  return {
    ...safeMetadata(lead),
    ...additions,
    complete_enrichment: progress,
  };
}

function isRecent(value?: string, windowMs = WORKLOAD_LIMITS.completeEnrichment.freshnessMs) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) && Date.now() - timestamp < windowMs;
}

function errorCode(error: unknown) {
  return operationalError(error, { step: "complete_enrichment" }).code;
}

function initialProgress(now: string): CompleteEnrichmentProgress {
  return {
    status: "running",
    contact_status: "running",
    whatsapp_status: "running",
    decision_maker_status: "running",
    outreach_status: "queued",
    requested_mode: "complete",
    started_at: now,
    checked_at: now,
  };
}

async function loadLead(user: UserIdentity, leadId: string) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .in("user_id", getAllowedUserIds(user))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new PublicApiError("Lead not found.", 404, "LEAD_NOT_FOUND");
  return data as Lead;
}

async function updateLead(user: UserIdentity, lead: Lead, values: Record<string, unknown>) {
  if (!lead.id) throw new PublicApiError("Lead not found.", 404, "LEAD_NOT_FOUND");
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leads")
    .update(values)
    .eq("id", lead.id)
    .in("user_id", getAllowedUserIds(user))
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Lead;
}

async function assertRateLimit(userId: string) {
  const bucket = Math.floor(Date.now() / (WORKLOAD_LIMITS.completeEnrichment.rateLimitWindowSeconds * 1_000));
  const key = `complete-enrichment:rate:${userId}:${bucket}`;

  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, WORKLOAD_LIMITS.completeEnrichment.rateLimitWindowSeconds);
      if (count > WORKLOAD_LIMITS.completeEnrichment.rateLimitLeads) {
        throw new PublicApiError(
          "Too many enrichment requests. Please wait a few minutes before trying again.",
          429,
          "ENRICHMENT_RATE_LIMITED",
        );
      }
      return;
    } catch (error) {
      if (error instanceof PublicApiError) throw error;
      // Continue with the in-process fallback when Redis is temporarily unavailable.
    }
  }

  const now = Date.now();
  const current = memoryRateLimits.get(key);
  const next = !current || current.expiresAt <= now
    ? { count: 1, expiresAt: now + WORKLOAD_LIMITS.completeEnrichment.rateLimitWindowSeconds * 1_000 }
    : { ...current, count: current.count + 1 };
  memoryRateLimits.set(key, next);
  if (next.count > WORKLOAD_LIMITS.completeEnrichment.rateLimitLeads) {
    throw new PublicApiError(
      "Too many enrichment requests. Please wait a few minutes before trying again.",
      429,
      "ENRICHMENT_RATE_LIMITED",
    );
  }
}

async function acquireMemoryLease(userId: string, leadId: string): Promise<EnrichmentLease | null> {
  const now = Date.now();
  for (const [key, expiresAt] of memoryLeadLocks) {
    if (expiresAt <= now) memoryLeadLocks.delete(key);
  }

  const leadKey = `${userId}:${leadId}`;
  if (
    memoryLeadLocks.has(leadKey) ||
    (memoryUserActive.get(userId) ?? 0) >= WORKLOAD_LIMITS.completeEnrichment.maxActivePerUser
  ) return null;
  memoryLeadLocks.set(leadKey, now + WORKLOAD_LIMITS.completeEnrichment.activeLockSeconds * 1_000);
  memoryUserActive.set(userId, (memoryUserActive.get(userId) ?? 0) + 1);
  return {
    release: async () => {
      memoryLeadLocks.delete(leadKey);
      memoryUserActive.set(userId, Math.max((memoryUserActive.get(userId) ?? 1) - 1, 0));
    },
  };
}

async function acquireLease(userId: string, leadId: string): Promise<EnrichmentLease | null> {
  if (!redis) return acquireMemoryLease(userId, leadId);
  const redisClient = redis;

  const token = crypto.randomUUID();
  const leadKey = `complete-enrichment:active:${userId}:${leadId}`;
  const userKey = `complete-enrichment:active-user:${userId}`;

  try {
    const acquired = await redisClient.set(leadKey, token, { nx: true, ex: WORKLOAD_LIMITS.completeEnrichment.activeLockSeconds });
    if (!acquired) return null;

    const activeCount = await redisClient.incr(userKey);
    if (activeCount === 1) await redisClient.expire(userKey, WORKLOAD_LIMITS.completeEnrichment.activeLockSeconds);
    if (activeCount > WORKLOAD_LIMITS.completeEnrichment.maxActivePerUser) {
      await redisClient.decr(userKey);
      await redisClient.del(leadKey);
      return null;
    }

    return {
      release: async () => {
        try {
          if ((await redisClient.get<string>(leadKey)) === token) await redisClient.del(leadKey);
          const remaining = await redisClient.decr(userKey);
          if (remaining <= 0) await redisClient.del(userKey);
        } catch {
          // Locks expire automatically; release failures must not erase completed data.
        }
      },
    };
  } catch {
    return acquireMemoryLease(userId, leadId);
  }
}

function decisionMakerStepStatus(lead: Lead): CompleteEnrichmentStepStatus {
  if (getPrimaryDecisionMaker(lead)) return "complete";
  if (lead.decision_maker_research_status === "needs_verification" || lead.decision_maker_research_status === "partial") {
    return "partial";
  }
  if (lead.decision_maker_research_status === "error") return "failed";
  if (lead.decision_maker_research_status === "unavailable") return "skipped";
  if (lead.decision_maker_research_status === "not_found") return "not_found";
  return "not_found";
}

function whatsappStepStatus(lead: Lead): CompleteEnrichmentStepStatus {
  if (lead.public_whatsapp_status === "confirmed_public") return "complete";
  if (lead.public_whatsapp_status === "possible") return "partial";
  if (lead.public_whatsapp_status === "error") return "failed";
  if (lead.public_whatsapp_status === "not_found") return "not_found";
  return "skipped";
}

function finalOverallStatus(
  lead: Lead,
  statuses: CompleteEnrichmentStepStatus[],
): CompleteEnrichmentOverallStatus {
  const useful = Boolean(
    cleanSafePublicEmail(lead.email) ||
      getContactPageUrl(lead) ||
      lead.phone?.trim() ||
      (lead.public_whatsapp_status === "confirmed_public" && lead.public_whatsapp_url) ||
      getPrimaryDecisionMaker(lead),
  );
  const failed = statuses.some((status) => status === "failed");
  if (failed && !useful) return "failed";
  if (failed || !cleanSafePublicEmail(lead.email) || !getPrimaryDecisionMaker(lead)) return useful ? "partial" : "not_found";
  return "complete";
}

function resultMessage(status: CompleteEnrichmentOverallStatus, lead: Lead) {
  if (status === "complete") return "Complete outreach profile is ready.";
  if (status === "partial") {
    return lead.website?.trim()
      ? "Useful public outreach information was found. Some fields remain unavailable."
      : "No website is available to scan. Existing phone and opportunity information were preserved.";
  }
  if (status === "not_found") return "No additional public contact information was found.";
  if (status === "cancelled") return "Enrichment was cancelled. Completed information was preserved.";
  return "Complete enrichment could not be finished. Retry is available.";
}

async function directContextTextLength(context: ReturnType<typeof createPublicWebResearchContext>) {
  const pages = await Promise.allSettled([...context.cache.values()]);
  return pages.reduce((total, result) => {
    if (result.status !== "fulfilled") return total;
    return total + result.value.html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .length;
  }, 0);
}

function crawlFallbackUrls(website: string, cachedUrls: string[]) {
  const origin = normalizePublicWebsiteUrl(website);
  if (!origin) return [];
  return [
    origin.href,
    ...cachedUrls,
    new URL("/contact", origin).href,
    new URL("/about", origin).href,
    new URL("/team", origin).href,
    new URL("/leadership", origin).href,
  ];
}

export async function completeLeadEnrichment(
  user: UserIdentity,
  leadId: string,
  options: {
    force?: boolean;
    maxPages?: number;
    onStep?: (step: EnrichmentJobStep) => void | Promise<void>;
  } = {},
) {
  await assertRateLimit(user.id);
  let lead = await loadLead(user, leadId);
  const existingProgress = getCompleteEnrichmentProgress(lead);

  if (
    !options.force &&
    ["complete", "partial", "not_found"].includes(existingProgress.status) &&
    isRecent(existingProgress.checked_at ?? existingProgress.completed_at) &&
    (!lead.website?.trim() || Boolean(cleanSafePublicEmail(lead.email)) || hasCurrentPublicEmailResearch(lead))
  ) {
    const [attached] = await attachDecisionMakers([lead]);
    const cachedProgress = { ...existingProgress, cached: true } satisfies CompleteEnrichmentProgress;
    return {
      lead: attached,
      progress: cachedProgress,
      outreach: getOutreachIntelligence(attached),
      emailType: classifyPublicEmail(attached.email),
      cached: true,
      metrics: EMPTY_ENRICHMENT_METRICS,
      warnings: [] as string[],
      message: "Recent complete-enrichment results were reused.",
    };
  }

  if (
    existingProgress.status === "running" &&
    isRecent(existingProgress.started_at, WORKLOAD_LIMITS.completeEnrichment.activeLockSeconds * 1_000)
  ) {
    const [attached] = await attachDecisionMakers([lead]);
    return {
      lead: attached,
      progress: existingProgress,
      outreach: getOutreachIntelligence(attached),
      emailType: classifyPublicEmail(attached.email),
      cached: true,
      metrics: EMPTY_ENRICHMENT_METRICS,
      warnings: [] as string[],
      message: "Complete enrichment is already running for this lead.",
    };
  }

  const lease = await acquireLease(user.id, leadId);
  if (!lease) {
    const [attached] = await attachDecisionMakers([lead]);
    return {
      lead: attached,
      progress: existingProgress.status === "not_started" ? { ...initialProgress(new Date().toISOString()), status: "queued" as const } : existingProgress,
      outreach: getOutreachIntelligence(attached),
      emailType: classifyPublicEmail(attached.email),
      cached: true,
      metrics: EMPTY_ENRICHMENT_METRICS,
      warnings: ["This lead is already queued or running."],
      message: "Complete enrichment is already queued or running.",
    };
  }

  if (
    options.force &&
    !(await startCooldown(
      `complete-enrichment:force:${user.id}:${leadId}`,
      WORKLOAD_LIMITS.completeEnrichment.forceRefreshCooldownSeconds,
    ))
  ) {
    await lease.release();
    throw new PublicApiError(
      "Please wait before refreshing this lead again.",
      429,
      "ENRICHMENT_REFRESH_COOLDOWN",
    );
  }

  const startedAt = new Date().toISOString();
  let progress = initialProgress(startedAt);
  const warnings: string[] = [];
  const errorCodes: string[] = [];

  try {
    lead = await updateLead(user, lead, {
      raw_metadata: mergeProgressMetadata(lead, progress),
    });

    const context = createPublicWebResearchContext(options.maxPages);
    await options.onStep?.("finding_public_contact_details");
    let contactResult: PromiseSettledResult<PublicEmailResult>;
    if (lead.website?.trim()) {
      try {
        const contact = await enrichLeadPublicEmail(user, lead, {
          context,
          forceRefresh: options.force === true,
        });
        lead = contact.lead;
        contactResult = { status: "fulfilled", value: contact.result };
      } catch (reason) {
        contactResult = { status: "rejected", reason };
      }
    } else {
      contactResult = { status: "fulfilled", value: { status: "not_checked" } };
    }

    await options.onStep?.("researching_decision_maker");
    let decisionMakerResult = await Promise.resolve(
      researchLeadDecisionMakers(user, leadId, { force: options.force, context }),
    ).then(
      (value) => ({ status: "fulfilled", value }) as const,
      (reason) => ({ status: "rejected", reason }) as const,
    );
    let browserFallbackStatus: "not_used" | "completed" | "unavailable" | "not_eligible" | "robots_disallowed" | "error" = "not_used";
    let browserFallbackPages = 0;
    const directContact = contactResult.status === "fulfilled" ? contactResult.value : null;
    const directCandidates = decisionMakerResult.status === "fulfilled" ? decisionMakerResult.value.candidates : [];
    const directUseful = Boolean(
      cleanSafePublicEmail(lead.email) ||
      cleanSafePublicEmail(directContact?.email) ||
      directContact?.contactPageUrl ||
      directCandidates.length,
    );
    if (lead.website?.trim() && !directUseful && (await directContextTextLength(context)) < 800) {
      await options.onStep?.("rendering_website");
      const fallback = await crawlPublicBusinessPages(
        lead.website,
        crawlFallbackUrls(lead.website, [...context.cache.keys()]),
      );
      browserFallbackStatus = fallback.status;
      browserFallbackPages = fallback.pages.length;
      if (fallback.status === "completed" && fallback.pages.length) {
        fallback.pages.forEach((page) => seedPublicWebResearchPage(context, page, { replace: true }));
        await options.onStep?.("finding_public_contact_details");
        try {
          const fallbackContact = await enrichLeadPublicEmail(user, lead, { context, forceRefresh: true });
          lead = fallbackContact.lead;
          contactResult = { status: "fulfilled", value: fallbackContact.result };
        } catch (reason) {
          contactResult = { status: "rejected", reason };
        }
        await options.onStep?.("researching_decision_maker");
        const fallbackDecision = await Promise.resolve(
          researchLeadDecisionMakers(user, leadId, { context, bypassFreshness: true }),
        ).then(
          (value) => ({ status: "fulfilled", value }) as const,
          (reason) => ({ status: "rejected", reason }) as const,
        );
        if (fallbackDecision.status === "fulfilled") decisionMakerResult = fallbackDecision;
      } else if (fallback.safeErrorCode) {
        warnings.push("Browser rendering was unavailable. Direct website results were preserved.");
        errorCodes.push(fallback.safeErrorCode);
      }
    }

    let contactStatus: CompleteEnrichmentStepStatus = lead.website?.trim() ? "not_found" : "skipped";
    const currentEmail = cleanSafePublicEmail(lead.email);
    const existingContactPage = getContactPageUrl(lead);

    if (contactResult.status === "fulfilled") {
      const result = contactResult.value;
      const email = currentEmail ?? cleanSafePublicEmail(result.email);
      const contactPageUrl = result.contactPageUrl ?? existingContactPage ?? undefined;
      contactStatus = email || contactPageUrl ? "complete" : result.status === "error" ? "failed" : lead.website?.trim() ? "not_found" : "skipped";
      if (result.status === "error") errorCodes.push("website_unavailable");
    } else {
      contactStatus = lead.website?.trim() ? "failed" : "skipped";
      errorCodes.push(errorCode(contactResult.reason));
    }

    let decisionStatus: CompleteEnrichmentStepStatus = "failed";
    let whatsappStatus: CompleteEnrichmentStepStatus = "failed";
    let candidates = lead.decision_makers ?? [];
    if (decisionMakerResult.status === "fulfilled") {
      warnings.push(...decisionMakerResult.value.warnings);
      candidates = decisionMakerResult.value.candidates;
      lead = { ...decisionMakerResult.value.lead, decision_makers: candidates };
      decisionStatus = decisionMakerStepStatus(lead);
      whatsappStatus = whatsappStepStatus(lead);
    } else {
      const code = errorCode(decisionMakerResult.reason);
      errorCodes.push(code);
      warnings.push(
        code === "provider_quota"
          ? "Public search is temporarily unavailable. Website-derived results were preserved."
          : "Decision-maker research could not be completed. Other public results were preserved.",
      );
    }

    const latest = await loadLead(user, leadId);
    lead = { ...latest, decision_makers: candidates };
    await options.onStep?.("building_outreach_profile");
    const currentProgress = getCompleteEnrichmentProgress(lead);
    const cancelled = currentProgress.cancel_requested === true || currentProgress.status === "cancelled";
    const metrics = {
      websiteFetches: context.requestsStarted,
      websitePagesFetched: context.cache.size,
      publicSearchRequests:
        decisionMakerResult.status === "fulfilled"
          ? decisionMakerResult.value.metrics.publicSearchRequests
          : 0,
      cacheHits:
        (contactResult.status === "fulfilled" && contactResult.value.cached ? 1 : 0) +
        (decisionMakerResult.status === "fulfilled" ? decisionMakerResult.value.metrics.cacheHits : 0),
      cacheMisses: Math.max(
        context.requestsStarted -
          ((contactResult.status === "fulfilled" && contactResult.value.cached ? 1 : 0) +
            (decisionMakerResult.status === "fulfilled" ? decisionMakerResult.value.metrics.cacheHits : 0)),
        0,
      ),
      providerFailures: errorCodes.length,
      rejectedCandidates: decisionMakerResult.status === "fulfilled"
        ? decisionMakerResult.value.metrics.invalidCandidatesRejected
        : 0,
      browserFallbackUsed: browserFallbackStatus !== "not_used" && browserFallbackStatus !== "not_eligible",
      browserFallbackStatus,
      browserFallbackPages,
      durationMs: Math.max(Date.now() - new Date(startedAt).getTime(), 0),
    };
    let overallStatus = cancelled
      ? "cancelled"
      : finalOverallStatus(lead, [contactStatus, decisionStatus, whatsappStatus]);
    if (!cancelled && overallStatus === "not_found" && ["unavailable", "error"].includes(browserFallbackStatus)) {
      overallStatus = "partial";
    }
    const now = new Date().toISOString();
    progress = {
      status: overallStatus,
      contact_status: cancelled ? "cancelled" : contactStatus,
      whatsapp_status: cancelled ? "cancelled" : whatsappStatus,
      decision_maker_status: cancelled ? "cancelled" : decisionStatus,
      outreach_status: cancelled ? "cancelled" : "complete",
      requested_mode: "complete",
      started_at: startedAt,
      completed_at: now,
      checked_at: now,
      ...(errorCodes.length ? { last_error_code: errorCodes[0] } : {}),
      ...(cancelled ? { cancel_requested: true } : {}),
    };
    const finalMetadata = mergeProgressMetadata(lead, progress, {
      complete_enrichment_metrics: metrics,
    });
    const updated = await updateLead(user, lead, { raw_metadata: finalMetadata });
    lead = { ...updated, decision_makers: candidates };
    const outreach = getOutreachIntelligence(lead);

    logWorkflowEvent("complete-enrichment", "finished", {
      leadId,
      outcome: progress.status,
      contactStatus: progress.contact_status,
      decisionMakerStatus: progress.decision_maker_status,
      whatsappStatus: progress.whatsapp_status,
      cached: false,
      websitePagesFetched: metrics.websitePagesFetched,
      publicSearchRequests: metrics.publicSearchRequests,
      cacheHits: metrics.cacheHits,
      cacheMisses: metrics.cacheMisses,
      providerFailures: metrics.providerFailures,
      rejectedCandidates: metrics.rejectedCandidates,
      browserFallbackUsed: metrics.browserFallbackUsed,
      browserFallbackPages: metrics.browserFallbackPages,
      durationMs: metrics.durationMs,
    });

    return {
      lead,
      progress,
      outreach,
      emailType: classifyPublicEmail(lead.email, getPrimaryDecisionMaker(lead)?.name),
      cached: false,
      metrics,
      warnings: [...new Set(warnings)],
      message: resultMessage(progress.status, lead),
    };
  } catch (error) {
    const code = errorCode(error);
    const now = new Date().toISOString();
    progress = {
      ...progress,
      status: "failed",
      contact_status: progress.contact_status === "running" ? "failed" : progress.contact_status,
      whatsapp_status: progress.whatsapp_status === "running" ? "failed" : progress.whatsapp_status,
      decision_maker_status: progress.decision_maker_status === "running" ? "failed" : progress.decision_maker_status,
      outreach_status: "failed",
      completed_at: now,
      checked_at: now,
      last_error_code: code,
    };
    try {
      const latest = await loadLead(user, leadId);
      const latestProgress = getCompleteEnrichmentProgress(latest);
      if (latestProgress.status !== "cancelled" && latestProgress.cancel_requested !== true) {
        await updateLead(user, latest, { raw_metadata: mergeProgressMetadata(latest, progress) });
      }
    } catch {
      // Preserve the original safe error response if status persistence also fails.
    }
    throw error;
  } finally {
    await lease.release();
  }
}

export async function cancelCompleteEnrichment(user: UserIdentity, leadIds: string[]) {
  const uniqueIds = [...new Set(leadIds)].slice(0, WORKLOAD_LIMITS.completeEnrichment.maxLeadIdsPerBulkRequest);
  const results: Array<{ leadId: string; cancelled: boolean }> = [];
  for (const leadId of uniqueIds) {
    const lead = await loadLead(user, leadId);
    const current = getCompleteEnrichmentProgress(lead);
    const now = new Date().toISOString();
    const progress: CompleteEnrichmentProgress = {
      ...current,
      status: "cancelled",
      contact_status: ["queued", "running"].includes(current.contact_status) ? "cancelled" : current.contact_status,
      whatsapp_status: ["queued", "running"].includes(current.whatsapp_status) ? "cancelled" : current.whatsapp_status,
      decision_maker_status: ["queued", "running"].includes(current.decision_maker_status) ? "cancelled" : current.decision_maker_status,
      outreach_status: ["queued", "running"].includes(current.outreach_status) ? "cancelled" : current.outreach_status,
      requested_mode: "complete",
      completed_at: now,
      checked_at: now,
      cancel_requested: true,
    };
    await updateLead(user, lead, { raw_metadata: mergeProgressMetadata(lead, progress) });
    results.push({ leadId, cancelled: true });
  }
  return results;
}
