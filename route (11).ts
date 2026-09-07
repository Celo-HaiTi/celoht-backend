import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { getServiceRoleClient } from "@/lib/supabase/server";

/**
 * Public governance metadata. CeloHT governance is strictly 1 wallet = 1
 * vote — this route never computes or exposes token-weighted totals, and
 * proposal "passed" status reflects vote tallies only, never automatic
 * Treasury execution.
 */
export async function GET() {
  return withApiErrorHandling(async () => {
    const supabase = getServiceRoleClient();
    const { data: proposals, error } = await supabase
      .from("governance_proposals")
      .select("id, on_chain_proposal_id, title, description, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const results = await Promise.all(
      (proposals ?? []).map(async (proposal) => {
        const { count: forCount } = await supabase
          .from("governance_activity")
          .select("id", { count: "exact", head: true })
          .eq("proposal_id", proposal.id)
          .eq("vote", "for");
        const { count: againstCount } = await supabase
          .from("governance_activity")
          .select("id", { count: "exact", head: true })
          .eq("proposal_id", proposal.id)
          .eq("vote", "against");
        const { count: abstainCount } = await supabase
          .from("governance_activity")
          .select("id", { count: "exact", head: true })
          .eq("proposal_id", proposal.id)
          .eq("vote", "abstain");

        return {
          ...proposal,
          votes: { for: forCount ?? 0, against: againstCount ?? 0, abstain: abstainCount ?? 0 },
        };
      })
    );

    return apiOk(results);
  });
}
