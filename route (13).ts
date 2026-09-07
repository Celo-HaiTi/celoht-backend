import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { ProgressUpdateSchema } from "@/schemas/progress";

export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("course_progress")
      .select("lesson_id, completed, completed_at")
      .eq("profile_id", actor.profileId);
    if (error) throw error;
    return apiOk(data);
  });
}

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const body = ProgressUpdateSchema.parse(await req.json());
    const supabase = getServiceRoleClient();

    const { data, error } = await supabase
      .from("course_progress")
      .upsert(
        {
          profile_id: actor.profileId,
          lesson_id: body.lessonId,
          completed: body.completed,
          completed_at: body.completed ? new Date().toISOString() : null,
        },
        { onConflict: "profile_id,lesson_id" }
      )
      .select("lesson_id, completed, completed_at")
      .single();
    if (error) throw error;

    return apiOk(data);
  });
}
