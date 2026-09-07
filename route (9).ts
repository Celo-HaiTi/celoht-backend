import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { NonceRequestSchema } from "@/schemas/auth";
import { issueChallenge } from "@/lib/auth/nonce";
import { isRateLimited } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const body = NonceRequestSchema.parse(await req.json());

    if (isRateLimited(`nonce:${body.walletAddress.toLowerCase()}`, 10, 60_000)) {
      return apiError("rate_limited", "Too many nonce requests for this wallet.");
    }

    const challenge = await issueChallenge(body.walletAddress);
    return apiOk({
      message: challenge.message,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt.toISOString(),
    });
  });
}
