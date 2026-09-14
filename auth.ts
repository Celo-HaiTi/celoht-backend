import { z } from "zod";

export const WalletAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid EVM wallet address");

export const NonceRequestSchema = z.object({
  walletAddress: WalletAddressSchema,
});

export const VerifyRequestSchema = z.object({
  walletAddress: WalletAddressSchema,
  nonce: z.string().regex(/^[0-9a-f]{64}$/, "Must be a valid challenge nonce"),
  signature: z
    .string()
    .regex(/^0x[0-9a-fA-F]{130}$/, "Must be a 65-byte hex signature"),
});
