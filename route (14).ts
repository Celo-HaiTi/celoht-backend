import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { PaginationSchema } from "@/schemas/pagination";

/** Public: published reforestation projects, with their on-chain financial
 * contributions and verified evidence kept as clearly separate fields —
 * never merged into a single "impact" number. */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const { limit, offset } = PaginationSchema.parse(
      Object.fromEntries(new URL(req.url).searchParams)
    );
    const supabase = getServiceRoleClient();

    const { data: projects, error } = await supabase
      .from("reforestation_projects")
      .select("id, title, description, location, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const results = await Promise.all(
      (projects ?? []).map(async (project) => {
        const [{ data: contributions }, { data: evidence }] = await Promise.all([
          supabase
            .from("reforestation_contributions")
            .select("amount, asset_address")
            .eq("project_id", project.id),
          supabase
            .from("reforestation_evidence")
            .select("trees_verified")
            .eq("project_id", project.id)
            .eq("status", "verified"),
        ]);

        return {
          ...project,
          financialContributionCount: contributions?.length ?? 0,
          verifiedTreesPlanted: (evidence ?? []).reduce((sum, e) => sum + (e.trees_verified ?? 0), 0),
        };
      })
    );

    return apiOk(results);
  });
}
