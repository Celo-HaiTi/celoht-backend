import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "./adminUsers";

const mocks = vi.hoisted(() => ({
  requireActor: vi.fn(),
  requireRole: vi.fn(),
  from: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth/authorization", () => ({ requireActor: mocks.requireActor, requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/server", () => ({ getServiceRoleClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));

const admin = { profileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", walletAddress: `0x${"a".repeat(40)}`, role: "admin" as const };
const target = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeQuery(result: { data: unknown; error: null }) {
  const query = {
    select: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.range.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("admin user management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue(admin);
    mocks.requireRole.mockImplementation((actor: { role: string }, allowed: string[]) => {
      if (!allowed.includes(actor.role)) throw new Error("forbidden");
    });
    mocks.writeAuditLog.mockResolvedValue(undefined);
  });

  it("requires admin role and returns only account management fields", async () => {
    const query = makeQuery({ data: [{ id: target, wallet_address: `0x${"b".repeat(40)}`, role: "user", display_name: null }], error: null });
    mocks.from.mockReturnValue(query);

    const response = await GET(new NextRequest("https://backend.example/api/v1/admin/users"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(admin, ["admin"]);
    expect(body.data[0].role).toBe("user");
  });

  it("audits role changes and prevents self-role changes", async () => {
    const query = makeQuery({ data: { id: target, wallet_address: `0x${"b".repeat(40)}`, role: "reviewer" }, error: null });
    mocks.from.mockReturnValue(query);
    const response = await PATCH(new NextRequest("https://backend.example/api/v1/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileId: target, role: "reviewer" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: admin.profileId,
      action: "admin_configuration_change",
      targetTable: "profiles",
      targetId: target,
    }));

    const selfResponse = await PATCH(new NextRequest("https://backend.example/api/v1/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileId: admin.profileId, role: "user" }),
    }));
    expect(selfResponse.status).toBe(409);
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce();
  });
});