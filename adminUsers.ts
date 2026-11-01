import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor, requireRole } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { PaginationSchema } from "@/schemas/pagination";
import { writeAuditLog } from "@/lib/audit";

const UserRoleUpdateSchema = z.object({
  profileId: z.string().uuid(),
  role: z.enum(["user", "agent", "reviewer", "admin"]),
});

export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["admin"]);
    const { limit, offset } = PaginationSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const { data, error } = await getServiceRoleClient()
      .from("profiles")
      .select("id, wallet_address, role, display_name")
      .order("wallet_address", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return apiOk(data ?? []);
  });
}

export async function PATCH(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["admin"]);
    const body = UserRoleUpdateSchema.parse(await req.json());
    if (body.profileId === actor.profileId) {
      return apiError("conflict", "Administrators cannot change their own role here.");
    }

    const { data, error } = await getServiceRoleClient()
      .from("profiles")
      .update({ role: body.role })
      .eq("id", body.profileId)
      .select("id, wallet_address, role")
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiError("not_found", "Profile not found.");

    await writeAuditLog({
      actorId: actor.profileId,
      action: "admin_configuration_change",
      targetTable: "profiles",
      targetId: data.id,
      metadata: { changedField: "role", newRole: data.role },
    });
    return apiOk(data);
  });
}