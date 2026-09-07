import { describe, it, expect, beforeEach } from "vitest";
import { issueSessionToken, verifySessionToken, SessionError } from "@/lib/auth/session";
import { __resetConfigCacheForTests } from "@/lib/config";

beforeEach(() => {
  __resetConfigCacheForTests();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.CELO_CHAIN_ID = "11142220";
  process.env.CELO_RPC_URL = "https://rpc.example.com";
  process.env.AUTH_SESSION_SECRET = "b".repeat(32);
  process.env.AUTH_SESSION_TTL_SECONDS = "86400";
});

describe("session tokens", () => {
  it("round-trips a valid token", () => {
    const token = issueSessionToken("profile-1", "0xabc");
    const payload = verifySessionToken(token);
    expect(payload.sub).toBe("profile-1");
    expect(payload.wallet).toBe("0xabc");
  });

  it("rejects a tampered payload (signature mismatch)", () => {
    const token = issueSessionToken("profile-1", "0xabc");
    const [encoded] = token.split(".");
    const tampered = `${encoded}extra.invalidsig`;
    expect(() => verifySessionToken(tampered)).toThrow(SessionError);
  });

  it("rejects a malformed token", () => {
    expect(() => verifySessionToken("not-a-real-token")).toThrow(SessionError);
  });

  it("rejects an expired token", () => {
    process.env.AUTH_SESSION_TTL_SECONDS = "-1";
    __resetConfigCacheForTests();
    const token = issueSessionToken("profile-1", "0xabc");
    expect(() => verifySessionToken(token)).toThrow(SessionError);
  });
});
