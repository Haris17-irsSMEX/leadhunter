import "server-only";

import { createHash } from "node:crypto";
import { redis } from "@/lib/redis";

export const PUBLIC_DATA_FRESHNESS = {
  googlePlacesMs: 7 * 24 * 60 * 60 * 1_000,
  websiteContactMs: 7 * 24 * 60 * 60 * 1_000,
  decisionMakerMs: 7 * 24 * 60 * 60 * 1_000,
  cityResolutionMs: 30 * 24 * 60 * 60 * 1_000,
  invalidWebsiteMs: 30 * 60 * 1_000,
} as const;

type CacheEnvelope<T> = {
  value: T;
  createdAt: number;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEnvelope<unknown>>();
const MAX_MEMORY_ENTRIES = 500;

export function publicCacheKey(namespace: string, value: string, version = "v1") {
  const digest = createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
  return `public-data:${namespace}:${version}:${digest}`;
}

function pruneMemoryCache() {
  const now = Date.now();
  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt <= now) memoryCache.delete(key);
  }
  while (memoryCache.size > MAX_MEMORY_ENTRIES) {
    const oldest = memoryCache.keys().next().value as string | undefined;
    if (!oldest) break;
    memoryCache.delete(oldest);
  }
}

function asEnvelope<T>(value: unknown): CacheEnvelope<T> | null {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.createdAt !== "number" || typeof record.expiresAt !== "number" || !("value" in record)) return null;
  return parsed as CacheEnvelope<T>;
}

export async function getPublicDataCache<T>(key: string): Promise<T | null> {
  const now = Date.now();
  if (redis) {
    try {
      const envelope = asEnvelope<T>(await redis.get(key));
      if (envelope && envelope.expiresAt > now) return envelope.value;
      if (envelope) await redis.del(key);
    } catch {
      // Fall through to the bounded in-process cache when Redis is unavailable.
    }
  }

  pruneMemoryCache();
  const envelope = memoryCache.get(key) as CacheEnvelope<T> | undefined;
  if (!envelope || envelope.expiresAt <= now) return null;
  return envelope.value;
}

export async function setPublicDataCache<T>(key: string, value: T, freshnessMs: number) {
  const now = Date.now();
  const boundedFreshnessMs = Math.min(Math.max(Math.floor(freshnessMs), 1_000), 30 * 24 * 60 * 60 * 1_000);
  const envelope: CacheEnvelope<T> = {
    value,
    createdAt: now,
    expiresAt: now + boundedFreshnessMs,
  };
  memoryCache.set(key, envelope as CacheEnvelope<unknown>);
  pruneMemoryCache();

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(envelope), { ex: Math.ceil(boundedFreshnessMs / 1_000) });
    } catch {
      // Public-data caching is an optimization and must never block the workflow.
    }
  }
}

export async function deletePublicDataCache(key: string) {
  memoryCache.delete(key);
  if (redis) {
    try {
      await redis.del(key);
    } catch {
      // A failed invalidation must not erase user-owned data or fail the request.
    }
  }
}
