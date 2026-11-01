import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { PaginationSchema } from "@/schemas/pagination";

const CELO_SEPOLIA_CHAIN_ID = 11142220;

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
            .select("blockchain_transaction_id, amount, asset_address, created_at")
            .eq("project_id", project.id),
          supabase
            .from("reforestation_evidence")
            .select("id, project_id, trees_verified, verified_at, created_at")
            .eq("project_id", project.id)
            .eq("status", "verified"),
        ]);
        if (contributionResult.error) throw contributionResult.error;
        if (evidenceResult.error) throw evidenceResult.error;

        const contributionRows = contributionResult.data ?? [];
        const transactionIds = contributionRows.map((contribution) => contribution.blockchain_transaction_id);
        let contributions: typeof contributionRows = [];
        if (transactionIds.length > 0) {
          const { data: confirmedTransactions, error: transactionError } = await supabase
            .from("blockchain_transactions")
            .select("id, transaction_hash")
            .in("id", transactionIds)
            .eq("chain_id", CELO_SEPOLIA_CHAIN_ID)
            .eq("confirmed", true);
          if (transactionError) throw transactionError;
          const transactionHashes = new Map((confirmedTransactions ?? []).map((transaction) => [transaction.id, transaction.transaction_hash]));
          contributions = contributionRows.flatMap((contribution) => {
            const transactionHash = transactionHashes.get(contribution.blockchain_transaction_id);
            return transactionHash ? [{
              ...contribution,
              transaction_hash: transactionHash,
            }] : [];
          });
        }
        const evidence = evidenceResult.data ?? [];

        return {
          ...project,
          objectives: project.description,
          confirmedContributionCount: contributions?.length ?? 0,
          financialContributionCount: contributions?.length ?? 0,
          contributions: contributions ?? [],
          plantingReports: (evidence ?? []).map((report) => ({
            id: report.id,
            project_id: report.project_id,
            trees_verified: report.trees_verified,
            verified_at: report.verified_at,
            created_at: report.created_at,
          })),
          verifiedTreesPlanted: (evidence ?? []).reduce((sum, e) => sum + (e.trees_verified ?? 0), 0),
        };
      })
    );

    return apiOk(results);
  });
}
