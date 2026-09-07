import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { z } from "zod";

const SubmitKycSchema = z.object({
  documentType: z.string().min(1).max(60),
  storagePath: z.string().min(1), // path already uploaded to the private agent-kyc bucket
});

export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const supabase = getServiceRoleClient();

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id")
      .eq("profile_id", actor.profileId)
      .maybeSingle();
    if (agentError) throw agentError;
    if (!agent) return apiError("not_found", "No agent application on file.");

    const { data, error } = await supabase
      .from("agent_kyc")
      .select("id, document_type, status, submitted_at, reviewed_at")
      .eq("agent_id", agent.id)
      .order("submitted_at", { ascending: false });
    if (error) throw error;

    return apiOk(data);
  });
}

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const body = SubmitKycSchema.parse(await req.json());
    const supabase = getServiceRoleClient();

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id")
      .eq("profile_id", actor.profileId)
      .maybeSingle();
    if (agentError) throw agentError;
    if (!agent) return apiError("not_found", "No agent application on file.");

    const { data, error } = await supabase
      .from("agent_kyc")
      .insert({
        agent_id: agent.id,
        document_type: body.documentType,
        storage_path: body.storagePath,
      })
      .select("id, status")
      .single();
    if (error) throw error;

    // Move the agent into kyc_review if this is the first submission in that state.
    await supabase
      .from("agents")
      .update({ off_chain_kyc_status: "kyc_review" })
      .eq("id", agent.id)
      .eq("off_chain_kyc_status", "pending");

    return apiOk(data, 201);
  });
}
