import "server-only";

import { redis } from "@/lib/redis";

export type WorkloadLease = { release: () => Promise<void> };

const memoryLocks = new Map<string, { token: string; expiresAt: number }>();

function prune() {
  const now = Date.now();
  for (const [key, value] of memoryLocks) if (value.expiresAt <= now) memoryLocks.delete(key);
}

export async function acquireWorkloadLease(key: string, ttlSeconds: number): Promise<WorkloadLease | null> {
  const token = crypto.randomUUID();
  const boundedTtl = Math.min(Math.max(Math.floor(ttlSeconds), 5), 60 * 60);

  if (redis) {
    const redisClient = redis;
    try {
      const acquired = await redisClient.set(key, token, { nx: true, ex: boundedTtl });
      if (!acquired) return null;
      return {
        release: async () => {
          try {
            if ((await redisClient.get<string>(key)) === token) await redisClient.del(key);
          } catch {
            // The lease expires automatically.
          }
        },
      };
    } catch {
      // Fall through to the in-process guard when Redis is unavailable.
    }
  }

  prune();
  if (memoryLocks.has(key)) return null;
  memoryLocks.set(key, { token, expiresAt: Date.now() + boundedTtl * 1_000 });
  return {
    release: async () => {
      if (memoryLocks.get(key)?.token === token) memoryLocks.delete(key);
    },
  };
}
