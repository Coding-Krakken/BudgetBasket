// In-memory sliding-window rate limiter for API routes.
// In production with Redis, replace the store with a distributed counter.

interface WindowEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, WindowEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Returns whether the given key is within the rate limit.
 * @param key     Unique identifier for the limit (e.g. "ip:optimize:1.2.3.4")
 * @param max     Maximum requests per window
 * @param windowMs Window size in milliseconds
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, limit: max, remaining: max - 1, resetAt: now + windowMs };
  }

  existing.count += 1;
  const remaining = Math.max(0, max - existing.count);
  return {
    allowed: existing.count <= max,
    limit: max,
    remaining,
    resetAt: existing.resetAt,
  };
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.allowed ? {} : { "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)) }),
  };
}
