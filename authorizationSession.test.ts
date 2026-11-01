import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireActor, AuthError } from "@/lib/auth/authorization";
import { issueSessionToken } from "@/lib/auth/session";
import { __resetConfigCacheForTests } from "@/lib/config";

const { fromMock, selectMock, eqMock, maybeSingleMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  maybeSingleMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getServiceRoleClient: () => ({ from: fromMock }),
}));

const originalEnv = { ...process.env };
const walletAddress = `0x${"a".repeat(40)}`;

function requestWithToken(token?: string): NextRequest {
  return new NextRequest("https://backend.example/api/v1/profile", {
    headers: token ? { cookie: `celoht_session=${token}` } : {},
  });
}

describe("requireActor session authorization", () => {
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
    };
    __resetConfigCacheForTests();
    vi.clearAllMocks();

    const query = { select: selectMock, eq: eqMock, maybeSingle: maybeSingleMock };
    selectMock.mockReturnValue(query);
    eqMock.mockReturnValue(query);
    fromMock.mockReturnValue(query);
  });

  afterEach(() => {
    process.env = originalEnv;
    __resetConfigCacheForTests();
  });

  it("reloads the role and verifies the token wallet against the profile on every request", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { id: "profile-1", wallet_address: walletAddress, role: "reviewer" },
      error: null,
    });
    const token = issueSessionToken("profile-1", walletAddress);

    const actor = await requireActor(requestWithToken(token));

    expect(actor).toEqual({ profileId: "profile-1", walletAddress, role: "reviewer" });
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(eqMock).toHaveBeenNthCalledWith(1, "id", "profile-1");
    expect(eqMock).toHaveBeenNthCalledWith(2, "wallet_address", walletAddress);
  });

  it("rejects a profile whose stored wallet does not match the signed session", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { id: "profile-1", wallet_address: `0x${"b".repeat(40)}`, role: "admin" },
      error: null,
    });
    const token = issueSessionToken("profile-1", walletAddress);

    await expect(requireActor(requestWithToken(token))).rejects.toBeInstanceOf(AuthError);
  });

  it("revokes a valid session when its profile no longer exists", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const token = issueSessionToken("profile-1", walletAddress);

    await expect(requireActor(requestWithToken(token))).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects missing and malformed session cookies without querying profiles", async () => {
    await expect(requireActor(requestWithToken())).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(requireActor(requestWithToken("invalid-token"))).rejects.toMatchObject({ code: "unauthenticated" });

    expect(fromMock).not.toHaveBeenCalled();
  });
});