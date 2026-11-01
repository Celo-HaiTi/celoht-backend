import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route (3)";

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(public code: "unauthenticated" | "unauthorized", message: string) {
      super(message);
    }
  }
  return {
    AuthError,
    requireActor: vi.fn(),
    requireRole: vi.fn(),
    from: vi.fn(),
    storageFrom: vi.fn(),
    createSignedUrl: vi.fn(),
  };
});

vi.mock("@/lib/auth/authorization", () => ({ AuthError: mocks.AuthError, requireActor: mocks.requireActor, requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/server", () => ({
  getServiceRoleClient: () => ({ from: mocks.from, storage: { from: mocks.storageFrom } }),
}));

describe("GET /admin/kyc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({ profileId: "reviewer-1", walletAddress: `0x${"a".repeat(40)}`, role: "reviewer" });
    mocks.requireRole.mockReturnValue(undefined);
    const query = { select: vi.fn(), in: vi.fn(), order: vi.fn(), update: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockResolvedValue({ data: [{
      id: "kyc-1",
      agent_id: "agent-1",
      document_type: "identity",
      status: "submitted",
      submitted_at: "2026-10-01T10:00:00.000Z",
      storage_path: "agent-1/identity.pdf",
    }], error: null });
    mocks.from.mockReturnValue(query);
    mocks.storageFrom.mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.example/signed" }, error: null });
  });

  it("returns expiring signed links without exposing private storage paths", async () => {
    const response = await GET(new NextRequest("https://backend.example/api/v1/admin/kyc"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(expect.objectContaining({ role: "reviewer" }), ["reviewer", "admin"]);
    expect(mocks.storageFrom).toHaveBeenCalledWith("agent-kyc");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("agent-1/identity.pdf", 300);
    expect(body.data[0].signedUrl).toBe("https://storage.example/signed");
    expect(body.data[0]).not.toHaveProperty("storage_path");
  });

  it("does not allow a second decision after a KYC record leaves the review queue", async () => {
    const query = { select: vi.fn(), in: vi.fn(), order: vi.fn(), update: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.from.mockReturnValue(query);

    const response = await POST(new NextRequest("https://backend.example/api/v1/admin/kyc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kycId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", decision: "approved" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("conflict");
  });
});