import { NextRequest } from "next/server";
import { apiOk, withApiErrorHandling } from "@/lib/errors";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { PaginationSchema } from "@/schemas/pagination";

/** Public: published courses only (mirrors the RLS policy in celoht-supabase). */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const { limit, offset } = PaginationSchema.parse(
      Object.fromEntries(new URL(req.url).searchParams)
    );
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("courses")
      .select("id, title, description, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return apiOk(data);
  });
}
