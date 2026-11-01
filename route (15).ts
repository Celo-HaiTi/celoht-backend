import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { getServiceRoleClient } from "@/lib/supabase/server";

/** Public reports include verified records only; evidence files remain private. */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const projectId = new URL(req.url).searchParams.get("projectId");
    const supabase = getServiceRoleClient();
    let query = supabase
      .from("reforestation_evidence")
      .select("id, project_id, trees_verified, verified_at, created_at")
      .eq("status", "verified");
    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) throw error;
    return apiOk(data);
  });
}

/** Fail closed until the canonical private bucket has an owner-bound upload path. */
export async function POST() {
  return apiError(
    "service_unavailable",
    "Evidence submission is unavailable until private agent uploads are configured."
  );
}
