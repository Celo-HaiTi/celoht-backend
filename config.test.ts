import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getConfig, ConfigurationError, __resetConfigCacheForTests } from "@/lib/config";

const VALID_ENV: Record<string, string> = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  CELO_NETWORK: "celoSepolia",
  CELO_CHAIN_ID: "11142220",
  CELO_RPC_URL: "https://rpc.example.com",
  AUTH_SESSION_SECRET: "0123456789abcdef".repeat(4),
};

describe("getConfig (fail closed)", () => {
  const original = { ...process.env };

  beforeEach(() => {
    __resetConfigCacheForTests();
    process.env = { ...original };
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  afterEach(() => {
    process.env = original;
    __resetConfigCacheForTests();
  });

  it("parses successfully with a complete, valid environment", () => {
    Object.assign(process.env, VALID_ENV);
    expect(getConfig().SUPABASE_PUBLISHABLE_KEY).toBe(VALID_ENV.SUPABASE_ANON_KEY);
    expect(getConfig().SUPABASE_SECRET_KEY).toBe(VALID_ENV.SUPABASE_SERVICE_ROLE_KEY);
  });

  for (const key of ["SUPABASE_URL", "CELO_NETWORK", "CELO_CHAIN_ID", "CELO_RPC_URL", "AUTH_SESSION_SECRET"]) {
    it(`throws ConfigurationError when ${key} is missing`, () => {
      Object.assign(process.env, VALID_ENV);
      delete process.env[key];
      expect(() => getConfig()).toThrow(ConfigurationError);
    });
  }

  it("accepts modern Supabase publishable and server-secret key aliases", () => {
    Object.assign(process.env, VALID_ENV, {
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      SUPABASE_SECRET_KEY: "sb_secret_test_key",
    });
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const config = getConfig();

    expect(config.SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_test_key");
    expect(config.SUPABASE_SECRET_KEY).toBe("sb_secret_test_key");
  });

  it("prefers modern keys when differing legacy aliases are also configured", () => {
    Object.assign(process.env, VALID_ENV, {
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_modern",
      SUPABASE_SECRET_KEY: "sb_secret_modern",
    });

    const config = getConfig();

    expect(config.SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_modern");
    expect(config.SUPABASE_SECRET_KEY).toBe("sb_secret_modern");
    expect(config.SUPABASE_ANON_KEY).toBe("sb_publishable_modern");
    expect(config.SUPABASE_SERVICE_ROLE_KEY).toBe("sb_secret_modern");
  });

  it.each([
    ["SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY"],
    ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"],
  ])("fails with the modern variable name when both %s and %s are missing", (legacyKey, modernKey) => {
    Object.assign(process.env, VALID_ENV);
    delete process.env[legacyKey];
    delete process.env[modernKey];

    try {
      getConfig();
      throw new Error("Expected configuration to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).variables).toContain(modernKey);
      expect((error as Error).message).not.toContain(VALID_ENV.SUPABASE_SERVICE_ROLE_KEY);
    }
  });

  it("rejects aliases that do not match Supabase's modern key prefixes", () => {
    Object.assign(process.env, VALID_ENV, {
      SUPABASE_PUBLISHABLE_KEY: "not-a-publishable-key",
      SUPABASE_SECRET_KEY: "not-a-secret-key",
    });
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => getConfig()).toThrow(ConfigurationError);
  });

  it("fails closed on an unconfigured/unofficial chain id (e.g. Mainnet without deployment metadata)", () => {
    Object.assign(process.env, VALID_ENV, { CELO_CHAIN_ID: "42220" });
    expect(() => getConfig()).toThrow(ConfigurationError);
  });

  it("requires the canonical Supabase project and Sepolia RPC in production", () => {
    Object.assign(process.env, VALID_ENV, {
      SUPABASE_URL: "https://cncplsjsqsxuespnacoa.supabase.co",
      CELO_RPC_URL: "https://forno.celo-sepolia.celo-testnet.org",
      NODE_ENV: "production",
      CELOHT_ALLOWED_ORIGIN: "https://app.celoht.com",
      UPSTASH_REDIS_REST_URL: "https://redis.example.com",
      UPSTASH_REDIS_REST_TOKEN: "unit-test-token",
    });
    __resetConfigCacheForTests();
    expect(() => getConfig()).not.toThrow();

    Object.assign(process.env, { SUPABASE_URL: "https://other-project.supabase.co" });
    __resetConfigCacheForTests();
    expect(() => getConfig()).toThrow(ConfigurationError);
  });

  it.each(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"])(
    "requires %s in production",
    (variable) => {
      Object.assign(process.env, VALID_ENV, {
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
        SUPABASE_SECRET_KEY: "sb_secret_test_key",
        SUPABASE_URL: "https://cncplsjsqsxuespnacoa.supabase.co",
        NODE_ENV: "production",
        CELO_RPC_URL: "https://forno.celo-sepolia.celo-testnet.org",
        CELOHT_ALLOWED_ORIGIN: "https://app.celoht.com",
        UPSTASH_REDIS_REST_URL: "https://redis.example.com",
        UPSTASH_REDIS_REST_TOKEN: "unit-test-token",
      });
      delete process.env[variable];

      try {
        getConfig();
        throw new Error("Expected production configuration to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).variables).toContain(variable);
      }
    }
  );

  it("rejects a session secret shorter than 32 characters", () => {
    Object.assign(process.env, VALID_ENV, { AUTH_SESSION_SECRET: "short" });
    expect(() => getConfig()).toThrow();
  });

  it("rejects a low-diversity session secret", () => {
    Object.assign(process.env, VALID_ENV, { AUTH_SESSION_SECRET: "a".repeat(32) });
    expect(() => getConfig()).toThrow(ConfigurationError);
  });

  it("rejects using the service-role key as the anon key", () => {
    Object.assign(process.env, VALID_ENV, { SUPABASE_ANON_KEY: VALID_ENV.SUPABASE_SERVICE_ROLE_KEY });
    expect(() => getConfig()).toThrow(ConfigurationError);
  });

  it("does not reveal key values in key-role validation errors", () => {
    Object.assign(process.env, VALID_ENV, {
      SUPABASE_PUBLISHABLE_KEY: "sb_secret_do_not_disclose",
    });

    try {
      getConfig();
      throw new Error("Expected configuration to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as Error).message).not.toContain("sb_secret_do_not_disclose");
    }
  });
});
