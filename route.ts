import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";

/**
 * Certificates are issued atomically by the quiz workflow after every lesson
 * has a passing, server-validated quiz attempt. Legacy unlinked records are
 * withheld because their completion cannot be verified against an enrollment.
 */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("certificates")
      .select("id, course_id, enrollment_id, certificate_number, issued_at, enrollments!inner(completed_at)")
      .eq("profile_id", actor.profileId)
      .not("enrollment_id", "is", null)
      .not("enrollments.completed_at", "is", null);
    if (error) throw error;
    return apiOk(data);
  });
}
