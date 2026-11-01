import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor, requireRole } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { PaginationSchema } from "@/schemas/pagination";
import { writeAuditLog } from "@/lib/audit";

const CourseUpdateSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(8000).nullable().optional(),
  status: z.enum(["draft", "published"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 1);

const CourseCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(8000).nullable().optional(),
  status: z.enum(["draft", "published"]).default("draft"),
}).strict();

const ProjectUpdateSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(8000).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  status: z.enum(["draft", "published"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 1);

const ProjectCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(8000).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  status: z.enum(["draft", "published"]).default("draft"),
}).strict();

async function requireAdmin(req: NextRequest) {
  const actor = await requireActor(req);
  requireRole(actor, ["admin"]);
  return actor;
}

export async function getAdminCourses(req: NextRequest) {
  return withApiErrorHandling(async () => {
    await requireAdmin(req);
    const { limit, offset } = PaginationSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const { data, error } = await getServiceRoleClient()
      .from("courses")
      .select("id, title, description, status, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return apiOk(data ?? []);
  });
}

export async function updateAdminCourse(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireAdmin(req);
    const { courseId, ...updates } = CourseUpdateSchema.parse(await req.json());
    const { data, error } = await getServiceRoleClient()
      .from("courses")
      .update(updates)
      .eq("id", courseId)
      .select("id, title, description, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiError("not_found", "Course not found.");
    await writeAuditLog({
      actorId: actor.profileId,
      action: updates.status ? "course_publication" : "admin_configuration_change",
      targetTable: "courses",
      targetId: data.id,
      metadata: { changedFields: Object.keys(updates), status: data.status },
    });
    return apiOk(data);
  });
}

export async function createAdminCourse(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireAdmin(req);
    const body = CourseCreateSchema.parse(await req.json());
    const { data, error } = await getServiceRoleClient()
      .from("courses")
      .insert({ ...body, description: body.description ?? null })
      .select("id, title, description, status")
      .single();
    if (error) throw error;
    await writeAuditLog({
      actorId: actor.profileId,
      action: body.status === "published" ? "course_publication" : "admin_configuration_change",
      targetTable: "courses",
      targetId: data.id,
      metadata: { created: true, status: data.status },
    });
    return apiOk(data, 201);
  });
}

export async function getAdminProjects(req: NextRequest) {
  return withApiErrorHandling(async () => {
    await requireAdmin(req);
    const { limit, offset } = PaginationSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const { data, error } = await getServiceRoleClient()
      .from("reforestation_projects")
      .select("id, title, description, location, status, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return apiOk(data ?? []);
  });
}

export async function updateAdminProject(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireAdmin(req);
    const { projectId, ...updates } = ProjectUpdateSchema.parse(await req.json());
    const { data, error } = await getServiceRoleClient()
      .from("reforestation_projects")
      .update(updates)
      .eq("id", projectId)
      .select("id, title, description, location, status")
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiError("not_found", "Project not found.");
    await writeAuditLog({
      actorId: actor.profileId,
      action: updates.status ? "project_publication" : "admin_configuration_change",
      targetTable: "reforestation_projects",
      targetId: data.id,
      metadata: { changedFields: Object.keys(updates), status: data.status },
    });
    return apiOk(data);
  });
}

export async function createAdminProject(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireAdmin(req);
    const body = ProjectCreateSchema.parse(await req.json());
    const { data, error } = await getServiceRoleClient()
      .from("reforestation_projects")
      .insert({ ...body, description: body.description ?? null, location: body.location ?? null })
      .select("id, title, description, location, status")
      .single();
    if (error) throw error;
    await writeAuditLog({
      actorId: actor.profileId,
      action: body.status === "published" ? "project_publication" : "admin_configuration_change",
      targetTable: "reforestation_projects",
      targetId: data.id,
      metadata: { created: true, status: data.status },
    });
    return apiOk(data, 201);
  });
}