import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { VerifyRequestSchema } from "@/schemas/auth";
import { consumeChallenge, getChallenge, ChallengeError } from "@/lib/auth/nonce";
import { verifyWalletSignature, issueSessionToken } from "@/lib/auth/session";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/authorization";
import { isRateLimited } from "@/lib/rateLimit";

/**
 * Full wallet-auth verification. Order matters:
 *   1. Rate-limit by wallet to blunt brute-force attempts.
 *   2. Verify the signature.
 *   3. Atomically consume the challenge (burns it — replay-proof).
 *   4. Upsert the profile and issue a session.
 */
export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const body = VerifyRequestSchema.parse(await req.json());
    const wallet = body.walletAddress.toLowerCase();

    if (isRateLimited(`verify:${wallet}`, 20, 60_000)) {
      return apiError("rate_limited", "Too many verification attempts for this wallet.");
    }

    let challenge;
    try {
      challenge = await getChallenge(wallet, body.nonce);
    } catch (err) {
      if (err instanceof ChallengeError) return apiError("unauthenticated", err.message);
      throw err;
    }

    const validSignature = await verifyWalletSignature({
      walletAddress: body.walletAddress as `0x${string}`,
      message: challenge.message,
      signature: body.signature as `0x${string}`,
    }).catch(() => false);

    if (!validSignature) {
      return apiError("unauthenticated", "Signature verification failed.");
    }

    try {
      await consumeChallenge(wallet, body.nonce);
    } catch (err) {
      if (err instanceof ChallengeError) {
        return apiError("unauthenticated", err.message);
      }
      throw err;
    }

    const supabase = getServiceRoleClient();

    const { data: existing, error: selectError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("wallet_address", wallet)
      .maybeSingle();
    if (selectError) throw selectError;

    let profileId: string;
    if (existing) {
      profileId = existing.id;
    } else {
      const { data: created, error: insertError } = await supabase
        .from("profiles")
        .insert({ wallet_address: wallet })
        .select("id")
        .single();
      if (insertError) throw insertError;
      profileId = created.id;
    }

    const token = issueSessionToken(profileId, wallet);
    const res = apiOk({ profileId, walletAddress: wallet });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Number(process.env.AUTH_SESSION_TTL_SECONDS ?? 86400),
    });
    return res;
  });
}
