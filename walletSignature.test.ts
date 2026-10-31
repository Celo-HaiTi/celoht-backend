import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyWalletSignature } from "@/lib/auth/session";

describe("wallet signature verification", () => {
  it("accepts a signature from the claimed wallet", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const message = "CeloHT authentication test challenge";
    const signature = await account.signMessage({ message });

    await expect(
      verifyWalletSignature({
        walletAddress: account.address,
        message,
        signature,
      })
    ).resolves.toBe(true);
  });

  it("rejects a valid signature when the claimed wallet is different", async () => {
    const signer = privateKeyToAccount(generatePrivateKey());
    const otherWallet = privateKeyToAccount(generatePrivateKey());
    const message = "CeloHT authentication test challenge";
    const signature = await signer.signMessage({ message });

    await expect(
      verifyWalletSignature({
        walletAddress: otherWallet.address,
        message,
        signature,
      })
    ).resolves.toBe(false);
  });
});