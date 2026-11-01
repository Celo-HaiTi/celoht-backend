import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionData, toFunctionSelector } from "viem";
import { GET as getGovernance } from "./route (11)";
import { CeloHTGovernanceAbi } from "@/lib/governance/contract";

const configMocks = vi.hoisted(() => {
  class ConfigurationError extends Error {}
  return { ConfigurationError };
});

const mocks = vi.hoisted(() => ({
  assertOfficialGovernanceDeployment: vi.fn(),
  from: vi.fn(),
  getChainId: vi.fn(),
  getCode: vi.fn(),
  getBlock: vi.fn(),
  readContract: vi.fn(),
}));

vi.mock("@/lib/config", () => ({ ConfigurationError: configMocks.ConfigurationError }));
vi.mock("@/lib/governance/server", () => ({
  assertOfficialGovernanceDeployment: mocks.assertOfficialGovernanceDeployment,
}));
vi.mock("@/lib/supabase/server", () => ({ getServiceRoleClient: () => ({ from: mocks.from }) }));

const governanceAddress = "0x7D384851FAbB912287206556479Dd30c740CAdA5";
const usdmAddress = "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b";
const walletAddress = `0x${"a".repeat(40)}`;

function makeQuery(result: { data: unknown; error: null }) {
  const query = {
    select: vi.fn(),
    order: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    contains: vi.fn(),
    then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.contains.mockReturnValue(query);
  return query;
}

describe("GET /governance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChainId.mockResolvedValue(11142220);
    mocks.getCode.mockResolvedValue("0x6000");
    mocks.getBlock.mockResolvedValue({ timestamp: 2_000_000_000n });
    mocks.readContract.mockImplementation((call: { functionName: string }) => {
      switch (call.functionName) {
        case "usdm": return Promise.resolve(usdmAddress);
        case "participationFee": return Promise.resolve(10_000n);
        case "treasury": return Promise.resolve("0xd856e0599cc49C9cef6C358d2c2f064112A6b384");
        case "PROPOSER_ROLE": return Promise.resolve(`0x${"b".repeat(64)}`);
        case "decimals": return Promise.resolve(6);
        case "getProposal": return Promise.resolve({
          proposalId: 42n,
          proposer: walletAddress,
          contentHash: `0x${"c".repeat(64)}`,
          metadataURI: "https://metadata.example/proposal.json",
          startTime: 1_900_000_000n,
          endTime: 1_950_000_000n,
          yesVotes: 7n,
          noVotes: 2n,
          abstainVotes: 1n,
          finalized: true,
        });
        case "hasVoted": return Promise.resolve(true);
        case "balanceOf": return Promise.resolve(20_000n);
        case "allowance": return Promise.resolve(10_000n);
        case "hasRole": return Promise.resolve(false);
        default: throw new Error(`Unexpected contract read: ${call.functionName}`);
      }
    });
    mocks.assertOfficialGovernanceDeployment.mockResolvedValue({
      getChainId: mocks.getChainId,
      getCode: mocks.getCode,
      getBlock: mocks.getBlock,
      readContract: mocks.readContract,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === "governance_proposals") {
        return makeQuery({ data: [{
          id: "proposal-row-1",
          on_chain_proposal_id: "42",
          title: null,
          description: "https://metadata.example/proposal.json",
          status: "pending",
        }], error: null });
      }
      if (table === "blockchain_transactions") {
        return makeQuery({ data: [{
          transaction_hash: `0x${"d".repeat(64)}`,
          event_name: "VoteCast",
          event_data: { proposalId: "42", voter: walletAddress, option: "1" },
          block_number: 50,
          created_at: "2030-01-01T00:00:00.000Z",
        }], error: null });
      }
      throw new Error(`Unexpected table read: ${table}`);
    });
  });

  it("returns contract-authoritative windows, results, finalization, and wallet vote state", async () => {
    const request = new Request(`https://backend.example/api/v1/governance?wallet=${walletAddress}`);
    const response = await getGovernance(request);
    const body = await response.json();
    const result = body.data;
    const proposal = result.proposals[0];

    expect(response.status).toBe(200);
    expect(result.contract.chainId).toBe(11142220);
    expect(result.contract.address).toBe(governanceAddress);
    expect(result.contract.participationFee).toBe("10000");
    expect(result.contract.walletIsAuthorizedProposer).toBe(false);
    expect(proposal.status).toBe("finalized");
    expect(proposal.indexedStatus).toBe("pending");
    expect(proposal.votes).toEqual({ for: "7", against: "2", abstain: "1" });
    expect(proposal.votingStartsAt).toBe("2030-03-17T17:46:40.000Z");
    expect(proposal.votingEndsAt).toBe("2031-10-17T10:40:00.000Z");
    expect(proposal.finalized).toBe(true);
    expect(proposal.walletVoteState).toMatchObject({
      hasVoted: true,
      usdmBalance: "20000",
      usdmAllowance: "10000",
      isAuthorizedProposer: false,
    });
    expect(proposal.activity[0]).toMatchObject({ eventName: "VoteCast", vote: "for", actor: walletAddress });
  });

  it("rejects malformed wallet queries before reading contract or database state", async () => {
    const response = await getGovernance(new Request("https://backend.example/api/v1/governance?wallet=not-an-address"));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("validation_error");
    expect(mocks.assertOfficialGovernanceDeployment).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
describe("CeloHT Governance vote ABI", () => {
  it("encodes the proposal ID and contract vote option", () => {
    const data = encodeFunctionData({
      abi: CeloHTGovernanceAbi,
      functionName: "vote",
      args: [42n, 1],
    });

    expect(data.slice(0, 10)).toBe(toFunctionSelector("vote(uint256,uint8)"));
    expect(data.slice(10)).toBe(`${42n.toString(16).padStart(64, "0")}${"1".padStart(64, "0")}`);
  });
});