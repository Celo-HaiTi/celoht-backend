import "server-only";
import { randomBytes } from "node:crypto";
import { getConfig } from "@/lib/config";
import { getServiceRoleClient } from "@/lib/supabase/server";

/**
 * Nonce/challenge lifecycle for wallet authentication.
 *
 * Flow (see docs/AUTHENTICATION.md):
 *   1. Client requests a nonce for a wallet address -> `issueChallenge`
 *   2. Client signs the returned challenge message with their wallet
 *   3. Client submits the signature -> `consumeChallenge` verifies + burns it
 *
 * Nonces are stored server-side (Postgres, service role only) with an
 * expiry and a `used_at` marker so each challenge can be redeemed exactly
 * once. This defends against replay attacks and nonce reuse.
 *
 * Table (add via a backend-owned migration in this repo, not celoht-supabase,
 * since it is backend-internal auth state, not application data):
 *
 *   create table if not exists public.auth_challenges (
 *     id           uuid primary key default gen_random_uuid(),
 *     wallet_address text not null,
 *     nonce        text not null unique,
 *     expires_at   timestamptz not null,
 *     used_at      timestamptz,
 *     created_at   timestamptz not null default now()
 *   );
 *   -- RLS: no client-side access at all; service role only.
 */

export interface Challenge {
  walletAddress: string;
  nonce: string;
  message: string;
  expiresAt: Date;
}

function buildMessage(walletAddress: string, nonce: string, expiresAt: Date): string {
  return [
    "CeloHT wants you to sign in with your wallet.",
    `Wallet: ${walletAddress.toLowerCase()}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt.toISOString()}`,
  ].join("\n");
}

export async function getChallenge(walletAddress: string, nonce: string): Promise<Challenge> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("auth_challenges")
    .select("nonce, expires_at, used_at")
    .eq("wallet_address", walletAddress.toLowerCase())
    .eq("nonce", nonce)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.used_at) throw new ChallengeError("Unknown or already-consumed challenge.");

  const expiresAt = new Date(data.expires_at);
  if (expiresAt.getTime() < Date.now()) throw new ChallengeError("Challenge has expired.");

  return {
    walletAddress: walletAddress.toLowerCase(),
    nonce: data.nonce,
    message: buildMessage(walletAddress, data.nonce, expiresAt),
    expiresAt,
  };
}

export async function issueChallenge(walletAddress: string): Promise<Challenge> {
  const config = getConfig();
  const nonce = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + config.AUTH_NONCE_TTL_SECONDS * 1000);
  const message = buildMessage(walletAddress, nonce, expiresAt);

  const supabase = getServiceRoleClient();
  const { error } = await supabase.from("auth_challenges").insert({
    wallet_address: walletAddress.toLowerCase(),
    nonce,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;

  return { walletAddress, nonce, message, expiresAt };
}

export class ChallengeError extends Error {}

/**
 * Atomically marks a challenge as used and returns it, or throws if it does
 * not exist, is expired, or was already consumed. Callers must verify the
 * signature against `message` BEFORE trusting the wallet address.
 */
export async function consumeChallenge(walletAddress: string, nonce: string): Promise<void> {
  const supabase = getServiceRoleClient();

  const { data, error } = await supabase
    .from("auth_challenges")
    .select("id, expires_at, used_at")
    .eq("wallet_address", walletAddress.toLowerCase())
    .eq("nonce", nonce)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ChallengeError("Unknown or already-consumed challenge.");
  if (data.used_at) throw new ChallengeError("Challenge has already been used.");
  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw new ChallengeError("Challenge has expired.");
  }

  // Mark used. A unique partial index / check in the migration should make
  // double-consumption impossible even under a race; this update is scoped
  // to used_at IS NULL to enforce it here too.
  const { data: updated, error: updateError } = await supabase
    .from("auth_challenges")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id)
    .is("used_at", null)
    .select("id");

  if (updateError) throw updateError;
  if (!updated?.length) throw new ChallengeError("Challenge was already consumed concurrently.");
}
