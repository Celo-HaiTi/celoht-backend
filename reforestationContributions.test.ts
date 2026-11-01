import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./reforestationContributions";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  from: vi.fn(),
  contributionQuery: {
    select: vi.fn(),
    ilike: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
  },
  transactionQuery: {
    select: vi.fn(),
    in: vi.fn(),
    eq: vi.fn(),
  },
}));

vi.mock("@/lib/auth/authorization", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/supabase/server", () => ({ getServiceRoleClient: () => ({ from: mocks.from }) }));

describe("GET /api/v1/reforestation/contributions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({
      profileId: "profile-1",
      walletAddress: `0x${"a".repeat(40)}`,
      role: "user",
    });
    mocks.from.mockImplementation((table: string) =>
      table === "reforestation_contributions" ? mocks.contributionQuery : mocks.transactionQuery
    );
    mocks.contributionQuery.select.mockReturnValue(mocks.contributionQuery);
    mocks.contributionQuery.ilike.mockReturnValue(mocks.contributionQuery);
    mocks.contributionQuery.order.mockReturnValue(mocks.contributionQuery);
    mocks.contributionQuery.range.mockResolvedValue({
      data: [{
        project_id: "project-1",
        blockchain_transaction_id: "transaction-1",
        amount: "100",
        asset_address: "0xasset",
        created_at: "2026-01-01T00:00:00.000Z",
      }],
      error: null,
    });
    mocks.transactionQuery.select.mockReturnValue(mocks.transactionQuery);
    mocks.transactionQuery.in.mockReturnValue(mocks.transactionQuery);
    mocks.transactionQuery.eq.mockImplementation((column: string, value: unknown) =>
      column === "confirmed" && value === true
        ? Promise.resolve({
            data: [{ id: "transaction-1", transaction_hash: `0x${"b".repeat(64)}` }],
            error: null,
          })
        : mocks.transactionQuery
    );
  });

  it("joins the caller's contributions to confirmed Sepolia indexer transactions", async () => {
    const response = await GET(new NextRequest("https://backend.example/api/v1/reforestation/contributions"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.contributionQuery.select).toHaveBeenCalledWith(
      "project_id, blockchain_transaction_id, amount, asset_address, created_at"
    );
    expect(mocks.contributionQuery.ilike).toHaveBeenCalledWith("contributor_wallet_address", `0x${"a".repeat(40)}`);
    expect(mocks.transactionQuery.eq).toHaveBeenCalledWith("chain_id", 11142220);
    expect(mocks.transactionQuery.eq).toHaveBeenCalledWith("confirmed", true);
    expect(body.data).toEqual([{
      project_id: "project-1",
      amount: "100",
      asset_address: "0xasset",
      transaction_hash: `0x${"b".repeat(64)}`,
      created_at: "2026-01-01T00:00:00.000Z",
    }]);
  });
});