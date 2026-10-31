import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor, requireRole } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { EvidenceDecisionSchema } from "@/schemas/reforestation";
import { writeAuditLog } from "@/lib/audit";

/** Reviewer/admin queue. File access is short-lived and never public. */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["reviewer", "admin"]);
    const supabase = getServiceRoleClient();
    const { data: evidence, error } = await supabase
      .from("reforestation_evidence")
      .select("id, project_id, agent_id, planting_date, latitude, longitude, notes, storage_paths, status")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const queue = await Promise.all((evidence ?? []).map(async (item) => {
      const signedFiles = await Promise.all((item.storage_paths ?? []).map(async (path: string) => {
        if (!path.startsWith(`${item.agent_id}/`) || path.split("/").some((part) => part === "..") || path.includes("\\")) {
          throw new Error("Stored evidence path violates its agent ownership prefix.");
        }
        const { data, error: signingError } = await supabase.storage
          .from("reforestation-evidence")
          .createSignedUrl(path, 300);
        if (signingError) throw signingError;
        return { path, signedUrl: data.signedUrl };
      }));
      return {
        id: item.id,
        project_id: item.project_id,
        agent_id: item.agent_id,
        planting_date: item.planting_date,
        latitude: item.latitude,
        longitude: item.longitude,
        notes: item.notes,
        status: item.status,
        files: signedFiles,
      };
    }));

    return apiOk(queue);
  });
}

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
        trees_verified: body.decision === "verified" ? body.treesVerified : null,
        verified_by: actor.profileId,
        verified_at: new Date().toISOString(),
      })
      .eq("id", body.evidenceId)
      .eq("status", "pending")
      .select("id, project_id, status, trees_verified")
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiError("conflict", "Planting evidence has already been reviewed or does not exist.");

    await writeAuditLog({
      actorId: actor.profileId,
      action: body.decision === "verified" ? "evidence_verification" : "evidence_rejection",
      targetTable: "reforestation_evidence",
      targetId: data.id,
      metadata: { treesVerified: data.trees_verified, reviewerNotes: body.reviewerNotes ?? null },
    });

    return apiOk(data);
  });
}
