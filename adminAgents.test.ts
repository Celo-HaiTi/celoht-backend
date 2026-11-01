import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route (1)";

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(public code: "unauthenticated" | "unauthorized", message: string) {
      super(message);
    }
  }
  return { AuthError, requireActor: vi.fn(), requireRole: vi.fn(), from: vi.fn() };
});

vi.mock("@/lib/auth/authorization", () => ({ AuthError: mocks.AuthError, requireActor: mocks.requireActor, requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/server", () => ({ getServiceRoleClient: () => ({ from: mocks.from }) }));

describe("GET /admin/agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({ profileId: "admin-1", walletAddress: `0x${"a".repeat(40)}`, role: "admin" });
    mocks.requireRole.mockReturnValue(undefined);
    const query = {
      select: vi.fn(),
      order: vi.fn(),
      range: vi.fn().mockResolvedValue({ data: [{ id: "agent-1", off_chain_kyc_status: "pending" }], error: null }),
    };
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
  });

  it("returns stored application records only after admin authorization", async () => {
    const response = await GET(new NextRequest("https://backend.example/api/v1/admin/agents"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }), ["admin"]);
    expect(mocks.from).toHaveBeenCalledWith("agents");
    expect(body.data[0].off_chain_kyc_status).toBe("pending");
  });
});