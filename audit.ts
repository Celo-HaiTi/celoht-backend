import "server-only";
import { getServiceRoleClient } from "@/lib/supabase/server";

export type AuditAction =
  | "kyc_review"
  | "agent_approval"
  | "agent_suspension"
  | "agent_rejection"
  | "evidence_verification"
  | "evidence_rejection"
  | "course_publication"
  | "project_publication"
  | "admin_configuration_change";

/**
 * Writes an immutable audit log entry. Must be called in the same logical
 * operation as any sensitive administrative state change (see docs/ADMIN.md).
 * There is no corresponding update/delete helper by design — audit_logs has
 * no update/delete RLS policy for any role.
 */
export async function writeAuditLog(entry: {
  actorId: string;
  action: AuditAction;
  targetTable?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getServiceRoleClient();
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_table: entry.targetTable ?? null,
    target_id: entry.targetId ?? null,
    metadata: entry.metadata ?? {},
  });
  if (error) throw error;
}
