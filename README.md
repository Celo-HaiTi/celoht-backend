# celoht-backend

Phase 2 of the CeloHT production infrastructure: the official application
backend for CeloHT — wallet authentication, agent/KYC workflows, education,
reforestation, governance presentation, and admin operations.

This is **not** a blockchain indexer. It never writes to indexer-owned
tables (see `docs/INDEXER_INTEGRATION.md`) and never fabricates on-chain
data — see `docs/ARCHITECTURE.md`.

## Stack
Next.js 14 (App Router) · TypeScript strict · Zod · Supabase · viem

## Getting started
```bash
cp .env.example .env   # fill in from your Supabase project + RPC provider
npm ci
npm run dev
```

## Scripts
```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Documentation
- `docs/ARCHITECTURE.md` — how requests flow through the system
- `docs/SECURITY.md` — non-negotiable security rules
- `docs/API.md` — full endpoint reference
- `docs/AUTHENTICATION.md` — wallet nonce/signature sign-in flow
- `docs/AUTHORIZATION.md` — server-side role enforcement
- `docs/ADMIN.md` — admin/reviewer capabilities and audit trail
- `docs/KYC.md` — KYC submission and review flow
- `docs/INDEXER_INTEGRATION.md` — the read-only boundary with `celoht-indexer`
- `docs/DEPLOYMENT.md`, `docs/ENVIRONMENT.md` — running this in production
- `docs/CONTRIBUTING.md` — required checks before a PR

## Verification status (Phase 2)
- [x] Builds, typechecks, and lints under strict TypeScript.
- [x] Unit tests cover: fail-closed config, session token integrity
      (including tamper/expiry rejection), and role authorization.
- [x] No secret is referenced outside `src/lib/supabase/server.ts`
      (enforced additionally by an ESLint rule).
- [x] No mock production data paths — missing configuration returns 503.
- [ ] Integration tests against a live Supabase project (RLS assumptions,
      cross-user access, replay attacks end-to-end) — run these against a
      disposable project before promoting to production; see
      `celoht-supabase/tests/rls/README.md` for the paired RLS test plan.

## Next phase
Phase 3: `celoht-indexer` — syncs the official CeloHT smart contracts into
the `celoht-supabase` database this backend reads from.
