import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { PaginationSchema } from "@/schemas/pagination";

const CELO_SEPOLIA_CHAIN_ID = 11142220;

/**
 * Public read of indexed on-chain transactions. This route is read-only —
 * the backend never writes to blockchain_transactions; only celoht-indexer
 * does, via the service role.
 */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const url = new URL(req.url);
    const { limit, offset } = PaginationSchema.parse(Object.fromEntries(url.searchParams));
    const wallet = url.searchParams.get("wallet");

    const supabase = getServiceRoleClient();
    let query = supabase
      .from("blockchain_transactions")
      .select("id, chain_id, contract_address, transaction_hash, event_name, block_number, confirmed, created_at")
      .eq("chain_id", CELO_SEPOLIA_CHAIN_ID)
      .eq("confirmed", true)
      .order("block_number", { ascending: false })
      .range(offset, offset + limit - 1);

    if (wallet) {
      query = query.contains("event_data", { wallet });
    }

    const { data, error } = await query;
    if (error) throw error;
    return apiOk(data);
  });
}
