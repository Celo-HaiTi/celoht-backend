import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor } from "@/lib/auth/authorization";
import { getConfig } from "@/lib/config";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { PaginationSchema } from "@/schemas/pagination";
import { ContributionReceiptSchema } from "@/schemas/reforestation";

const CELO_SEPOLIA_CHAIN_ID = 11142220;

type JsonRpcResponse = {
  result?: unknown;
  error?: { message?: string };
};

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const config = getConfig();
  const response = await fetch(config.CELO_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(config.CELO_RPC_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Celo Sepolia RPC request failed.");
  const payload = await response.json() as JsonRpcResponse;
  if (payload.error) throw new Error("Celo Sepolia RPC returned an error.");
  return payload.result;
}

type ReceiptStatus = "pending" | "reverted" | "confirmed" | "wrong_chain";

export async function verifySepoliaReceipt(transactionHash: string): Promise<ReceiptStatus> {
  const config = getConfig();
  const chainId = await rpc("eth_chainId", []);
  if (typeof chainId !== "string" || Number.parseInt(chainId, 16) !== CELO_SEPOLIA_CHAIN_ID) {
    return "wrong_chain";
  }

  const receipt = await rpc("eth_getTransactionReceipt", [transactionHash]) as {
    status?: string;
    blockNumber?: string;
    transactionHash?: string;
  } | null;
  if (!receipt) return "pending";
  if (receipt.transactionHash?.toLowerCase() !== transactionHash.toLowerCase()) return "pending";
  if (receipt.status !== "0x1") return "reverted";
  if (!receipt.blockNumber) return "pending";

  const head = await rpc("eth_blockNumber", []);
  if (typeof head !== "string") throw new Error("Celo Sepolia RPC returned an invalid block number.");
  const confirmations = Number.parseInt(head, 16) - Number.parseInt(receipt.blockNumber, 16) + 1;
  return confirmations >= config.CELO_CONFIRMATIONS ? "confirmed" : "pending";
}

/** Caller history is read from the indexer-owned table; this backend never writes it. */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const { limit, offset } = PaginationSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("reforestation_contributions")
      .select("project_id, blockchain_transaction_id, amount, asset_address, created_at")
      .ilike("contributor_wallet_address", actor.walletAddress)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const contributions = data ?? [];
    const transactionIds = contributions.map((contribution) => contribution.blockchain_transaction_id);
    if (transactionIds.length === 0) return apiOk([]);

    const { data: confirmedTransactions, error: transactionError } = await supabase
      .from("blockchain_transactions")
      .select("id, transaction_hash")
      .in("id", transactionIds)
      .eq("chain_id", CELO_SEPOLIA_CHAIN_ID)
      .eq("confirmed", true);
    if (transactionError) throw transactionError;
    const confirmedHashes = new Map((confirmedTransactions ?? []).map((transaction) => [transaction.id, transaction.transaction_hash]));
    return apiOk(contributions.flatMap((contribution) => {
      const transactionHash = confirmedHashes.get(contribution.blockchain_transaction_id);
      return transactionHash ? [{
        project_id: contribution.project_id,
        amount: contribution.amount,
        asset_address: contribution.asset_address,
        transaction_hash: transactionHash,
        created_at: contribution.created_at,
      }] : [];
    }));
  });
}

/** Confirm a client-submitted wallet transaction against Sepolia and its indexed contribution event. */
export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const body = ContributionReceiptSchema.parse(await req.json());
    const supabase = getServiceRoleClient();
    const { data: project, error: projectError } = await supabase
      .from("reforestation_projects")
      .select("id")
      .eq("id", body.projectId)
      .eq("status", "published")
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) return apiError("not_found", "Published project not found.");

    let receiptStatus: ReceiptStatus;
    try {
      receiptStatus = await verifySepoliaReceipt(body.transactionHash);
    } catch {
      return apiError("service_unavailable", "Celo Sepolia receipt verification is temporarily unavailable.");
    }
    if (receiptStatus === "wrong_chain") {
      return apiError("validation_error", "Contribution transactions must be on Celo Sepolia.");
    }
    if (receiptStatus === "reverted") {
      return apiError("conflict", "The contribution transaction reverted on Celo Sepolia.");
    }
    if (receiptStatus === "pending") {
      return apiOk({ transactionHash: body.transactionHash, status: "pending_confirmation" }, 202);
    }

    const { data: indexedTransaction, error: transactionError } = await supabase
      .from("blockchain_transactions")
      .select("id")
      .eq("chain_id", CELO_SEPOLIA_CHAIN_ID)
      .eq("transaction_hash", body.transactionHash.toLowerCase())
      .eq("confirmed", true)
      .maybeSingle();
    if (transactionError) throw transactionError;
    if (!indexedTransaction) {
      return apiOk({ transactionHash: body.transactionHash, status: "confirmed_waiting_for_indexer" }, 202);
    }

    const { data, error } = await supabase
      .from("reforestation_contributions")
      .select("project_id, amount, asset_address, contributor_wallet_address, created_at")
      .eq("project_id", body.projectId)
      .eq("blockchain_transaction_id", indexedTransaction.id)
      .ilike("contributor_wallet_address", actor.walletAddress)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return apiOk({ transactionHash: body.transactionHash, status: "confirmed_waiting_for_contribution_event" }, 202);
    }

    return apiOk({
      project_id: data.project_id,
      amount: data.amount,
      asset_address: data.asset_address,
      transaction_hash: body.transactionHash,
      created_at: data.created_at,
      status: "confirmed",
    });
  });
}