import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChallengeError, consumeChallenge, getChallenge, issueChallenge } from "@/lib/auth/nonce";
import { __resetConfigCacheForTests } from "@/lib/config";

const { fromMock, insertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getServiceRoleClient: () => ({ from: fromMock }),
}));

const originalEnv = { ...process.env };

describe("wallet challenge issuance", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      CELO_NETWORK: "celoSepolia",
      CELO_CHAIN_ID: "11142220",
      CELO_RPC_URL: "https://rpc.example.com",
      AUTH_SESSION_SECRET: "0123456789abcdef".repeat(4),
      AUTH_NONCE_TTL_SECONDS: "30",
    };
    __resetConfigCacheForTests();
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert: insertMock });
  });

  afterEach(() => {
    process.env = originalEnv;
    __resetConfigCacheForTests();
  });

  it("creates a cryptographically random 256-bit nonce with TTL and pilot chain binding", async () => {
    const walletAddress = `0x${"a".repeat(40)}`;
    const startedAt = Date.now();

    const challenge = await issueChallenge(walletAddress);

    expect(challenge.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(challenge.message).toContain(`Wallet: ${walletAddress}`);
    expect(challenge.message).toContain("Chain ID: 11142220");
    expect(challenge.message).toContain(`Nonce: ${challenge.nonce}`);
    expect(challenge.expiresAt.getTime()).toBeGreaterThanOrEqual(startedAt + 30_000);
    expect(challenge.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30_000);
    expect(fromMock).toHaveBeenCalledWith("auth_challenges");
    expect(insertMock).toHaveBeenCalledWith({
      wallet_address: walletAddress,
      nonce: challenge.nonce,
      expires_at: challenge.expiresAt.toISOString(),
    });
  });

  it("rejects an expired challenge even if it is unused", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({
      data: { nonce: "b".repeat(64), expires_at: new Date(Date.now() - 1).toISOString(), used_at: null },
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(getChallenge(`0x${"a".repeat(40)}`, "b".repeat(64))).rejects.toBeInstanceOf(ChallengeError);
  });

  it("rejects a concurrent nonce replay when conditional consumption updates no row", async () => {
    const finalUpdate = { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
      update: vi.fn(),
      is: vi.fn(),
      gt: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({
      data: { id: "challenge-1", expires_at: new Date(Date.now() + 30_000).toISOString(), used_at: null },
      error: null,
    });
    query.update.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.gt.mockReturnValue(finalUpdate);
    fromMock.mockReturnValue(query);

    await expect(consumeChallenge(`0x${"a".repeat(40)}`, "b".repeat(64))).rejects.toBeInstanceOf(ChallengeError);

    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ used_at: expect.any(String) }));
    expect(query.is).toHaveBeenCalledWith("used_at", null);
    expect(query.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
  });
});