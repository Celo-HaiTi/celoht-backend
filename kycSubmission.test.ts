import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route (6)";

const mocks = vi.hoisted(() => ({
  AuthError: class AuthError extends Error {
    constructor(public code: "unauthenticated" | "unauthorized", message: string) {
      super(message);
    }
  },
  requireActor: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock("@/lib/auth/authorization", () => ({ AuthError: mocks.AuthError, requireActor: mocks.requireActor }));
vi.mock("@/lib/supabase/server", () => ({
  getServiceRoleClient: () => ({
    from: mocks.from,
    storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
  }),
}));

describe("POST /api/v1/agents/kyc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({
      profileId: "profile-1",
      walletAddress: `0x${"a".repeat(40)}`,
      role: "agent",
    });
    const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle };
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.maybeSingle.mockResolvedValue({ data: { id: "agent-1" }, error: null });
  });

  it("rejects a storage path not owned by the authenticated agent", async () => {
    const request = new NextRequest("https://backend.example/api/v1/agents/kyc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documentType: "identity", storagePath: "other-agent/document.pdf" }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("validation_error");
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });
});