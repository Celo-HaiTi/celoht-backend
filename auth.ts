import { z } from "zod";

export const WalletAddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Must be a valid EVM wallet address");

export const NonceRequestSchema = z.object({
  walletAddress: WalletAddressSchema,
});

export const VerifyRequestSchema = z.object({
  walletAddress: WalletAddressSchema,
  nonce: z.string().min(32),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "Must be a valid hex signature"),
});
