import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetConfigCacheForTests } from "@/lib/config";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

describe("server Supabase client key boundary", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    __resetConfigCacheForTests();
    vi.clearAllMocks();
  });

  it("initializes the privileged client with only the modern server secret", async () => {
    process.env = {
      ...originalEnv,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public_value",
      SUPABASE_SECRET_KEY: "sb_secret_server_value",
      CELO_NETWORK: "celoSepolia",
      CELO_CHAIN_ID: "11142220",
      CELO_RPC_URL: "https://rpc.example.com",
      AUTH_SESSION_SECRET: "0123456789abcdef".repeat(4),
    };

    const { getServiceRoleClient } = await import("./server");
    getServiceRoleClient();

    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_secret_server_value",
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    expect(JSON.stringify(createClientMock.mock.calls)).not.toContain("sb_publishable_public_value");
  });
});
