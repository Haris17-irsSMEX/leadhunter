import "server-only";

import { send } from "@vercel/queue";
import type { User } from "@supabase/supabase-js";
import { PublicApiError } from "@/lib/api-errors";
import { attachDecisionMakers } from "@/lib/decision-maker-db";
import { completeLeadEnrichment } from "@/lib/complete-enrichment";
import { getContactPageUrl } from "@/lib/contactability";
import { getSupabaseServiceClient } from "@/lib/db";
import { logWorkflowEvent, operationalError } from "@/lib/operational-errors";
import { startCooldown, acquireWorkloadLease, acquireWorkloadSlot } from "@/lib/workload-guards";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";
import type {
  EnrichmentJob,
  EnrichmentJobItem,
  EnrichmentJobItemStatus,
  EnrichmentJobStep,
  Lead,
} from "@/lib/types";

export const ENRICHMENT_QUEUE_TOPIC = "leadhunter-enrichment";
export const ENRICHMENT_MESSAGE_SCHEMA_VERSION = 1;

export type EnrichmentQueueMessage = {
  jobId: string;
  jobItemId: string;
  leadId: string;
  userId: string;
  forceRefresh: boolean;
  schemaVersion: typeof ENRICHMENT_MESSAGE_SCHEMA_VERSION;
};

type UserIdentity = Pick<User, "id" | "email">;
type CreateJobOptions = {
  forceRefresh?: boolean;
  sourceContext?: "recent_search" | "selected_leads" | "finder_auto";
  sourceSearchJobId?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_JOB_STATUSES = ["queued", "running", "cancelling"];
const TERMINAL_ITEM_STATUSES = ["complete", "partial", "no_additional_data", "failed", "cancelled"];
const RETRYABLE_ITEM_CODES = new Set([
  "provider_timeout",
  "provider_quota",
  "provider_unavailable",
  "website_timeout",
  "website_unavailable",
  "public_search_unavailable",
  "database_error",
  "browser_fallback_unavailable",
  "queue_publish_failed",
]);

function uniqueLeadIds(values: unknown) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && UUID_PATTERN.test(value.trim())).map((value) => value.trim()))];
}

function safeSourceContext(value: CreateJobOptions["sourceContext"]) {
  return value === "recent_search" || value === "finder_auto" ? value : "selected_leads";
}

function isTerminalItem(status: string) {
  return TERMINAL_ITEM_STATUSES.includes(status);
}

function queuePayload(item: EnrichmentJobItem, forceRefresh: boolean): EnrichmentQueueMessage {
  return {
    jobId: item.job_id,
    jobItemId: item.id,
    leadId: item.lead_id,
    userId: item.user_id,
    forceRefresh,
    schemaVersion: ENRICHMENT_MESSAGE_SCHEMA_VERSION,
  };
}

async function publishItem(item: EnrichmentJobItem, forceRefresh: boolean) {
  const result = await send(ENRICHMENT_QUEUE_TOPIC, queuePayload(item, forceRefresh), {
    idempotencyKey: item.queue_message_key,
    retentionSeconds: WORKLOAD_LIMITS.durableEnrichment.queueRetentionSeconds,
  });
  return result.messageId;
}

async function markPublishFailure(item: EnrichmentJobItem) {
  const supabase = getSupabaseServiceClient();
  await supabase
    .from("enrichment_job_items")
    .update({
      status: "failed",
      current_step: "failed",
      completed_at: new Date().toISOString(),
      safe_error_code: "queue_publish_failed",
      result_summary: { outcome: "failed", queuePublished: false },
    })
    .eq("id", item.id)
    .eq("job_id", item.job_id)
    .eq("user_id", item.user_id);
}

async function publishItems(items: EnrichmentJobItem[], forceRefresh: boolean) {
  const results = await Promise.allSettled(items.map((item) => publishItem(item, forceRefresh)));
  const failed: EnrichmentJobItem[] = [];

  await Promise.all(results.map(async (result, index) => {
    const item = items[index];
    if (result.status === "rejected") {
      failed.push(item);
      await markPublishFailure(item);
    }
  }));

  return { published: items.length - failed.length, failed };
}

async function loadOwnedLeads(userId: string, leadIds: string[]) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("user_id", userId)
    .in("id", leadIds);
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== leadIds.length) {
    throw new PublicApiError("One or more leads could not be found.", 404, "LEAD_NOT_FOUND");
  }
  return data as Lead[];
}

