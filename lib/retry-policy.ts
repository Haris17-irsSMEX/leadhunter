export type RetryCategory =
  | "transient"
  | "quota"
  | "permanent"
  | "cancelled"
  | "no_data";

export type RetryDecision = {
  retryable: boolean;
  category: RetryCategory;
  retryAfterMs?: number;
};

type ErrorLike = {
  httpStatus?: number;
  status?: number;
  providerStatus?: string;
  code?: string;
  message?: string;
  retryAfterMs?: number;
};

function errorLike(error: unknown): ErrorLike {
  return error && typeof error === "object" ? (error as ErrorLike) : {};
}

export function classifyRetry(error: unknown): RetryDecision {
  const value = errorLike(error);
  const hasExplicitStatus = typeof value.httpStatus === "number" || typeof value.status === "number";
  const status = value.httpStatus ?? value.status ?? 0;
  const providerStatus = value.providerStatus?.toUpperCase() ?? "";
  const code = value.code?.toLowerCase() ?? "";
  const message = value.message?.toLowerCase() ?? (error instanceof Error ? error.message.toLowerCase() : "");

  if (code.includes("cancel") || message.includes("cancelled") || message.includes("canceled")) {
    return { retryable: false, category: "cancelled" };
  }
  if (
    message.includes("no website") ||
    message.includes("not found") ||
    message.includes("no public") ||
    code.includes("not_found")
  ) {
    return { retryable: false, category: "no_data" };
  }
  if (status === 429 || providerStatus === "RESOURCE_EXHAUSTED" || message.includes("rate limit") || message.includes("quota")) {
    return { retryable: true, category: "quota", retryAfterMs: value.retryAfterMs };
  }
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    providerStatus === "INVALID_ARGUMENT" ||
    providerStatus === "PERMISSION_DENIED" ||
    message.includes("invalid request") ||
    message.includes("invalid argument") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("api key") ||
    message.includes("not configured") ||
    message.includes("missing configuration") ||
    message.includes("validation")
  ) {
    return { retryable: false, category: "permanent" };
  }
  if (
    (hasExplicitStatus && status === 0) ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    providerStatus === "TIMEOUT" ||
    providerStatus === "NETWORK_ERROR" ||
    providerStatus === "UNAVAILABLE" ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("temporary") ||
    message.includes("econnreset") ||
    message.includes("eai_again") ||
    error instanceof TypeError
  ) {
    return { retryable: true, category: "transient", retryAfterMs: value.retryAfterMs };
  }
  return { retryable: false, category: "permanent" };
}

export function retryDelayMs(attempt: number, retryAfterMs?: number) {
  if (retryAfterMs && retryAfterMs > 0) return Math.min(retryAfterMs, 10_000);
  const exponential = Math.min(500 * 2 ** Math.max(attempt - 1, 0), 4_000);
  const jitter = Math.floor(Math.random() * Math.max(100, exponential * 0.25));
  return exponential + jitter;
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    maxRetries?: number;
    shouldStop?: () => boolean | Promise<boolean>;
    onRetry?: (input: { attempt: number; delayMs: number; decision: RetryDecision; error: unknown }) => void | Promise<void>;
  } = {},
) {
  const maxRetries = Math.min(Math.max(options.maxRetries ?? 2, 0), 2);
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (await options.shouldStop?.()) throw new Error("Cancelled job.");
    try {
      return await operation(attempt + 1);
    } catch (error) {
      lastError = error;
      const decision = classifyRetry(error);
      if (!decision.retryable || attempt >= maxRetries || (await options.shouldStop?.())) throw error;
      const delayMs = retryDelayMs(attempt + 1, decision.retryAfterMs);
      await options.onRetry?.({ attempt: attempt + 1, delayMs, decision, error });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
