import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./app/api/v1/certificates/route";

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
}));

vi.mock("@/lib/auth/authorization", () => ({ AuthError: mocks.AuthError, requireActor: mocks.requireActor }));
vi.mock("@/lib/supabase/server", () => ({ getServiceRoleClient: () => ({ from: mocks.from }) }));

describe("GET /api/v1/certificates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({
      profileId: "profile-1",
      walletAddress: `0x${"a".repeat(40)}`,
      role: "user",
    });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.eq.mockResolvedValue({ data: [], error: null });
  });

  it("returns only certificates owned by the authenticated profile", async () => {
    const response = await GET(new NextRequest("https://backend.example/api/v1/certificates"));

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith("certificates");
    expect(mocks.select).toHaveBeenCalledWith("id, course_id, certificate_number, issued_at");
    expect(mocks.eq).toHaveBeenCalledWith("profile_id", "profile-1");
  });

  it("rejects unauthenticated requests before reading certificate records", async () => {
    mocks.requireActor.mockRejectedValue(new mocks.AuthError("unauthenticated", "No session present."));

    const response = await GET(new NextRequest("https://backend.example/api/v1/certificates"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});