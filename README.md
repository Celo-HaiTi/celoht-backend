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
- `ARCHITECTURE.md` — how requests flow through the system
- `SECURITY.md` — non-negotiable security rules
- `API.md` and `OPENAPI.md` — endpoint reference and machine-readable contract
- `AUTHENTICATION.md` — wallet nonce/signature sign-in flow
- `AUTHORIZATION.md` — server-side role enforcement
- `ADMIN.md` — admin/reviewer capabilities and audit trail
- `KYC.md` — KYC submission and review flow
- `INDEXER_INTEGRATION.md` — the read-only boundary with `celoht-indexer`
- `DEPLOYMENT.md`, `ENVIRONMENT.md`, and `OPERATIONS.md` — production operations
- `CONTRIBUTING.md` and `TROUBLESHOOTING.md` — contribution and support guidance

## Verification status
- [x] Builds, typechecks, and lints under strict TypeScript.
- [x] Unit tests cover: fail-closed config, session token integrity
      (including tamper/expiry rejection), and role authorization.
- [x] Production dependency audit reports zero high/critical vulnerabilities.
- [x] No mock production data paths — missing configuration returns 503.
- [ ] Integration tests against a live Supabase project (RLS assumptions,
      cross-user access, replay attacks end-to-end) — run these against a
      disposable project before promoting to production; see
      `celoht-supabase/tests/rls/README.md` for the paired RLS test plan.
