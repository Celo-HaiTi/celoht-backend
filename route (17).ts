import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { getConfig, ConfigurationError } from "@/lib/config";
import { getServiceRoleClient } from "@/lib/supabase/server";

/**
 * Never reports healthy while a critical dependency is unreachable.
 * A misconfigured deployment returns 503, not a fabricated "ok".
 */
export async function GET() {
  return withApiErrorHandling(async () => {
    try {
      getConfig();
    } catch (err) {
      if (err instanceof ConfigurationError) {
        return apiError("service_unavailable", "Backend is not fully configured.");
      }
      throw err;
    }

    const supabase = getServiceRoleClient();
    const { error } = await supabase.from("system_health").select("id").limit(1);
    if (error) {
      return apiError("service_unavailable", "Database is unreachable.");
    }

    await supabase.from("system_health").insert({ component: "backend", status: "healthy", details: {} });

    return apiOk({ status: "healthy", timestamp: new Date().toISOString() });
  });
}
