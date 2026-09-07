# SECURITY.md

## Non-negotiables
- `SUPABASE_SERVICE_ROLE_KEY` lives only in server environment variables,
  read only from `src/lib/supabase/server.ts`, which is `import "server-only"`
  guarded. It is never referenced in any `NEXT_PUBLIC_*` variable.
- No private key or seed phrase is ever requested, accepted, or stored.
- No endpoint trusts a client-declared role, admin flag, or wallet address
  without independent verification (signature check for wallet identity;
  DB lookup for role).
- Every response funnels through `withApiErrorHandling`, which replaces raw
  database/library errors with a generic message — internal details are
  logged server-side only.

## Fail closed
`src/lib/config.ts` validates all required environment variables at first
use and throws `ConfigurationError` if anything is missing or the configured
chain ID is not an officially supported CeloHT network. Every route treats
that as a 503, never as a cue to serve mock data.

## Wallet authentication security
See `AUTHENTICATION.md`. Summarized: single-use, expiring, server-stored
nonces prevent replay; HMAC-signed session tokens with `timingSafeEqual`
comparison prevent tampering; per-wallet rate limiting on both nonce
issuance and verification blunts brute-force/spam.

## Dependency hygiene
CI runs `npm audit` on every push (see `.github/workflows/ci.yml`); high or
critical findings should block merges once the project's own audit
threshold is agreed.
