import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor, requireRole } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { KycDecisionSchema } from "@/schemas/agents";
import { writeAuditLog } from "@/lib/audit";

/** Reviewer/admin: list pending KYC submissions. */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["reviewer", "admin"]);

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("agent_kyc")
      .select("id, agent_id, document_type, status, submitted_at")
      .in("status", ["submitted", "under_review"])
      .order("submitted_at", { ascending: true });
    if (error) throw error;
    return apiOk(data);
  });
}

/** Reviewer/admin: approve or reject a KYC submission. Every decision is
 * audit-logged in the same request, satisfying the append-only audit trail
 * requirement for sensitive administrative actions. */
export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["reviewer", "admin"]);
    const body = KycDecisionSchema.parse(await req.json());

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("agent_kyc")
      .update({
        status: body.decision,
        reviewer_id: actor.profileId,
        reviewer_notes: body.reviewerNotes ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", body.kycId)
      .select("id, agent_id, status")
      .single();
    if (error) throw error;

    await writeAuditLog({
      actorId: actor.profileId,
      action: "kyc_review",
      targetTable: "agent_kyc",
      targetId: data.id,
      metadata: { decision: body.decision },
    });

    // Reflect an approval into the agent's off-chain status.
    if (body.decision === "approved") {
      await supabase
        .from("agents")
        .update({ off_chain_kyc_status: "approved", reviewed_by: actor.profileId, reviewed_at: new Date().toISOString() })
        .eq("id", data.agent_id);
    } else {
      await supabase
        .from("agents")
        .update({ off_chain_kyc_status: "rejected", reviewed_by: actor.profileId, reviewed_at: new Date().toISOString() })
        .eq("id", data.agent_id);
    }

    return apiOk(data);
  });
}
