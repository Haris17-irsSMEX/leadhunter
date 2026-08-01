export type OperationalErrorCode =
  | "provider_timeout"
  | "provider_quota"
  | "provider_unavailable"
  | "website_timeout"
  | "website_blocked"
  | "website_unavailable"
  | "public_search_unavailable"
  | "invalid_city"
  | "scan_limit_reached"
  | "plan_limit_reached"
  | "duplicate_active_run"
  | "cancelled"
  | "stale_job"
  | "database_error"
  | "configuration_error"
  | "unknown_error";

export type OperationalError = {
  code: OperationalErrorCode;
  category: "provider" | "website" | "validation" | "limit" | "job" | "database" | "unknown";
  retryable: boolean;
  user_message: string;
  internal_message: string;
  provider?: string;
  step?: string;
  occurred_at: string;
};

export function operationalError(
  error: unknown,
  defaults: { provider?: string; step?: string } = {},
): OperationalError {
  const message = error instanceof Error ? error.message : "Unknown error";
  const normalized = message.toLowerCase();
  const status = error && typeof error === "object" && "httpStatus" in error ? Number(error.httpStatus) : 0;
  const providerStatus =
    error && typeof error === "object" && "providerStatus" in error
      ? String(error.providerStatus ?? "").toUpperCase()
      : "";

  let code: OperationalErrorCode = "unknown_error";
  if (normalized.includes("cancel")) code = "cancelled";
  else if (normalized.includes("already") && /running|queued|active/.test(normalized)) code = "duplicate_active_run";
  else if (/stale|interrupted/.test(normalized)) code = "stale_job";
  else if (status === 429 || providerStatus === "RESOURCE_EXHAUSTED" || /quota|rate limit/.test(normalized)) code = "provider_quota";
  else if (providerStatus === "TIMEOUT" || /timeout|timed out/.test(normalized)) code = defaults.provider ? "provider_timeout" : "website_timeout";
  else if (status >= 500 || providerStatus === "UNAVAILABLE") code = "provider_unavailable";
  else if (/403|blocked/.test(normalized)) code = defaults.provider ? "configuration_error" : "website_blocked";
  else if (/configuration|missing api key|not configured/.test(normalized)) code = "configuration_error";
  else if (/database|supabase|serialization|deadlock/.test(normalized)) code = "database_error";
  else if (/search/.test(normalized)) code = "public_search_unavailable";
  else if (/website|public page/.test(normalized)) code = "website_unavailable";

  const retryable = ["provider_timeout", "provider_quota", "provider_unavailable", "website_timeout", "public_search_unavailable", "database_error"].includes(code);
  const category = code.startsWith("provider_") || code === "configuration_error"
    ? "provider"
    : code.startsWith("website_") || code === "public_search_unavailable"
      ? "website"
      : code === "database_error"
        ? "database"
        : code === "cancelled" || code === "stale_job" || code === "duplicate_active_run"
          ? "job"
          : code.includes("limit")
            ? "limit"
            : "unknown";

  const userMessage = code === "provider_quota"
    ? "A provider limit was reached. Completed information was preserved."
    : code === "provider_timeout" || code === "provider_unavailable"
      ? "A public data provider is temporarily unavailable. Please try again later."
      : code === "website_timeout"
        ? "The business website did not respond in time. Retry is available."
        : code === "cancelled"
          ? "Processing stopped. Results already completed were preserved."
          : "This step could not be completed. Existing information was preserved.";

  return {
    code,
    category,
    retryable,
    user_message: userMessage,
    internal_message: message.slice(0, 500),
    provider: defaults.provider,
    step: defaults.step,
    occurred_at: new Date().toISOString(),
  };
}

export function logWorkflowEvent(
  workflow: string,
  event: string,
  details: Record<string, string | number | boolean | null | undefined>,
) {
  const safeDetails = Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 240) : value]),
  );
  console.info(`[${workflow}] ${event}`, safeDetails);
}
