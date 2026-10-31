import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
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
      .select("id, agent_id, document_type, storage_path, status, submitted_at")
      .in("status", ["submitted", "under_review"])
      .order("submitted_at", { ascending: true });
    if (error) throw error;

    const submissions = await Promise.all((data ?? []).map(async (submission) => {
      const { data: signedFile, error: signedFileError } = await supabase.storage
        .from("agent-kyc")
        .createSignedUrl(submission.storage_path, 300);
      if (signedFileError) throw signedFileError;
      return {
        id: submission.id,
        agentId: submission.agent_id,
        documentType: submission.document_type,
        status: submission.status,
        submittedAt: submission.submitted_at,
        documentUrl: signedFile.signedUrl,
        documentUrlExpiresInSeconds: 300,
      };
    }));
    return apiOk(submissions);
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
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiError("not_found", "KYC submission not found.");

    await writeAuditLog({
      actorId: actor.profileId,
      action: "kyc_review",
      targetTable: "agent_kyc",
      targetId: data.id,
      metadata: { decision: body.decision },
    });

    // Reflect an approval into the agent's off-chain status.
    if (body.decision === "approved") {
      const { error: agentUpdateError } = await supabase
        .from("agents")
        .update({ off_chain_kyc_status: "approved", reviewed_by: actor.profileId, reviewed_at: new Date().toISOString() })
        .eq("id", data.agent_id);
      if (agentUpdateError) throw agentUpdateError;
    } else {
      const { error: agentUpdateError } = await supabase
        .from("agents")
        .update({ off_chain_kyc_status: "rejected", reviewed_by: actor.profileId, reviewed_at: new Date().toISOString() })
        .eq("id", data.agent_id);
      if (agentUpdateError) throw agentUpdateError;
    }

    return apiOk(data);
  });
}
