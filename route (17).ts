import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { getConfig, ConfigurationError } from "@/lib/config";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

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
        logger.error("health.configuration_invalid", { variables: err.variables });
        return apiError("service_unavailable", "Backend is not fully configured.", {
          missingOrInvalidVariables: err.variables,
        });
      }
      throw err;
    }

    const config = getConfig();
    const supabase = getServiceRoleClient();
    const dependencies: Record<string, "healthy" | "unavailable"> = {
      database: "unavailable",
      celoSepoliaRpc: "unavailable",
    };
    if (config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN) {
      dependencies.rateLimitStore = "unavailable";
    }

    const databaseCheck = Promise.resolve(supabase.from("system_health").select("id").limit(1));
    const rpcCheck = (async () => {
        const response = await fetch(config.CELO_RPC_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
          signal: AbortSignal.timeout(config.CELO_RPC_TIMEOUT_MS),
        });
        if (!response.ok) return false;
        const body = (await response.json()) as { result?: unknown; error?: unknown };
        const expectedChainId = `0x${config.CELO_CHAIN_ID.toString(16)}`;
        return !body.error && body.result === expectedChainId;
      })();
    const rateLimitCheck = (async () => {
      if (!dependencies.rateLimitStore) return true;
          const response = await fetch(config.UPSTASH_REDIS_REST_URL as string, {
            method: "POST",
            headers: {
              authorization: `Bearer ${config.UPSTASH_REDIS_REST_TOKEN}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(["PING"]),
            signal: AbortSignal.timeout(2_000),
          });
          if (!response.ok) return false;
          const body = (await response.json()) as { result?: unknown; error?: unknown };
          return !body.error && body.result === "PONG";
    })();
    const [databaseResult, rpcResult, rateLimitResult] = await Promise.allSettled([
      databaseCheck,
      rpcCheck,
      rateLimitCheck,
    ]);

    if (databaseResult.status === "fulfilled" && !databaseResult.value.error) {
      dependencies.database = "healthy";
    } else {
      logger.error("health.dependency_unavailable", { component: "database" });
    }

    if (rpcResult.status === "fulfilled" && rpcResult.value) {
      dependencies.celoSepoliaRpc = "healthy";
    } else {
      logger.error("health.dependency_unavailable", { component: "celoSepoliaRpc" });
    }

    if (dependencies.rateLimitStore) {
      if (rateLimitResult?.status === "fulfilled" && rateLimitResult.value) {
        dependencies.rateLimitStore = "healthy";
      } else {
        logger.error("health.dependency_unavailable", { component: "rateLimitStore" });
      }
    }

    const healthy = Object.values(dependencies).every((status) => status === "healthy");
    if (!healthy) {
      return apiError("service_unavailable", "One or more backend dependencies are unavailable.", {
        dependencies,
      });
    }

    return apiOk({ status: "healthy", dependencies, timestamp: new Date().toISOString() });
  });
}
