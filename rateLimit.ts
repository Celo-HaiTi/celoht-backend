import "server-only";

/**
 * Minimal in-memory sliding-window limiter for single-instance/dev use.
 * Production deployments with multiple instances MUST replace this with a
 * shared store (e.g. Upstash Redis) — this in-memory version does not
 * coordinate across processes and must not be relied on as the only
 * defense for security-sensitive endpoints (pair with the nonce/session
 * mechanisms in src/lib/auth, which are correct regardless of rate limiting).
 */
const buckets = new Map<string, number[]>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  buckets.set(key, timestamps);
  return timestamps.length > limit;
}
