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
      SUPABASE_URL: "https://cncplsjsqsxuespnacoa.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      SUPABASE_SECRET_KEY: "sb_secret_test_key",
      CELO_NETWORK: "celoSepolia",
      CELO_CHAIN_ID: "11142220",
      CELO_RPC_URL: "https://forno.celo-sepolia.celo-testnet.org",
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
    delete process.env.SUPABASE_SECRET_KEY;
    __resetConfigCacheForTests();

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details.missingOrInvalidVariables).toContain("SUPABASE_SECRET_KEY");
    expect(JSON.stringify(body)).not.toContain("sb_secret_test_key");
  });

  it.each([
    "SUPABASE_PUBLISHABLE_KEY",
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
    expect(serialized).not.toContain("sb_secret_test_key");
    expect(serialized).not.toContain("redis-token");
    expect(JSON.stringify(log.mock.calls)).not.toContain("sb_secret_test_key");
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
    limitMock.mockResolvedValue({
      error: { code: "42501", message: "private database detail with sensitive context" },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details.dependencies.database).toBe("unavailable");
    expect(body.error.details.diagnostics.database).toBe("permission_denied");
    expect(JSON.stringify(body)).not.toContain("private database detail");
  });

  it("reports a missing table using a safe diagnostic code", async () => {
    limitMock.mockResolvedValue({ error: { code: "PGRST205", message: "private relation details" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details.diagnostics.database).toBe("table_unavailable");
    expect(JSON.stringify(body)).not.toContain("private relation details");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private relation details");
    expect(JSON.stringify(log.mock.calls)).toContain("table_unavailable");
  });

  it("reports a rejected database request without logging the thrown error", async () => {
    limitMock.mockRejectedValue(new Error("private network and credential details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details.diagnostics.database).toBe("query_failed");
    expect(JSON.stringify(body)).not.toContain("private network and credential details");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private network and credential details");
  });

  it("classifies a Supabase URL or network failure without exposing its message", async () => {
    limitMock.mockRejectedValue(new TypeError("fetch failed: private project URL"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details.diagnostics.database).toBe("connection_failed");
    expect(JSON.stringify(body)).not.toContain("private project URL");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private project URL");
  });

  it("classifies a schema mismatch without exposing the provider message", async () => {
    limitMock.mockResolvedValue({ error: { code: "PGRST204", message: "private schema detail" } });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details.diagnostics.database).toBe("schema_incompatible");
    expect(JSON.stringify(body)).not.toContain("private schema detail");
  });

  it("reports healthy only after read-only Supabase and Sepolia checks pass", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.dependencies).toEqual({
      database: "healthy",
      indexerData: "healthy",
      celoSepoliaRpc: "healthy",
      rateLimitStore: "healthy",
    });
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(fromMock).toHaveBeenCalledWith("blockchain_transactions");
  });

  it("returns 503 when the indexer-owned transaction table is unavailable", async () => {
    fromMock.mockImplementation((table: string) =>
      table === "blockchain_transactions"
        ? { select: () => ({ limit: () => Promise.resolve({ error: { code: "PGRST205" } }) }) }
        : { select: selectMock }
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details.dependencies.indexerData).toBe("unavailable");
    expect(body.error.details.diagnostics.indexerData).toBe("table_unavailable");
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

  it("never reports ready when the rate-limit store is missing, including outside production", async () => {
    process.env = { ...process.env, NODE_ENV: "test" };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __resetConfigCacheForTests();

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details.dependencies).toEqual({
      database: "healthy",
      indexerData: "healthy",
      celoSepoliaRpc: "healthy",
      rateLimitStore: "unavailable",
    });
  });
});