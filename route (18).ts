import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor } from "@/lib/auth/authorization";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    if (await checkRateLimit(`auth-session:${actor.profileId}`, 120, 60_000)) {
      return apiError("rate_limited", "Too many session requests.");
    }

    return apiOk({
      authenticated: true,
      profileId: actor.profileId,
      walletAddress: actor.walletAddress,
      role: actor.role,
    });
  });
}