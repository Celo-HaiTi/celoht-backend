import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getConfig, ConfigurationError, __resetConfigCacheForTests } from "@/lib/config";

const REQUIRED_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CELO_CHAIN_ID",
  "CELO_RPC_URL",
  "AUTH_SESSION_SECRET",
];

const VALID_ENV: Record<string, string> = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  CELO_CHAIN_ID: "11142220",
  CELO_RPC_URL: "https://rpc.example.com",
  AUTH_SESSION_SECRET: "a".repeat(32),
};

describe("getConfig (fail closed)", () => {
  const original = { ...process.env };

  beforeEach(() => {
    __resetConfigCacheForTests();
    process.env = { ...original };
  });

  afterEach(() => {
    process.env = original;
    __resetConfigCacheForTests();
  });

  it("parses successfully with a complete, valid environment", () => {
    Object.assign(process.env, VALID_ENV);
    expect(() => getConfig()).not.toThrow();
  });

  for (const key of REQUIRED_KEYS) {
    it(`throws ConfigurationError when ${key} is missing`, () => {
      Object.assign(process.env, VALID_ENV);
      delete process.env[key];
      expect(() => getConfig()).toThrow(ConfigurationError);
    });
  }

  it("fails closed on an unconfigured/unofficial chain id (e.g. Mainnet without deployment metadata)", () => {
    Object.assign(process.env, VALID_ENV, { CELO_CHAIN_ID: "42220" });
    expect(() => getConfig()).toThrow(ConfigurationError);
  });

  it("rejects a session secret shorter than 32 characters", () => {
    Object.assign(process.env, VALID_ENV, { AUTH_SESSION_SECRET: "short" });
    expect(() => getConfig()).toThrow();
  });
});
