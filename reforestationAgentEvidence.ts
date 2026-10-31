import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor, requireRole } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";

/** An agent can track only their own planting report review states. */
export async function GET(_req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(_req);
    requireRole(actor, ["agent"]);
    const supabase = getServiceRoleClient();
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id")
      .eq("profile_id", actor.profileId)
      .maybeSingle();
    if (agentError) throw agentError;
    if (!agent) return apiError("not_found", "No agent application on file.");

    const { data, error } = await supabase
      .from("reforestation_evidence")
      .select("id, project_id, planting_date, latitude, longitude, status, trees_verified, verified_at")
      .eq("agent_id", agent.id)
      .order("planting_date", { ascending: false });
    if (error) throw error;
    return apiOk(data);
  });
}