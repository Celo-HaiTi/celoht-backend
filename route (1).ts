import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor, requireRole } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { AgentStatusDecisionSchema } from "@/schemas/agents";
import { writeAuditLog, type AuditAction } from "@/lib/audit";

const ACTION_BY_DECISION: Record<string, AuditAction> = {
  approved: "agent_approval",
  suspended: "agent_suspension",
  rejected: "agent_rejection",
};

/** Admin-only: suspend, approve, or reject an agent's off-chain status. */
export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["admin"]);
    const body = AgentStatusDecisionSchema.parse(await req.json());

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("agents")
      .update({
        off_chain_kyc_status: body.decision,
        reviewed_by: actor.profileId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", body.agentId)
      .select("id, off_chain_kyc_status")
      .single();
    if (error) throw error;

    await writeAuditLog({
      actorId: actor.profileId,
      action: ACTION_BY_DECISION[body.decision],
      targetTable: "agents",
      targetId: data.id,
      metadata: { reviewerNotes: body.reviewerNotes ?? null },
    });

    return apiOk(data);
  });
}
