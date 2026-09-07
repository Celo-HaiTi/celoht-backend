import "server-only";
import { verifyMessage } from "viem";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getConfig } from "@/lib/config";

/**
 * Verifies that `signature` over `message` was produced by `walletAddress`.
 * Never trusts a wallet address the client merely claims — this check is
 * what actually establishes the address.
 */
export async function verifyWalletSignature(params: {
  walletAddress: `0x${string}`;
  message: string;
  signature: `0x${string}`;
}): Promise<boolean> {
  return verifyMessage({
    address: params.walletAddress,
    message: params.message,
    signature: params.signature,
  });
}

interface SessionPayload {
  sub: string; // profile id
  wallet: string;
  iat: number;
  exp: number;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Minimal signed session token (HMAC). Swap for Supabase Auth's own session
 * issuance if you prefer to fully delegate session storage; this exists so
 * the wallet-auth flow does not require the browser to hold a private key
 * or a Supabase password. */
export function issueSessionToken(profileId: string, walletAddress: string): string {
  const config = getConfig();
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: profileId,
    wallet: walletAddress.toLowerCase(),
    iat: now,
    exp: now + config.AUTH_SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = sign(encoded, config.AUTH_SESSION_SECRET);
  return `${encoded}.${sig}`;
}

export class SessionError extends Error {}

export function verifySessionToken(token: string): SessionPayload {
  const config = getConfig();
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) throw new SessionError("Malformed session token.");

  const expectedSig = sign(encoded, config.AUTH_SESSION_SECRET);
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new SessionError("Invalid session signature.");
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new SessionError("Session has expired.");
  }
  return payload;
}
