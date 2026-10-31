import { describe, expect, it, vi } from "vitest";
import { CELO_SEPOLIA_CHAIN_ID } from "@/lib/governance/contract";
import { getGovernancePublicClient } from "@/lib/governance/server";

const configMocks = vi.hoisted(() => {
  class ConfigurationError extends Error {}
  return { ConfigurationError, getConfig: vi.fn() };
});

vi.mock("@/lib/config", () => ({
  ConfigurationError: configMocks.ConfigurationError,
  getConfig: configMocks.getConfig,
}));

describe("governance RPC configuration", () => {
  it("refuses to create a governance client for a non-Sepolia configured chain", () => {
    configMocks.getConfig.mockReturnValue({ CELO_CHAIN_ID: 42220 });

    expect(() => getGovernancePublicClient()).toThrow(configMocks.ConfigurationError);
    expect(configMocks.getConfig).toHaveBeenCalledOnce();
    expect(CELO_SEPOLIA_CHAIN_ID).toBe(11142220);
  });
});