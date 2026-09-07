import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "@/lib/config";

/**
 * Service-role Supabase client.
 *
 * SECURITY: This file must only ever be imported from server-side code
 * (API route handlers, server actions). The `server-only` import above
 * causes a build-time error if it is ever pulled into a client bundle.
 * SUPABASE_SERVICE_ROLE_KEY must never be exposed via NEXT_PUBLIC_* or
 * shipped to the browser.
 */

let client: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient {
  if (client) return client;

  const config = getConfig(); // throws (fail closed) if misconfigured

  client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}
