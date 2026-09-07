import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";

/**
 * Certificates are never issued from a client request — only by a backend
 * job that has independently verified 100% completion of every lesson in a
 * course via course_progress. This route only lists the caller's own
 * already-issued certificates.
 */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("certificates")
      .select("id, course_id, certificate_number, issued_at")
      .eq("profile_id", actor.profileId);
    if (error) throw error;
    return apiOk(data);
  });
}
