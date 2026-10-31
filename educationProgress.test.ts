import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route (13)";

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(public code: "unauthenticated" | "unauthorized", message: string) {
      super(message);
    }
  }

  return {
    AuthError,
    requireActor: vi.fn(),
    rpc: vi.fn(),
  };
});

vi.mock("@/lib/auth/authorization", () => ({
  AuthError: mocks.AuthError,
  requireActor: mocks.requireActor,
}));
vi.mock("@/lib/supabase/server", () => ({
  getServiceRoleClient: () => ({ rpc: mocks.rpc }),
}));

function request(body: unknown): NextRequest {
  return new NextRequest("https://backend.example/api/v1/progress", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("lesson progress endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue({ profileId: "profile-id" });
    mocks.rpc.mockResolvedValue({ data: { started: true }, error: null });
  });

  it("rejects client-submitted completion claims before persistence", async () => {
    const response = await POST(request({
      enrollmentId: "11111111-1111-4111-8111-111111111111",
      lessonId: "22222222-2222-4222-8222-222222222222",
      completed: true,
    }));

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("records lesson start through the server-owned workflow", async () => {
    const response = await POST(request({
      enrollmentId: "11111111-1111-4111-8111-111111111111",
      lessonId: "22222222-2222-4222-8222-222222222222",
    }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("record_education_lesson_start", {
      p_profile_id: "profile-id",
      p_enrollment_id: "11111111-1111-4111-8111-111111111111",
      p_lesson_id: "22222222-2222-4222-8222-222222222222",
    });
  });
});