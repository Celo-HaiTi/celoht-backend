import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route (7)";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  contains: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ getServiceRoleClient: () => ({ from: mocks.from }) }));

describe("GET /api/v1/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      select: mocks.select,
      eq: mocks.eq,
      order: mocks.order,
      range: mocks.range,
      contains: mocks.contains,
    };
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.order.mockReturnValue(query);
    mocks.range.mockResolvedValue({ data: [], error: null });
    mocks.contains.mockReturnValue(query);
  });

  it("returns only confirmed Celo Sepolia indexer records", async () => {
    const response = await GET(new NextRequest("https://backend.example/api/v1/transactions"));

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith("blockchain_transactions");
    expect(mocks.eq).toHaveBeenCalledWith("chain_id", 11142220);
    expect(mocks.eq).toHaveBeenCalledWith("confirmed", true);
  });
});