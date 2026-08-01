import { handleCallback } from "@vercel/queue";
import { processEnrichmentQueueMessage, type EnrichmentQueueMessage } from "@/lib/enrichment-jobs";
import { classifyRetry } from "@/lib/retry-policy";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = handleCallback<EnrichmentQueueMessage>(
  async (message, metadata) => {
    await processEnrichmentQueueMessage(message, metadata.deliveryCount);
  },
  {
    visibilityTimeoutSeconds: WORKLOAD_LIMITS.durableEnrichment.queueVisibilitySeconds,
    retry: (error, metadata) => {
      const decision = classifyRetry(error);
      if (!decision.retryable || metadata.deliveryCount >= WORKLOAD_LIMITS.durableEnrichment.maxConsumerAttempts) {
        return { acknowledge: true };
      }
      return { afterSeconds: Math.min(120, 10 * 2 ** Math.max(metadata.deliveryCount - 1, 0)) };
    },
  },
);
