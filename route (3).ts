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
      .select("id, agent_id, document_type, status, submitted_at, storage_path")
      .in("status", ["submitted", "under_review"])
      .order("submitted_at", { ascending: true });
    if (error) throw error;

    const queue = await Promise.all((data ?? []).map(async (item) => {
      if (!item.storage_path.startsWith(`${item.agent_id}/`) || item.storage_path.split("/").some((part: string) => part === "..") || item.storage_path.includes("\\")) {
        throw new Error("KYC document path violates its agent ownership prefix.");
      }
      const { data: file, error: signingError } = await supabase.storage
        .from("agent-kyc")
        .createSignedUrl(item.storage_path, 300);
      if (signingError) throw signingError;
      return {
        id: item.id,
        agent_id: item.agent_id,
        document_type: item.document_type,
        status: item.status,
        submitted_at: item.submitted_at,
        signedUrl: file.signedUrl,
      };
    }));
    return apiOk(queue);
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
      .in("status", ["submitted", "under_review"])
      .select("id, agent_id, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiError("conflict", "KYC submission has already been reviewed or does not exist.");

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
