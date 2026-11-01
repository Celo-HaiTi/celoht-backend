import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getProfile } from "./route (12)";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/auth/authorization", () => ({ requireActor: mocks.requireActor }));
vi.mock("@/lib/supabase/server", () => ({ getServiceRoleClient: () => ({ from: mocks.from }) }));

describe("GET /profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({
      profileId: "profile-1",
      walletAddress: `0x${"a".repeat(40)}`,
      role: "user",
    });
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn().mockResolvedValue({
        data: { display_name: "Community member", avatar_url: "https://cdn.example/avatar.png" },
        error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
  });

  it("returns only the authenticated profile's verified identity and editable display fields", async () => {
    const response = await getProfile(new NextRequest("https://backend.example/api/v1/profile"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(body.data).toMatchObject({
      profileId: "profile-1",
      walletAddress: `0x${"a".repeat(40)}`,
      role: "user",
      displayName: "Community member",
      avatarUrl: "https://cdn.example/avatar.png",
    });
  });
});