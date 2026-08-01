import type {
  CompleteEnrichmentOverallStatus,
  CompleteEnrichmentProgress,
  CompleteEnrichmentStepStatus,
  Lead,
} from "@/lib/types";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

const OVERALL_STATUSES = new Set<CompleteEnrichmentOverallStatus>([
  "not_started",
  "queued",
  "running",
  "complete",
  "partial",
  "not_found",
  "failed",
  "cancelled",
]);
const STEP_STATUSES = new Set<CompleteEnrichmentStepStatus>([
  "not_started",
  "queued",
  "running",
  "complete",
  "partial",
  "not_found",
  "skipped",
  "failed",
  "cancelled",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function overallStatus(value: unknown): CompleteEnrichmentOverallStatus {
  return typeof value === "string" && OVERALL_STATUSES.has(value as CompleteEnrichmentOverallStatus)
    ? (value as CompleteEnrichmentOverallStatus)
    : "not_started";
}

function stepStatus(value: unknown): CompleteEnrichmentStepStatus {
  return typeof value === "string" && STEP_STATUSES.has(value as CompleteEnrichmentStepStatus)
    ? (value as CompleteEnrichmentStepStatus)
    : "not_started";
}

export function getCompleteEnrichmentProgress(lead: Pick<Lead, "raw_metadata">): CompleteEnrichmentProgress {
  const metadata = isRecord(lead.raw_metadata) ? lead.raw_metadata : {};
  const value = isRecord(metadata.complete_enrichment) ? metadata.complete_enrichment : {};
  const startedAt = typeof value.started_at === "string" ? value.started_at : undefined;
  const startedTime = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  const staleRunning =
    overallStatus(value.status) === "running" &&
    Number.isFinite(startedTime) &&
    Date.now() - startedTime > WORKLOAD_LIMITS.completeEnrichment.staleAfterMs;

  return {
    status: staleRunning ? "failed" : overallStatus(value.status),
    contact_status: staleRunning && stepStatus(value.contact_status) === "running" ? "failed" : stepStatus(value.contact_status),
    whatsapp_status: staleRunning && stepStatus(value.whatsapp_status) === "running" ? "failed" : stepStatus(value.whatsapp_status),
    decision_maker_status: staleRunning && stepStatus(value.decision_maker_status) === "running" ? "failed" : stepStatus(value.decision_maker_status),
    outreach_status: staleRunning && stepStatus(value.outreach_status) === "running" ? "failed" : stepStatus(value.outreach_status),
    requested_mode: "complete",
    ...(startedAt ? { started_at: startedAt } : {}),
    ...(typeof value.completed_at === "string" ? { completed_at: value.completed_at } : {}),
    ...(typeof value.checked_at === "string" ? { checked_at: value.checked_at } : {}),
    ...(staleRunning
      ? { last_error_code: "unknown_error" }
      : typeof value.last_error_code === "string"
        ? { last_error_code: value.last_error_code }
        : {}),
    ...(value.cancel_requested === true ? { cancel_requested: true } : {}),
    ...(value.cached === true ? { cached: true } : {}),
  };
}

export function completeEnrichmentStatusLabel(status: CompleteEnrichmentOverallStatus) {
  if (status === "queued") return "Queued";
  if (status === "running") return "Building outreach profile";
  if (status === "complete") return "Complete";
  if (status === "partial") return "Partial result";
  if (status === "not_found") return "No additional public information found";
  if (status === "failed") return "Failed - retry available";
  if (status === "cancelled") return "Cancelled";
  return "Not enriched";
}

export function completeEnrichmentStepLabel(status: CompleteEnrichmentStepStatus) {
  if (status === "queued") return "Queued";
  if (status === "running") return "Running";
  if (status === "complete") return "Complete";
  if (status === "partial") return "Partial";
  if (status === "not_found") return "Not found";
  if (status === "skipped") return "Skipped";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return "Not started";
}
