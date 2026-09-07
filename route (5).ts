import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { AgentApplicationSchema } from "@/schemas/agents";

/** Returns the caller's own agent application/status. */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("agents")
      .select("id, off_chain_kyc_status, on_chain_registry_status, created_at, updated_at")
      .eq("profile_id", actor.profileId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiError("not_found", "No agent application on file.");
    return apiOk(data);
  });
}

/** Applies to become an agent. One application per profile. */
export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const body = AgentApplicationSchema.parse(await req.json());

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("agents")
      .insert({
        profile_id: actor.profileId,
        wallet_address: actor.walletAddress,
        application_data: body.applicationData,
      })
      .select("id, off_chain_kyc_status")
      .single();

    if (error) {
      if (error.code === "23505") return apiError("conflict", "An agent application already exists for this profile.");
      throw error;
    }
    return apiOk(data, 201);
  });
}
