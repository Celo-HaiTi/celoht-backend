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

const OptionalEnvironmentKey = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional()
);

const ConfigSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: OptionalEnvironmentKey,
  SUPABASE_PUBLISHABLE_KEY: OptionalEnvironmentKey,
  SUPABASE_SERVICE_ROLE_KEY: OptionalEnvironmentKey,
  SUPABASE_SECRET_KEY: OptionalEnvironmentKey,
  CELO_NETWORK: z.literal("celoSepolia"),
  CELO_CHAIN_ID: z.coerce.number().int().positive(),
  CELO_RPC_URL: z.string().url(),
  CELO_CONFIRMATIONS: z.coerce.number().int().nonnegative().default(1),
  CELO_BACKFILL_BLOCKS: z.coerce.number().int().nonnegative().default(0),
  CELO_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  CELO_RPC_RETRIES: z.coerce.number().int().nonnegative().default(3),
  CELO_RPC_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  AUTH_SESSION_SECRET: z
    .string()
    .min(32, "AUTH_SESSION_SECRET must be at least 32 characters")
    .refine((value) => new Set(value).size >= 16, "AUTH_SESSION_SECRET must contain at least 16 distinct characters"),
  AUTH_NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  CELOHT_ALLOWED_ORIGIN: z.string().url().optional(),
}).superRefine((values, context) => {
  if (!values.SUPABASE_ANON_KEY && !values.SUPABASE_PUBLISHABLE_KEY) {
    context.addIssue({ code: "custom", path: ["SUPABASE_ANON_KEY"], message: "Set SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY." });
  }
  if (!values.SUPABASE_SERVICE_ROLE_KEY && !values.SUPABASE_SECRET_KEY) {
    context.addIssue({ code: "custom", path: ["SUPABASE_SERVICE_ROLE_KEY"], message: "Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY." });
  }
  if (
    values.SUPABASE_ANON_KEY && values.SUPABASE_PUBLISHABLE_KEY &&
    values.SUPABASE_ANON_KEY !== values.SUPABASE_PUBLISHABLE_KEY
  ) {
    context.addIssue({ code: "custom", path: ["SUPABASE_PUBLISHABLE_KEY"], message: "Set only one publishable/anon key." });
  }
  if (
    values.SUPABASE_SERVICE_ROLE_KEY && values.SUPABASE_SECRET_KEY &&
    values.SUPABASE_SERVICE_ROLE_KEY !== values.SUPABASE_SECRET_KEY
  ) {
    context.addIssue({ code: "custom", path: ["SUPABASE_SECRET_KEY"], message: "Set only one server key." });
  }
  if (values.SUPABASE_PUBLISHABLE_KEY && !values.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")) {
    context.addIssue({ code: "custom", path: ["SUPABASE_PUBLISHABLE_KEY"], message: "SUPABASE_PUBLISHABLE_KEY must use the sb_publishable_ format." });
  }
  if (values.SUPABASE_SECRET_KEY && !values.SUPABASE_SECRET_KEY.startsWith("sb_secret_")) {
    context.addIssue({ code: "custom", path: ["SUPABASE_SECRET_KEY"], message: "SUPABASE_SECRET_KEY must use the sb_secret_ format." });
  }
  if (values.SUPABASE_ANON_KEY?.startsWith("sb_secret_")) {
    context.addIssue({ code: "custom", path: ["SUPABASE_ANON_KEY"], message: "A secret key cannot be used as a publishable key." });
  }
  if (values.SUPABASE_SERVICE_ROLE_KEY?.startsWith("sb_publishable_")) {
    context.addIssue({ code: "custom", path: ["SUPABASE_SERVICE_ROLE_KEY"], message: "A publishable key cannot be used as a server key." });
  }
}).transform((values) => ({
  ...values,
  SUPABASE_ANON_KEY: values.SUPABASE_ANON_KEY ?? values.SUPABASE_PUBLISHABLE_KEY!,
  SUPABASE_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY ?? values.SUPABASE_SECRET_KEY!,
}));

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigurationError extends Error {
  constructor(message: string, readonly variables: string[]) {
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
    const variables = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new ConfigurationError(
      `Missing or invalid required configuration: ${variables.join(", ")}`,
      variables
    );
  }

  if (parsed.data.SUPABASE_ANON_KEY === parsed.data.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ConfigurationError(
      "SUPABASE_ANON_KEY must be the anon/publishable key, not the service-role key.",
      ["SUPABASE_ANON_KEY"]
    );
  }

  if (process.env.NODE_ENV === "production") {
    const supabaseUrl = new URL(parsed.data.SUPABASE_URL);
    if (supabaseUrl.protocol !== "https:" || supabaseUrl.hostname !== "cncplsjsqsxuespnacoa.supabase.co") {
      throw new ConfigurationError(
        "SUPABASE_URL must target the canonical CeloHT Supabase project over HTTPS.",
        ["SUPABASE_URL"]
      );
    }

    if (parsed.data.CELO_RPC_URL !== "https://forno.celo-sepolia.celo-testnet.org") {
      throw new ConfigurationError(
        "CELO_RPC_URL must use the canonical Celo Sepolia RPC endpoint in production.",
        ["CELO_RPC_URL"]
      );
    }

    const missingProductionVariables = [
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "CELOHT_ALLOWED_ORIGIN",
    ].filter((variable) => !parsed.data[variable as keyof typeof parsed.data]);
    if (missingProductionVariables.length > 0) {
      throw new ConfigurationError(
        `Missing required production configuration: ${missingProductionVariables.join(", ")}`,
        missingProductionVariables
      );
    }

    if (parsed.data.CELOHT_ALLOWED_ORIGIN !== "https://app.celoht.com") {
      throw new ConfigurationError(
        "CELOHT_ALLOWED_ORIGIN must be https://app.celoht.com in production.",
        ["CELOHT_ALLOWED_ORIGIN"]
      );
    }
  }

  if (!SUPPORTED_CHAIN_IDS.includes(parsed.data.CELO_CHAIN_ID as (typeof SUPPORTED_CHAIN_IDS)[number])) {
    throw new ConfigurationError(
      `CELO_CHAIN_ID=${parsed.data.CELO_CHAIN_ID} is not an officially configured CeloHT network. ` +
        `Refusing to start against an unconfigured chain (fail closed).`,
      ["CELO_CHAIN_ID"]
    );
  }

  if (parsed.data.CELO_CHAIN_ID !== 11142220) {
    throw new ConfigurationError("Celo Sepolia requires CELO_CHAIN_ID=11142220.", ["CELO_CHAIN_ID"]);
  }

  cached = parsed.data;
  return cached;
}

/** For tests only: clears the cached config so a fresh env can be parsed. */
export function __resetConfigCacheForTests(): void {
  cached = null;
}
