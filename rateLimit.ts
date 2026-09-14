import "server-only";

const UPSTASH_URL_ENV = "UPSTASH_REDIS_REST_URL";
const UPSTASH_TOKEN_ENV = "UPSTASH_REDIS_REST_TOKEN";

/**
 * Minimal in-memory sliding-window limiter for single-instance/dev use.
 * Production uses checkRateLimit(), which coordinates through the configured
 * shared store. This local version must not be the only security control.
 */
const buckets = new Map<string, number[]>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  buckets.set(key, timestamps);
  return timestamps.length > limit;
}

const incrementScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return count
`;

function hasSharedStoreConfig(): boolean {
  return Boolean(process.env[UPSTASH_URL_ENV] && process.env[UPSTASH_TOKEN_ENV]);
}

/**
 * Uses an atomic Redis increment when configured. Production fails closed if
 * the shared store is missing or unavailable; local memory is for development
 * and tests only.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (!hasSharedStoreConfig()) {
    if (process.env.NODE_ENV === "production") return true;
    return isRateLimited(key, limit, windowMs);
  }

  try {
    const response = await fetch(process.env[UPSTASH_URL_ENV] as string, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env[UPSTASH_TOKEN_ENV]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EVAL", incrementScript, 1, key, limit, windowMs]),
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return true;
    const result = (await response.json()) as { result?: unknown };
    const count = Number(result.result);
    return !Number.isSafeInteger(count) || count > limit;
  } catch {
    return true;
  }
}
