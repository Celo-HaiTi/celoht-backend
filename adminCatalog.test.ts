import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getAdminCourses, createAdminCourse, updateAdminCourse, createAdminProject, updateAdminProject } from "./adminCatalog";

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
  writeAuditLog: vi.fn(),
  };
});

vi.mock("@/lib/auth/authorization", () => ({ AuthError: mocks.AuthError, requireActor: mocks.requireActor, requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/server", () => ({ getServiceRoleClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));

const actor = { profileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", walletAddress: `0x${"a".repeat(40)}`, role: "admin" as const };
const courseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const projectId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeQuery(result: { data: unknown; error: null }) {
  const query = {
    select: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.range.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.insert.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function patchRequest(path: string, value: unknown) {
  return new NextRequest(`https://backend.example/api/v1/admin/${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

function postRequest(path: string, value: unknown) {
  return new NextRequest(`https://backend.example/api/v1/admin/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

describe("admin catalog management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireActor.mockResolvedValue(actor);
    mocks.requireRole.mockImplementation((current: { role: string }, allowed: string[]) => {
      if (!allowed.includes(current.role)) throw new Error("forbidden");
    });
    mocks.writeAuditLog.mockResolvedValue(undefined);
  });

  it("requires admin access to read all courses", async () => {
    const query = makeQuery({ data: [{ id: courseId, title: "Published course", status: "published" }], error: null });
    mocks.from.mockReturnValue(query);

    const response = await getAdminCourses(new NextRequest("https://backend.example/api/v1/admin/courses?limit=10&offset=0"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(actor, ["admin"]);
    expect(mocks.from).toHaveBeenCalledWith("courses");
    expect(body.data).toHaveLength(1);
  });

  it("creates courses and projects as drafts by default and audits each record", async () => {
    const courseQuery = makeQuery({ data: { id: courseId, title: "New course", description: null, status: "draft" }, error: null });
    mocks.from.mockReturnValueOnce(courseQuery);
    const courseResponse = await createAdminCourse(postRequest("courses", { title: "New course" }));
    expect(courseResponse.status).toBe(201);
    expect(courseQuery.insert).toHaveBeenCalledWith({ title: "New course", description: null, status: "draft" });

    const projectQuery = makeQuery({ data: { id: projectId, title: "New project", description: null, location: null, status: "draft" }, error: null });
    mocks.from.mockReturnValueOnce(projectQuery);
    const projectResponse = await createAdminProject(postRequest("projects", { title: "New project" }));
    expect(projectResponse.status).toBe(201);
    expect(projectQuery.insert).toHaveBeenCalledWith({ title: "New project", description: null, location: null, status: "draft" });
    expect(mocks.writeAuditLog).toHaveBeenCalledTimes(2);
  });

  it("audits course publication and rejects fields outside the allowlist", async () => {
    const query = makeQuery({ data: { id: courseId, title: "Course", description: null, status: "published" }, error: null });
    mocks.from.mockReturnValue(query);

    const response = await updateAdminCourse(patchRequest("courses", { courseId, status: "published" }));
    expect(response.status).toBe(200);
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "course_publication", targetId: courseId }));

    const invalid = await updateAdminCourse(patchRequest("courses", { courseId, status: "published", role: "admin" }));
    expect(invalid.status).toBe(422);
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce();
  });

  it("audits project content or publication updates", async () => {
    const query = makeQuery({ data: { id: projectId, title: "Project", description: null, location: null, status: "draft" }, error: null });
    mocks.from.mockReturnValue(query);

    const response = await updateAdminProject(patchRequest("projects", { projectId, location: "Northern Haiti" }));
    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith("reforestation_projects");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin_configuration_change",
      targetTable: "reforestation_projects",
      targetId: projectId,
    }));
  });
});