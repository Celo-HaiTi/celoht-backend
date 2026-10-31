import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { PaginationSchema } from "@/schemas/pagination";

/** Public project records and independently sourced financial and planting metrics. */
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
        const [contributionResult, evidenceResult] = await Promise.all([
          supabase
            .from("reforestation_contributions")
            .select("amount, asset_address, transaction_hash")
            .eq("project_id", project.id),
          supabase
            .from("reforestation_evidence")
            .select("trees_verified, planting_date, latitude, longitude, verified_at")
            .eq("project_id", project.id)
            .eq("status", "verified"),
        ]);
        if (contributionResult.error) throw contributionResult.error;
        if (evidenceResult.error) throw evidenceResult.error;

        const contributionRows = contributionResult.data ?? [];
        const transactionHashes = contributionRows.map((contribution) => contribution.transaction_hash);
        let contributions = contributionRows;
        if (transactionHashes.length > 0) {
          const { data: confirmedTransactions, error: transactionError } = await supabase
            .from("blockchain_transactions")
            .select("transaction_hash")
            .in("transaction_hash", transactionHashes)
            .eq("confirmed", true);
          if (transactionError) throw transactionError;
          const confirmedHashes = new Set((confirmedTransactions ?? []).map((transaction) => transaction.transaction_hash.toLowerCase()));
          contributions = contributionRows.filter((contribution) => confirmedHashes.has(contribution.transaction_hash.toLowerCase()));
        }
        const evidence = evidenceResult.data ?? [];

        return {
          ...project,
          objectives: project.description,
          confirmedContributionCount: contributions?.length ?? 0,
          financialContributionCount: contributions?.length ?? 0,
          contributions: contributions ?? [],
          plantingReports: evidence ?? [],
          verifiedTreesPlanted: (evidence ?? []).reduce((sum, e) => sum + (e.trees_verified ?? 0), 0),
        };
      })
    );

    return apiOk(results);
  });
}
