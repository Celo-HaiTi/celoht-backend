import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route (17)";
import { __resetConfigCacheForTests } from "@/lib/config";

const { fromMock, selectMock, limitMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  limitMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getServiceRoleClient: () => ({ from: fromMock }),
}));

describe("GET /api/v1/health", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      CELO_NETWORK: "celoSepolia",
      CELO_CHAIN_ID: "11142220",
      CELO_RPC_URL: "https://rpc.example.com",
      AUTH_SESSION_SECRET: "0123456789abcdef".repeat(4),
      UPSTASH_REDIS_REST_URL: "https://redis.example.com",
      UPSTASH_REDIS_REST_TOKEN: "redis-token",
      CELOHT_ALLOWED_ORIGIN: "https://app.celoht.com",
    };
    __resetConfigCacheForTests();
    fromMock.mockReturnValue({ select: selectMock });
    selectMock.mockReturnValue({ limit: limitMock });
    limitMock.mockResolvedValue({ error: null });
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const result = String(url) === "https://redis.example.com" ? "PONG" : "0xaa044c";
      return Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 }));
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    __resetConfigCacheForTests();
  });

  it("returns a diagnostic 503 when required configuration is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    __resetConfigCacheForTests();

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details.missingOrInvalidVariables).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(JSON.stringify(body)).not.toContain("service-role-key");
  });

  it.each([
    "SUPABASE_ANON_KEY",
    "CELO_CHAIN_ID",
    "AUTH_SESSION_SECRET",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ])("reports missing %s without returning secret values", async (variable) => {
    delete process.env[variable];
    __resetConfigCacheForTests();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body.error.details.missingOrInvalidVariables).toContain(variable);
    expect(serialized).not.toContain("service-role-key");
    expect(serialized).not.toContain("redis-token");
    expect(JSON.stringify(log.mock.calls)).not.toContain("service-role-key");
    expect(JSON.stringify(log.mock.calls)).not.toContain("redis-token");
  });

  it("reports a weak session secret by variable name only", async () => {
    const weakSecret = "a".repeat(32);
    process.env.AUTH_SESSION_SECRET = weakSecret;
    __resetConfigCacheForTests();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details.missingOrInvalidVariables).toContain("AUTH_SESSION_SECRET");
    expect(JSON.stringify(body)).not.toContain(weakSecret);
    expect(JSON.stringify(log.mock.calls)).not.toContain(weakSecret);
  });

  it("returns 503 when the configured RPC is not Celo Sepolia", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0xa4ec" }), { status: 200 })
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details.dependencies.celoSepoliaRpc).toBe("unavailable");
  });

  it("returns 503 when Supabase read access fails", async () => {
    limitMock.mockResolvedValue({ error: { message: "private database detail" } });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details.dependencies.database).toBe("unavailable");
    expect(JSON.stringify(body)).not.toContain("private database detail");
  });

  it("reports healthy only after read-only Supabase and Sepolia checks pass", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.dependencies).toEqual({
      database: "healthy",
      celoSepoliaRpc: "healthy",
      rateLimitStore: "healthy",
    });
    expect(fromMock).toHaveBeenCalledWith("system_health");
  });

  it("returns 503 when the production rate-limit store is unreachable", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const result = String(url) === "https://redis.example.com" ? "NOT_PONG" : "0xaa044c";
      return Promise.resolve(new Response(JSON.stringify({ result }), { status: 200 }));
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details.dependencies.rateLimitStore).toBe("unavailable");
  });
});