async function findMatchingActiveJob(userId: string, leadIds: string[]) {
  const supabase = getSupabaseServiceClient();
  const { data: jobs, error } = await supabase
    .from("enrichment_jobs")
    .select("id")
    .eq("user_id", userId)
    .in("status", ACTIVE_JOB_STATUSES)
    .order("created_at", { ascending: false })
    .limit(WORKLOAD_LIMITS.durableEnrichment.maxActiveJobsPerUser);
  if (error) throw new Error(error.message);

  const expected = [...leadIds].sort().join(",");
  for (const job of jobs ?? []) {
    const { data: items, error: itemError } = await supabase
      .from("enrichment_job_items")
      .select("lead_id")
      .eq("job_id", job.id);
    if (itemError) throw new Error(itemError.message);
    if ((items ?? []).map((item) => String(item.lead_id)).sort().join(",") === expected) return String(job.id);
  }
  return null;
}

export async function createEnrichmentJob(user: UserIdentity, inputLeadIds: unknown, options: CreateJobOptions = {}) {
  const leadIds = uniqueLeadIds(inputLeadIds);
  if (!leadIds.length) throw new PublicApiError("Select at least one lead to enrich.", 400, "INVALID_INPUT");
  if (leadIds.length > WORKLOAD_LIMITS.durableEnrichment.maxLeadsPerJob) {
    throw new PublicApiError(
      `Select no more than ${WORKLOAD_LIMITS.durableEnrichment.maxLeadsPerJob} leads per enrichment job.`,
      400,
      "ENRICHMENT_JOB_LIMIT",
    );
  }

  await loadOwnedLeads(user.id, leadIds);
  const sourceSearchJobId = options.sourceSearchJobId?.trim() || null;
  if (sourceSearchJobId) {
    const sourceJob = await getSupabaseServiceClient()
      .from("jobs")
      .select("id")
      .eq("id", sourceSearchJobId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (sourceJob.error) throw new Error(sourceJob.error.message);
    if (!sourceJob.data) throw new PublicApiError("Source search could not be found.", 404, "JOB_NOT_FOUND");
  }
  const existingJobId = await findMatchingActiveJob(user.id, leadIds);
  if (existingJobId) return { ...(await getEnrichmentJob(user, existingJobId)), reused: true };

  const supabase = getSupabaseServiceClient();
  const { count, error: countError } = await supabase
    .from("enrichment_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("status", ACTIVE_JOB_STATUSES);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= WORKLOAD_LIMITS.durableEnrichment.maxActiveJobsPerUser) {
    throw new PublicApiError("Finish or cancel an active enrichment job before starting another.", 409, "ENRICHMENT_ACTIVE_LIMIT");
  }

  const { data: jobData, error: jobError } = await supabase
    .from("enrichment_jobs")
    .insert({
      user_id: user.id,
      source_search_job_id: sourceSearchJobId,
      requested_mode: "complete_outreach_profile",
      status: "queued",
      total_items: leadIds.length,
      queued_items: leadIds.length,
      metadata: {
        sourceContext: safeSourceContext(options.sourceContext),
        forceRefresh: options.forceRefresh === true,
        schemaVersion: ENRICHMENT_MESSAGE_SCHEMA_VERSION,
      },
    })
    .select("*")
    .single();
  if (jobError) throw new Error(jobError.message);
  const job = jobData as EnrichmentJob;

  const itemRows = leadIds.map((leadId) => {
    const id = crypto.randomUUID();
    return {
      id,
      job_id: job.id,
      user_id: user.id,
      lead_id: leadId,
      status: "queued",
      current_step: "queued",
      queue_message_key: `${job.id}:${leadId}:${ENRICHMENT_MESSAGE_SCHEMA_VERSION}`,
    };
  });
  const { data: itemData, error: itemError } = await supabase
    .from("enrichment_job_items")
    .insert(itemRows)
    .select("*");
  if (itemError) {
    await supabase.from("enrichment_jobs").delete().eq("id", job.id).eq("user_id", user.id);
    throw new Error(itemError.message);
  }
  const items = (itemData ?? []) as EnrichmentJobItem[];
  const publication = await publishItems(items, options.forceRefresh === true);

  logWorkflowEvent("enrichment-job", "created", {
    jobId: job.id,
    userId: user.id,
    items: items.length,
    published: publication.published,
    publishFailures: publication.failed.length,
  });

  if (!publication.published) {
    throw new PublicApiError(
      "Enrichment could not be queued. Verify the Vercel Queues project configuration and try again.",
      503,
      "QUEUE_UNAVAILABLE",
    );
  }
  return { ...(await getEnrichmentJob(user, job.id)), reused: false, publishFailures: publication.failed.length };
}

export async function getEnrichmentJob(user: UserIdentity, jobId: string) {
  if (!UUID_PATTERN.test(jobId)) throw new PublicApiError("Enrichment job not found.", 404, "JOB_NOT_FOUND");
  const supabase = getSupabaseServiceClient();
  const { data: jobData, error: jobError } = await supabase
    .from("enrichment_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!jobData) throw new PublicApiError("Enrichment job not found.", 404, "JOB_NOT_FOUND");

  const { data: itemData, error: itemError } = await supabase
    .from("enrichment_job_items")
    .select("id,job_id,user_id,lead_id,status,current_step,attempts,started_at,completed_at,last_checked_at,safe_error_code,result_summary,created_at,updated_at")
    .eq("job_id", jobId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (itemError) throw new Error(itemError.message);
  const items = (itemData ?? []) as EnrichmentJobItem[];
  const leads = await loadOwnedLeads(user.id, items.map((item) => item.lead_id));
  const enrichedLeads = await attachDecisionMakers(leads);
  const leadMap = new Map(enrichedLeads.map((lead) => [lead.id, lead]));
  return {
    job: jobData as EnrichmentJob,
    items: items.map((item) => ({ ...item, lead: leadMap.get(item.lead_id) })),
  };
}

export async function cancelEnrichmentJob(user: UserIdentity, jobId: string) {
  const current = await getEnrichmentJob(user, jobId);
  if (["completed", "partial", "failed", "cancelled"].includes(current.job.status)) return current;
  const supabase = getSupabaseServiceClient();
  const now = new Date().toISOString();
  const { error: jobError } = await supabase
    .from("enrichment_jobs")
    .update({ status: "cancelling", cancelled_at: now })
    .eq("id", jobId)
    .eq("user_id", user.id);
  if (jobError) throw new Error(jobError.message);
  const { error: itemError } = await supabase
    .from("enrichment_job_items")
    .update({ status: "cancelled", current_step: "cancelled", completed_at: now, safe_error_code: "cancelled" })
    .eq("job_id", jobId)
    .eq("user_id", user.id)
    .eq("status", "queued");
  if (itemError) throw new Error(itemError.message);
  await supabase.rpc("refresh_enrichment_job_counts", { p_job_id: jobId });
  return getEnrichmentJob(user, jobId);
}

export async function retryEnrichmentJob(user: UserIdentity, jobId: string) {
  const current = await getEnrichmentJob(user, jobId);
  if (current.job.status === "cancelled" || current.job.status === "cancelling") {
    throw new PublicApiError("Cancelled jobs cannot be retried. Start a new enrichment job instead.", 409, "JOB_CANCELLED");
  }
  if (!(await startCooldown(`enrichment-job:retry:${user.id}:${jobId}`, WORKLOAD_LIMITS.durableEnrichment.retryCooldownSeconds))) {
    throw new PublicApiError("Please wait before retrying this enrichment job again.", 429, "ENRICHMENT_RETRY_COOLDOWN");
  }

  const retryItems = current.items.filter((item) =>
    item.status === "failed" || (item.status === "partial" && RETRYABLE_ITEM_CODES.has(item.safe_error_code ?? "")),
  );
  if (!retryItems.length) throw new PublicApiError("This job has no retryable items.", 409, "NO_RETRYABLE_ITEMS");

  const supabase = getSupabaseServiceClient();
  const resetResults = await Promise.all(retryItems.map(async (item) => {
    const generation = Math.max(Number(item.attempts) || 0, 0) + 1;
    const { data, error } = await supabase
      .from("enrichment_job_items")
      .update({
        status: "queued",
        current_step: "queued",
        completed_at: null,
        safe_error_code: null,
        queue_message_key: `${jobId}:${item.lead_id}:${ENRICHMENT_MESSAGE_SCHEMA_VERSION}:retry:${generation}`,
        result_summary: { retryRequested: true, generation },
      })
      .eq("id", item.id)
      .eq("job_id", jobId)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as EnrichmentJobItem;
  }));
  await supabase
    .from("enrichment_jobs")
    .update({ status: "queued", completed_at: null, safe_error_code: null })
    .eq("id", jobId)
    .eq("user_id", user.id);
  const forceRefresh = current.job.metadata?.forceRefresh === true;
  const publication = await publishItems(resetResults, forceRefresh);
  if (!publication.published) throw new PublicApiError("Retry could not be queued.", 503, "QUEUE_UNAVAILABLE");
  return getEnrichmentJob(user, jobId);
}

function validQueueMessage(message: EnrichmentQueueMessage) {
  return message?.schemaVersion === ENRICHMENT_MESSAGE_SCHEMA_VERSION &&
    UUID_PATTERN.test(message.jobId) && UUID_PATTERN.test(message.jobItemId) &&
    UUID_PATTERN.test(message.leadId) && UUID_PATTERN.test(message.userId);
}

async function updateItemStep(itemId: string, userId: string, step: EnrichmentJobStep) {
  const supabase = getSupabaseServiceClient();
  await supabase
    .from("enrichment_job_items")
    .update({ current_step: step, last_checked_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("user_id", userId)
    .eq("status", "running");
}

export async function processEnrichmentQueueMessage(message: EnrichmentQueueMessage, deliveryCount: number) {
  if (!validQueueMessage(message)) return;
  const supabase = getSupabaseServiceClient();
  const { data: job, error: jobError } = await supabase
    .from("enrichment_jobs")
    .select("*")
    .eq("id", message.jobId)
    .eq("user_id", message.userId)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  const { data: itemData, error: itemError } = await supabase
    .from("enrichment_job_items")
    .select("*")
    .eq("id", message.jobItemId)
    .eq("job_id", message.jobId)
    .eq("lead_id", message.leadId)
    .eq("user_id", message.userId)
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!job || !itemData || isTerminalItem(String(itemData.status))) return;

  if (["cancelling", "cancelled"].includes(String(job.status))) {
    await supabase
      .from("enrichment_job_items")
      .update({ status: "cancelled", current_step: "cancelled", completed_at: new Date().toISOString(), safe_error_code: "cancelled" })
      .eq("id", message.jobItemId)
      .eq("user_id", message.userId);
    return;
  }

  const consumerSlot = await acquireWorkloadSlot(
    "enrichment-job:consumer-slot",
    WORKLOAD_LIMITS.durableEnrichment.maxConsumerConcurrency,
    WORKLOAD_LIMITS.durableEnrichment.workerLeaseSeconds,
  );
  if (!consumerSlot) {
    throw Object.assign(new Error("Enrichment workers are temporarily at capacity."), { status: 503 });
  }
  const lease = await acquireWorkloadLease(
    `enrichment-job:item:${message.userId}:${message.jobItemId}`,
    WORKLOAD_LIMITS.durableEnrichment.workerLeaseSeconds,
  );
  if (!lease) {
    await consumerSlot.release();
    throw Object.assign(new Error("This enrichment item is already being processed."), { status: 503 });
  }

  let attempts = Math.max(Number(itemData.attempts) || 0, deliveryCount - 1);
  try {
    const startedAt = itemData.started_at ? new Date(itemData.started_at).getTime() : 0;
    const runningIsFresh = itemData.status === "running" && Date.now() - startedAt < WORKLOAD_LIMITS.durableEnrichment.runningRecoveryMs;
    if (runningIsFresh) {
      throw Object.assign(new Error("This enrichment item is still being processed."), { status: 503 });
    }
    attempts += 1;
    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from("enrichment_job_items")
      .update({
        status: "running",
        current_step: "loading_business_profile",
        attempts,
        started_at: now,
        completed_at: null,
        last_checked_at: now,
        safe_error_code: null,
      })
      .eq("id", message.jobItemId)
      .eq("job_id", message.jobId)
      .eq("user_id", message.userId)
      .in("status", ["queued", "running"])
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimed) return;

    const cancellationCheck = await supabase
      .from("enrichment_jobs")
      .select("status")
      .eq("id", message.jobId)
      .eq("user_id", message.userId)
      .maybeSingle();
    if (cancellationCheck.error) throw new Error(cancellationCheck.error.message);
    if (["cancelling", "cancelled"].includes(String(cancellationCheck.data?.status))) {
      await supabase
        .from("enrichment_job_items")
        .update({ status: "cancelled", current_step: "cancelled", completed_at: new Date().toISOString(), safe_error_code: "cancelled" })
        .eq("id", message.jobItemId)
        .eq("job_id", message.jobId)
        .eq("user_id", message.userId);
      return;
    }

    await updateItemStep(message.jobItemId, message.userId, "scanning_website");
    const result = await completeLeadEnrichment(
      { id: message.userId, email: undefined },
      message.leadId,
      {
        force: message.forceRefresh,
        maxPages: WORKLOAD_LIMITS.durableEnrichment.maxDirectPagesPerLead,
        onStep: async (step) => updateItemStep(message.jobItemId, message.userId, step),
      },
    );

    const latestJob = await supabase
      .from("enrichment_jobs")
      .select("status")
      .eq("id", message.jobId)
      .eq("user_id", message.userId)
      .maybeSingle();
    const wasCancelled = ["cancelling", "cancelled"].includes(String(latestJob.data?.status));
    const mappedStatus: EnrichmentJobItemStatus = wasCancelled
      ? "cancelled"
      : result.progress.status === "complete"
        ? "complete"
        : result.progress.status === "partial"
          ? "partial"
          : result.progress.status === "not_found"
            ? "no_additional_data"
            : result.progress.status === "cancelled"
              ? "cancelled"
              : "failed";
    const step: EnrichmentJobStep = mappedStatus === "no_additional_data" ? "no_additional_data" : mappedStatus;
    const safeErrorCode = result.progress.last_error_code ?? null;
    const metrics = result.metrics ?? {};
    await supabase
      .from("enrichment_job_items")
      .update({
        status: mappedStatus,
        current_step: step,
        completed_at: new Date().toISOString(),
        last_checked_at: new Date().toISOString(),
        safe_error_code: safeErrorCode,
        result_summary: {
          outcome: mappedStatus,
          cached: result.cached === true,
          websitePages: Number(metrics.websitePagesFetched ?? 0),
          publicSearchRequests: Number(metrics.publicSearchRequests ?? 0),
          cacheHits: Number(metrics.cacheHits ?? 0),
          cacheMisses: Number(metrics.cacheMisses ?? 0),
          providerFailures: Number(metrics.providerFailures ?? 0),
          browserFallbackUsed: metrics.browserFallbackUsed === true,
          browserFallbackPages: Number(metrics.browserFallbackPages ?? 0),
          rejectedCandidates: Number(metrics.rejectedCandidates ?? 0),
          durationMs: Number(metrics.durationMs ?? 0),
          emailFound: Boolean(result.lead.email),
          contactPageFound: Boolean(getContactPageUrl(result.lead)),
          candidateCount: result.lead.decision_makers?.length ?? 0,
        },
      })
      .eq("id", message.jobItemId)
      .eq("job_id", message.jobId)
      .eq("user_id", message.userId);

    logWorkflowEvent("enrichment-worker", "finished", {
      jobId: message.jobId,
      itemId: message.jobItemId,
      leadId: message.leadId,
      queueAttempts: attempts,
      outcome: mappedStatus,
      websitePages: Number(metrics.websitePagesFetched ?? 0),
      publicSearchRequests: Number(metrics.publicSearchRequests ?? 0),
      cacheHits: Number(metrics.cacheHits ?? 0),
      cacheMisses: Number(metrics.cacheMisses ?? 0),
      providerFailures: Number(metrics.providerFailures ?? 0),
      browserFallbackUsed: metrics.browserFallbackUsed === true,
      browserFallbackPages: Number(metrics.browserFallbackPages ?? 0),
      rejectedCandidates: Number(metrics.rejectedCandidates ?? 0),
      candidateCount: result.lead.decision_makers?.length ?? 0,
      emailFound: Boolean(result.lead.email),
      contactPageFound: Boolean(getContactPageUrl(result.lead)),
      durationMs: Number(metrics.durationMs ?? 0),
    });
  } catch (error) {
    const safe = operationalError(error, { step: "enrichment_queue_item" });
    const latestJob = await supabase
      .from("enrichment_jobs")
      .select("status")
      .eq("id", message.jobId)
      .eq("user_id", message.userId)
      .maybeSingle();
    const cancelled = ["cancelling", "cancelled"].includes(String(latestJob.data?.status));
    const shouldRetry = !cancelled && safe.retryable && attempts < WORKLOAD_LIMITS.durableEnrichment.maxConsumerAttempts;
    await supabase
      .from("enrichment_job_items")
      .update({
        status: cancelled ? "cancelled" : shouldRetry ? "queued" : "failed",
        current_step: cancelled ? "cancelled" : shouldRetry ? "queued" : "failed",
        completed_at: shouldRetry ? null : new Date().toISOString(),
        last_checked_at: new Date().toISOString(),
        safe_error_code: cancelled ? "cancelled" : safe.code,
        result_summary: { outcome: cancelled ? "cancelled" : shouldRetry ? "retrying" : "failed", retryable: shouldRetry },
      })
      .eq("id", message.jobItemId)
      .eq("job_id", message.jobId)
      .eq("user_id", message.userId);
    if (shouldRetry) throw error;
  } finally {
    await lease.release();
    await consumerSlot.release();
  }
}
