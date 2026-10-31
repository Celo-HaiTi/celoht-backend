import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { getConfig, ConfigurationError } from "@/lib/config";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

function getDatabaseDiagnosticCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "query_failed";

  const info = error as { code?: unknown; status?: unknown; name?: unknown; cause?: unknown };
  const cause = typeof info.cause === "object" && info.cause !== null ? (info.cause as { code?: unknown }) : {};
  const codes = [info.code, cause.code].filter((code): code is string => typeof code === "string");

  if (codes.some((code) => code === "42P01" || code === "PGRST205") || info.status === 404) {
    return "table_unavailable";
  }
  if (codes.includes("PGRST002") || codes.includes("PGRST204")) return "schema_incompatible";
  if (codes.includes("42501") || info.status === 403) return "permission_denied";
  if (codes.some((code) => ["PGRST301", "PGRST302", "28P01"].includes(code)) || info.status === 401) {
    return "credentials_rejected";
  }
  if (
    codes.some((code) =>
      code.startsWith("08") ||
      ["PGRST000", "PGRST001", "PGRST003", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT"].includes(code)
    ) ||
    info.name === "TypeError"
  ) {
    return "connection_failed";
  }
  if (typeof info.status === "number" && info.status >= 500) return "upstream_unavailable";
  return "query_failed";
}

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
      rateLimitStore: "unavailable",
    };

    const databaseCheck = Promise.resolve().then(() => supabase.from("profiles").select("id").limit(1));
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
      if (!config.UPSTASH_REDIS_REST_URL || !config.UPSTASH_REDIS_REST_TOKEN) return false;
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

    const diagnostics: Record<string, string> = {};
    const databaseError =
      databaseResult.status === "fulfilled" ? databaseResult.value.error : databaseResult.reason;
    if (databaseResult.status === "fulfilled" && !databaseResult.value.error) {
      dependencies.database = "healthy";
    } else {
      diagnostics.database = getDatabaseDiagnosticCode(databaseError);
      logger.error("health.dependency_unavailable", {
        component: "database",
        diagnosticCode: diagnostics.database,
      });
    }

    if (rpcResult.status === "fulfilled" && rpcResult.value) {
      dependencies.celoSepoliaRpc = "healthy";
    } else {
      logger.error("health.dependency_unavailable", { component: "celoSepoliaRpc" });
    }

    if (rateLimitResult.status === "fulfilled" && rateLimitResult.value) {
      dependencies.rateLimitStore = "healthy";
    } else {
      logger.error("health.dependency_unavailable", { component: "rateLimitStore" });
    }

    const healthy = Object.values(dependencies).every((status) => status === "healthy");
    if (!healthy) {
      return apiError("service_unavailable", "One or more backend dependencies are unavailable.", {
        dependencies,
        diagnostics,
      });
    }

    return apiOk({ status: "healthy", dependencies, timestamp: new Date().toISOString() });
  });
}
