import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

const getConfig = vi.hoisted(() => vi.fn());

vi.mock("./config", () => ({ getConfig }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("production configuration startup validation", () => {
  it("validates production configuration before the Node server accepts requests", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");

    await register();

    expect(getConfig).toHaveBeenCalledOnce();
  });

  it("fails server startup when production configuration is invalid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    getConfig.mockImplementation(() => {
      throw new Error("Missing required production configuration: UPSTASH_REDIS_REST_TOKEN");
    });

    await expect(register()).rejects.toThrow("UPSTASH_REDIS_REST_TOKEN");
  });

  it("skips configuration validation during production builds", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");

    await register();

    expect(getConfig).not.toHaveBeenCalled();
  });

  it("does not run Node-only validation in the Edge runtime", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await register();

    expect(getConfig).not.toHaveBeenCalled();
  });
});