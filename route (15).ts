import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor, requireRole } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { PlantingEvidenceSubmissionSchema } from "@/schemas/reforestation";
import { writeAuditLog } from "@/lib/audit";

/** Public reports include verified records only; evidence files remain private. */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const projectId = new URL(req.url).searchParams.get("projectId");
    const supabase = getServiceRoleClient();
    let query = supabase
      .from("reforestation_evidence")
      .select("id, project_id, trees_verified, planting_date, latitude, longitude, verified_at")
      .eq("status", "verified");
    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) throw error;
    return apiOk(data);
  });
}

/** Approved field agents can register evidence uploaded to the private bucket. */
export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["agent"]);
    const body = PlantingEvidenceSubmissionSchema.parse(await req.json());
    const supabase = getServiceRoleClient();

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, off_chain_kyc_status")
      .eq("profile_id", actor.profileId)
      .maybeSingle();
    if (agentError) throw agentError;
    if (!agent) return apiError("not_found", "No agent application on file.");
    if (agent.off_chain_kyc_status !== "approved") {
      return apiError("unauthorized", "Only approved agents may submit planting evidence.");
    }

    if (body.storagePaths.some((path) =>
      !path.startsWith(`${agent.id}/`) || path.split("/").some((part) => part === "..") || path.includes("\\")
    )) {
      return apiError("unauthorized", "Evidence files must be stored under the submitting agent's private path.");
    }

    const [{ data: project, error: projectError }, ...files] = await Promise.all([
      supabase
        .from("reforestation_projects")
        .select("id")
        .eq("id", body.projectId)
        .eq("status", "published")
        .maybeSingle(),
      ...body.storagePaths.map((path) => supabase.storage
        .from("reforestation-evidence")
        .createSignedUrl(path, 60)),
    ]);
    if (projectError) throw projectError;
    if (!project) return apiError("not_found", "Published project not found.");
    if (files.some((file) => file.error)) {
      return apiError("validation_error", "One or more evidence files are unavailable in private storage.");
    }

    const { data, error } = await supabase
      .from("reforestation_evidence")
      .insert({
        project_id: body.projectId,
        agent_id: agent.id,
        planting_date: body.plantingDate,
        latitude: body.latitude,
        longitude: body.longitude,
        notes: body.notes ?? null,
        storage_paths: body.storagePaths,
        status: "pending",
      })
      .select("id, project_id, planting_date, latitude, longitude, status")
      .single();
    if (error) throw error;

    await writeAuditLog({
      actorId: actor.profileId,
      action: "evidence_submission",
      targetTable: "reforestation_evidence",
      targetId: data.id,
      metadata: { projectId: data.project_id },
    });

    return apiOk(data, 201);
  });
}
