import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { assertOfficialGovernanceDeployment } from "@/lib/governance/server";
import {
  CELOHT_GOVERNANCE_ADDRESS,
  CELOHT_USDM_ADDRESS,
  CELO_SEPOLIA_CHAIN_ID,
  CeloHTGovernanceAbi,
  USDmAbi,
} from "@/lib/governance/contract";
import { ConfigurationError } from "@/lib/config";
import { getAddress, isAddress } from "viem";

/**
 * Public proposal presentation reconciled with the official Celo Sepolia
 * contract. Contract results and finalization are authoritative; indexed
 * events are used only for activity history.
 */
export async function GET(req: Request) {
  return withApiErrorHandling(async () => {
    const url = new URL(req.url);
    const walletParam = url.searchParams.get("wallet");
    if (walletParam && !isAddress(walletParam)) {
      return apiError("validation_error", "wallet must be a valid EVM address.");
    }
    const wallet = walletParam ? getAddress(walletParam) : undefined;
    const client = await assertOfficialGovernanceDeployment();
    const supabase = getServiceRoleClient();
    const { data: proposals, error } = await supabase
      .from("governance_proposals")
      .select("id, on_chain_proposal_id, title, description, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const [chainId, contractCode, usdmAddress, participationFee, treasury, block, proposerRole] = await Promise.all([
      client.getChainId(),
      client.getCode({ address: CELOHT_GOVERNANCE_ADDRESS }),
      client.readContract({ address: CELOHT_GOVERNANCE_ADDRESS, abi: CeloHTGovernanceAbi, functionName: "usdm" }),
      client.readContract({ address: CELOHT_GOVERNANCE_ADDRESS, abi: CeloHTGovernanceAbi, functionName: "participationFee" }),
      client.readContract({ address: CELOHT_GOVERNANCE_ADDRESS, abi: CeloHTGovernanceAbi, functionName: "treasury" }),
      client.getBlock(),
      client.readContract({ address: CELOHT_GOVERNANCE_ADDRESS, abi: CeloHTGovernanceAbi, functionName: "PROPOSER_ROLE" }),
    ]);
    if (chainId !== CELO_SEPOLIA_CHAIN_ID || !contractCode || contractCode === "0x" || usdmAddress.toLowerCase() !== CELOHT_USDM_ADDRESS.toLowerCase()) {
      throw new ConfigurationError("The official Celo Sepolia governance deployment could not be verified.", ["CELO_RPC_URL", "CELO_CHAIN_ID"]);
    }
    const usdmDecimals = await client.readContract({ address: usdmAddress, abi: USDmAbi, functionName: "decimals" });
    const currentTime = block.timestamp;

    const results = await Promise.all((proposals ?? []).map(async (proposal) => {
      const onChainProposalId = BigInt(String(proposal.on_chain_proposal_id));
      const [chainProposal, indexedEvents, walletState] = await Promise.all([
        client.readContract({
          address: CELOHT_GOVERNANCE_ADDRESS,
          abi: CeloHTGovernanceAbi,
          functionName: "getProposal",
          args: [onChainProposalId],
        }),
        supabase
          .from("blockchain_transactions")
          .select("transaction_hash, event_name, event_data, block_number, created_at")
          .eq("chain_id", CELO_SEPOLIA_CHAIN_ID)
          .eq("contract_address", CELOHT_GOVERNANCE_ADDRESS)
          .eq("confirmed", true)
          .in("event_name", ["ProposalCreated", "VoteCast", "ProposalFinalized"])
          .contains("event_data", { proposalId: onChainProposalId.toString() })
          .order("block_number", { ascending: true }),
        wallet ? Promise.all([
          client.readContract({ address: CELOHT_GOVERNANCE_ADDRESS, abi: CeloHTGovernanceAbi, functionName: "hasVoted", args: [onChainProposalId, wallet] }),
          client.readContract({ address: usdmAddress, abi: USDmAbi, functionName: "balanceOf", args: [wallet] }),
          client.readContract({ address: usdmAddress, abi: USDmAbi, functionName: "allowance", args: [wallet, CELOHT_GOVERNANCE_ADDRESS] }),
          client.readContract({ address: CELOHT_GOVERNANCE_ADDRESS, abi: CeloHTGovernanceAbi, functionName: "hasRole", args: [proposerRole, wallet] }),
        ]) : Promise.resolve(null),
      ]);
      if (indexedEvents.error) throw indexedEvents.error;

      const chainRecord = chainProposal as unknown as {
        proposalId: bigint;
        proposer: `0x${string}`;
        contentHash: `0x${string}`;
        metadataURI: string;
        startTime: bigint;
        endTime: bigint;
        yesVotes: bigint;
        noVotes: bigint;
        abstainVotes: bigint;
        finalized: boolean;
      };
      if (chainRecord.proposalId !== onChainProposalId) {
        throw new Error("Indexer proposal ID does not match the official contract.");
      }

      const contractStatus = chainRecord.finalized
        ? "finalized"
        : currentTime < chainRecord.startTime
          ? "upcoming"
          : currentTime <= chainRecord.endTime
            ? "voting"
            : "awaiting_finalization";
      const activity = (indexedEvents.data ?? []).map((event) => {
        const eventData = event.event_data as Record<string, unknown>;
        const option = String(eventData.option ?? "");
        return {
          eventName: event.event_name,
          transactionHash: event.transaction_hash,
          blockNumber: String(event.block_number),
          occurredAt: event.created_at,
          actor: typeof eventData.voter === "string" ? eventData.voter : typeof eventData.proposer === "string" ? eventData.proposer : null,
          vote: option === "1" ? "for" : option === "2" ? "against" : option === "3" ? "abstain" : null,
        };
      });
      const userVote = walletState ? {
        hasVoted: walletState[0],
        usdmBalance: walletState[1].toString(),
        usdmAllowance: walletState[2].toString(),
        isAuthorizedProposer: walletState[3],
      } : null;

      return {
        id: proposal.id,
        onChainProposalId: chainRecord.proposalId.toString(),
        title: proposal.title,
        description: proposal.description,
        metadataURI: chainRecord.metadataURI,
        contentHash: chainRecord.contentHash,
        proposer: chainRecord.proposer,
        status: contractStatus,
        indexedStatus: proposal.status,
        votingStartsAt: new Date(Number(chainRecord.startTime) * 1000).toISOString(),
        votingEndsAt: new Date(Number(chainRecord.endTime) * 1000).toISOString(),
        finalized: chainRecord.finalized,
        votes: {
          for: chainRecord.yesVotes.toString(),
          against: chainRecord.noVotes.toString(),
          abstain: chainRecord.abstainVotes.toString(),
        },
        activity,
        walletVoteState: userVote,
      };
    }));

    const proposerPermission = wallet
      ? await client.readContract({ address: CELOHT_GOVERNANCE_ADDRESS, abi: CeloHTGovernanceAbi, functionName: "hasRole", args: [proposerRole, wallet] })
      : null;

    return apiOk({
      contract: {
        chainId,
        address: CELOHT_GOVERNANCE_ADDRESS,
        usdmAddress,
        usdmDecimals,
        participationFee: participationFee.toString(),
        treasury,
        votingRequiresRole: false,
        walletIsAuthorizedProposer: proposerPermission,
      },
      proposals: results,
    });
  });
}
