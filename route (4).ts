import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor, requireRole } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { EvidenceDecisionSchema } from "@/schemas/reforestation";
import { writeAuditLog } from "@/lib/audit";

/**
 * Reviewer/admin only. This is the sole path by which a financial
 * contribution can be reflected as verified physical impact — it is never
 * automatic from an on-chain payment event.
 */
export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["reviewer", "admin"]);
    const body = EvidenceDecisionSchema.parse(await req.json());

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("reforestation_evidence")
      .update({
        status: body.decision,
        trees_verified: body.decision === "verified" ? body.treesVerified ?? 0 : null,
        verified_by: actor.profileId,
        verified_at: new Date().toISOString(),
      })
      .eq("id", body.evidenceId)
      .select("id, project_id, status, trees_verified")
      .single();
    if (error) throw error;

    await writeAuditLog({
      actorId: actor.profileId,
      action: body.decision === "verified" ? "evidence_verification" : "evidence_rejection",
      targetTable: "reforestation_evidence",
      targetId: data.id,
      metadata: { treesVerified: data.trees_verified },
    });

    return apiOk(data);
  });
}
