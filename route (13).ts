import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { ProgressUpdateSchema } from "@/schemas/progress";
import { GETLearningProgress } from "./educationRoutes";

export async function GET(req: NextRequest) {
  return GETLearningProgress(req);
}

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const body = ProgressUpdateSchema.parse(await req.json());
    const supabase = getServiceRoleClient();

    const { data, error } = await supabase.rpc("record_education_lesson_start", {
      p_profile_id: actor.profileId,
      p_enrollment_id: body.enrollmentId,
      p_lesson_id: body.lessonId,
    });
    if (error) throw error;

    return apiOk(data);
  });
}
