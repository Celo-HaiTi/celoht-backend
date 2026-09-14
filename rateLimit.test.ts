import { afterEach, describe, it, expect, vi } from "vitest";
import { checkRateLimit, isRateLimited } from "@/lib/rateLimit";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("rate limiting", () => {
  it("allows requests under the limit", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(key, 5, 60_000)).toBe(false);
    }
  });

  it("blocks requests over the limit within the window", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) isRateLimited(key, 5, 60_000);
    expect(isRateLimited(key, 5, 60_000)).toBe(true);
  });

  it("uses the shared store atomically when configured", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: 6 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkRateLimit("wallet", 5, 60_000)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails closed when the shared store is unavailable", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unavailable")));

    await expect(checkRateLimit("wallet", 5, 60_000)).resolves.toBe(true);
  });
});
