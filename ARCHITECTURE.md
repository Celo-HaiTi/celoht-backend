# ARCHITECTURE.md

`celoht-backend` is the application API layer between `celoht-dapp` and
Supabase. It owns application workflows (auth, KYC, education, admin,
audit) and reads (but never writes) the indexer-owned on-chain tables.

```
celoht-dapp -> celoht-backend -> Supabase (Auth, Postgres, Storage)
                                        ^
                                        |
                                celoht-indexer (writes on-chain tables directly)
```

## Stack
Next.js 14 (App Router, Route Handlers), TypeScript strict mode, Zod
validation, `@supabase/supabase-js`, `viem` for signature verification.

## Request lifecycle
1. Route handler under `src/app/api/v1/**/route.ts` parses/validates input with Zod.
2. `requireActor()` resolves the session (if the route needs auth) and re-reads
   the role from `profiles.role` — never from the token's own claims.
3. `requireRole()` enforces authorization for admin/reviewer-only routes.
4. Business logic runs against the Supabase **service role** client
   (`src/lib/supabase/server.ts`), since the backend — not Postgres RLS — is
   the primary authorization boundary for privileged operations.
5. Sensitive administrative actions call `writeAuditLog()` in the same
   request as the state change.
6. Responses go through `apiOk`/`apiError` for a consistent envelope; no
   raw database error ever reaches the client (`withApiErrorHandling`).

See `celoht-supabase/docs/OWNERSHIP.md` for the full ownership boundary
between backend and indexer.
