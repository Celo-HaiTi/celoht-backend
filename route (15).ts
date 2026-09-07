import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { getServiceRoleClient } from "@/lib/supabase/server";

/** Public: verified evidence only (mirrors reforestation_evidence RLS). */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const projectId = new URL(req.url).searchParams.get("projectId");
    const supabase = getServiceRoleClient();
    let query = supabase
      .from("reforestation_evidence")
      .select("id, project_id, trees_verified, verified_at")
      .eq("status", "verified");
    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) throw error;
    return apiOk(data);
  });
}
