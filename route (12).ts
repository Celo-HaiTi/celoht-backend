import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { z } from "zod";

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  avatarUrl: z.string().url().optional(),
});

export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    return apiOk({ profileId: actor.profileId, walletAddress: actor.walletAddress, role: actor.role });
  });
}

/** Note: role is never accepted here — it is not part of UpdateProfileSchema,
 * and profiles.role changes go exclusively through /api/v1/admin routes. */
export async function PATCH(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const body = UpdateProfileSchema.parse(await req.json());

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({ display_name: body.displayName, avatar_url: body.avatarUrl })
      .eq("id", actor.profileId)
      .select("id, display_name, avatar_url")
      .single();
    if (error) throw error;

    return apiOk(data);
  });
}
