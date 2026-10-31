import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as issueNonce } from "./route (9)";
import { POST as verifyWallet } from "./route (10)";
import { POST as logout } from "./route (8)";
import { GET as getSession } from "./route (18)";

const mocks = vi.hoisted(() => {
  class ChallengeError extends Error {}
  class AuthError extends Error {
    constructor(public code: "unauthenticated" | "unauthorized", message: string) {
      super(message);
    }
  }

  return {
    ChallengeError,
    AuthError,
    issueChallenge: vi.fn(),
    getChallenge: vi.fn(),
    consumeChallenge: vi.fn(),
    verifyWalletSignature: vi.fn(),
    issueSessionToken: vi.fn(),
    getSessionCookieOptions: vi.fn(),
    checkRateLimit: vi.fn(),
    requireActor: vi.fn(),
    from: vi.fn(),
  };
});

vi.mock("@/lib/auth/nonce", () => ({
  ChallengeError: mocks.ChallengeError,
  issueChallenge: mocks.issueChallenge,
  getChallenge: mocks.getChallenge,
  consumeChallenge: mocks.consumeChallenge,
}));

vi.mock("@/lib/auth/session", () => ({
  verifyWalletSignature: mocks.verifyWalletSignature,
  issueSessionToken: mocks.issueSessionToken,
  getSessionCookieOptions: mocks.getSessionCookieOptions,
}));

vi.mock("@/lib/auth/authorization", () => ({
  AuthError: mocks.AuthError,
  SESSION_COOKIE_NAME: "celoht_session",
  requireActor: mocks.requireActor,
}));

vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/supabase/server", () => ({ getServiceRoleClient: () => ({ from: mocks.from }) }));

const walletAddress = `0x${"a".repeat(40)}`;
const nonce = "b".repeat(64);
const signature = `0x${"c".repeat(130)}`;

function jsonRequest(path: string, value: unknown): NextRequest {
  return new NextRequest(`https://backend.example/api/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

describe("wallet authentication endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue(false);
    mocks.issueChallenge.mockResolvedValue({
      message: "CeloHT sign-in challenge",
      nonce,
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.getChallenge.mockResolvedValue({ walletAddress, nonce, message: "CeloHT sign-in challenge" });
    mocks.consumeChallenge.mockResolvedValue(undefined);
    mocks.verifyWalletSignature.mockResolvedValue(true);
    mocks.issueSessionToken.mockReturnValue("signed-session-token");
    mocks.getSessionCookieOptions.mockReturnValue({
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 86400,
    });
    mocks.requireActor.mockResolvedValue({
      profileId: "profile-1",
      walletAddress,
      role: "user",
    });

    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "profile-1", role: "user" }, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
  });

  it("rejects malformed JSON with the standard validation response", async () => {
    const request = new NextRequest("https://backend.example/api/v1/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await verifyWallet(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("validation_error");
    expect(response.headers.get("x-request-id")).toBe(body.error.requestId);
  });

  it("rate-limits nonce issuance before writing a challenge", async () => {
    mocks.checkRateLimit.mockResolvedValue(true);

    const response = await issueNonce(jsonRequest("/auth/nonce", { walletAddress }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
    expect(mocks.issueChallenge).not.toHaveBeenCalled();
  });

  it("rate-limits signature verification before challenge lookup", async () => {
    mocks.checkRateLimit.mockResolvedValue(true);

    const response = await verifyWallet(jsonRequest("/auth/verify", { walletAddress, nonce, signature }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
    expect(mocks.getChallenge).not.toHaveBeenCalled();
    expect(mocks.verifyWalletSignature).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature without consuming the nonce", async () => {
    mocks.verifyWalletSignature.mockResolvedValue(false);

    const response = await verifyWallet(jsonRequest("/auth/verify", { walletAddress, nonce, signature }));

    expect(response.status).toBe(401);
    expect(mocks.consumeChallenge).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects expired nonces before signature verification", async () => {
    mocks.getChallenge.mockRejectedValue(new mocks.ChallengeError("Challenge has expired."));

    const response = await verifyWallet(jsonRequest("/auth/verify", { walletAddress, nonce, signature }));

    expect(response.status).toBe(401);
    expect(mocks.verifyWalletSignature).not.toHaveBeenCalled();
    expect(mocks.consumeChallenge).not.toHaveBeenCalled();
  });

  it("rejects a nonce replay when atomic consumption reports it was already used", async () => {
    mocks.consumeChallenge.mockRejectedValue(new mocks.ChallengeError("Challenge was already consumed."));

    const response = await verifyWallet(jsonRequest("/auth/verify", { walletAddress, nonce, signature }));

    expect(response.status).toBe(401);
    expect(mocks.verifyWalletSignature).toHaveBeenCalledOnce();
    expect(mocks.consumeChallenge).toHaveBeenCalledOnce();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("sets an HTTP-only secure session cookie after valid signature verification", async () => {
    const response = await verifyWallet(jsonRequest("/auth/verify", { walletAddress, nonce, signature }));
    const body = await response.json();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body.data.walletAddress).toBe(walletAddress);
    expect(setCookie).toContain("celoht_session=signed-session-token");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=None/i);
  });

  it("returns 401 for session requests without a valid authenticated actor", async () => {
    mocks.requireActor.mockRejectedValue(new mocks.AuthError("unauthenticated", "No session present."));

    const response = await getSession(new NextRequest("https://backend.example/api/v1/auth/session"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
  });

  it("rate-limits authenticated session reads", async () => {
    mocks.checkRateLimit.mockResolvedValue(true);

    const response = await getSession(new NextRequest("https://backend.example/api/v1/auth/session"));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("auth-session:profile-1", 120, 60_000);
  });

  it("expires the session cookie on logout using the same cookie scope", async () => {
    const response = await logout();
    const body = await response.json();
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body.data.loggedOut).toBe(true);
    expect(setCookie).toContain("celoht_session=");
    expect(setCookie).toMatch(/Max-Age=0/i);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=None/i);
  });
});