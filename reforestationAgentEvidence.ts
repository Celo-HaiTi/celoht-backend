import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor, requireRole } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";

/** An agent can track only their own planting report review states. */
export async function GET(_req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(_req);
    requireRole(actor, ["agent"]);
    const { data, error } = await getServiceRoleClient()
      .from("reforestation_evidence")
      .select("id, project_id, status, trees_verified, verified_at, created_at")
      .eq("submitted_by", actor.profileId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return apiOk(data);
  });
}