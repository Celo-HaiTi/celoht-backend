import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor, requireRole } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { EvidenceDecisionSchema } from "@/schemas/reforestation";
import { writeAuditLog } from "@/lib/audit";
import { isOwnedStoragePath } from "@/lib/storage/path";

/** Reviewer/admin queue. File access is short-lived and never public. */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["reviewer", "admin"]);
    const supabase = getServiceRoleClient();
    const { data: evidence, error } = await supabase
      .from("reforestation_evidence")
      .select("id, project_id, submitted_by, storage_path, trees_verified, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const queue = await Promise.all((evidence ?? []).map(async (item) => {
      if (!isOwnedStoragePath(item.storage_path, item.project_id)) {
        throw new Error("Stored evidence path violates its project ownership prefix.");
      }
      const { data: file, error: signingError } = await supabase.storage
        .from("reforestation-evidence")
        .createSignedUrl(item.storage_path, 300);
      if (signingError) throw signingError;
      return {
        id: item.id,
        project_id: item.project_id,
        submitted_by: item.submitted_by,
        trees_verified: item.trees_verified,
        status: item.status,
        created_at: item.created_at,
        signedUrl: file.signedUrl,
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
    const { data: existing, error: existingError } = await supabase
      .from("reforestation_evidence")
      .select("id, submitted_by, status")
      .eq("id", body.evidenceId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing || existing.status !== "pending") {
      return apiError("conflict", "Planting evidence has already been reviewed or does not exist.");
    }
    if (existing.submitted_by === actor.profileId) {
      return apiError("unauthorized", "Reviewers cannot review their own planting evidence.");
    }

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
