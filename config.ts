import { z } from "zod";

/**
 * Central, fail-closed configuration loader.
 *
 * Any endpoint that depends on Supabase, the RPC, or the auth secret must
 * import `getConfig()` (or the narrower helpers below) instead of reading
 * `process.env` directly. If required configuration is missing or malformed,
 * this throws — callers must turn that into a 503 response, never a fallback
 * to mock/fake data. See docs/SECURITY.md ("fail closed").
 */

const ConfigSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CELO_CHAIN_ID: z.coerce.number().int().positive(),
  CELO_RPC_URL: z.string().url(),
  AUTH_SESSION_SECRET: z.string().min(32, "AUTH_SESSION_SECRET must be at least 32 characters"),
  AUTH_NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

let cached: Config | null = null;

/**
 * Known official CeloHT networks. Mainnet (42220) is intentionally absent
 * until Celo-HaiTi/celoht-smart-contracts publishes official Mainnet
 * deployment metadata — do not add it speculatively.
 */
export const SUPPORTED_CHAIN_IDS = [11142220] as const;

export function getConfig(): Config {
  if (cached) return cached;

  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new ConfigurationError(
      `Missing or invalid required configuration: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`
    );
  }

  if (!SUPPORTED_CHAIN_IDS.includes(parsed.data.CELO_CHAIN_ID as (typeof SUPPORTED_CHAIN_IDS)[number])) {
    throw new ConfigurationError(
      `CELO_CHAIN_ID=${parsed.data.CELO_CHAIN_ID} is not an officially configured CeloHT network. ` +
        `Refusing to start against an unconfigured chain (fail closed).`
    );
  }

  cached = parsed.data;
  return cached;
}

/** For tests only: clears the cached config so a fresh env can be parsed. */
export function __resetConfigCacheForTests(): void {
  cached = null;
}
