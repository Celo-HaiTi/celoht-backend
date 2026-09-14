import { describe, expect, it } from "vitest";
import { NonceRequestSchema, VerifyRequestSchema } from "@/schemas/auth";

describe("wallet authentication request schemas", () => {
  it("rejects non-EVM wallet addresses", () => {
    expect(() => NonceRequestSchema.parse({ walletAddress: "not-a-wallet" })).toThrow();
  });

  it("rejects malformed challenge nonces and signatures", () => {
    expect(() =>
      VerifyRequestSchema.parse({
        walletAddress: `0x${"a".repeat(40)}`,
        nonce: "short",
        signature: "0xdeadbeef",
      })
    ).toThrow();
  });

  it("accepts a correctly shaped verification request", () => {
    expect(
      VerifyRequestSchema.parse({
        walletAddress: `0x${"a".repeat(40)}`,
        nonce: "a".repeat(64),
        signature: `0x${"b".repeat(130)}`,
      })
    ).toBeTruthy();
  });
});