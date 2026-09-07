import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor, requireRole } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { PaginationSchema } from "@/schemas/pagination";

/** Admin-only. Read-only by design — there is intentionally no PATCH/DELETE
 * anywhere in this backend for audit_logs. */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["admin"]);

    const { limit, offset } = PaginationSchema.parse(
      Object.fromEntries(new URL(req.url).searchParams)
    );

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, actor_id, action, target_table, target_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return apiOk(data);
  });
}
