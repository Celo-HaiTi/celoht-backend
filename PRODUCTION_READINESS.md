# CeloHT Production Readiness

## Current Assessment — 2026-11-01

**Final status: NOT READY.** The Node 22 repository checks pass, but the live
backend is not verified healthy and the evidence workflow is intentionally
disabled until its private storage contract is fixed.

### Current verification

- Runtime: Node 22.23.4 / npm 11.19.1; Render and both CI declarations target Node 22.
- `npm ci --include=dev`, `npm run typecheck`, `npm run lint`, `npm test`
  (26 files, 102 tests), `npm run build`, and `npm run mock-data-guard` passed.
- `npm audit --omit=dev --audit-level=high` found zero vulnerabilities.
- Full `npm audit --audit-level=high` reports 18 moderate `minimatch` findings
	in development tooling. npm's suggested forced fix would downgrade ESLint to
	a breaking version; no force fix was applied.
- The canonical Sepolia RPC returned HTTP 200 and chain ID `11142220`.
- On 2026-11-01, `https://celoht-backend.onrender.com/api/v1/health` returned
	HTTP 200 with database, Sepolia RPC, and rate-limit dependencies healthy.
	This verifies the live `profiles` probe only, not every route/schema.
- Live `GET /api/v1/certificates` is misrouted to public governance data and
	returns HTTP 200 without authentication. Live
	`GET /api/v1/reforestation/evidence` returns HTTP 500.
- Live courses, transactions, reforestation summaries, and governance reads
	returned HTTP 200 with empty records/proposals; no records were fabricated.
- `app.celoht.com` returned HTTP 200, but that is the frontend domain, not the
	backend API domain.
- `api.celoht.com` still fails TLS negotiation. The route/schema fixes in this
	worktree are uncommitted and have not been deployed.

### Blocking issues

- No Supabase/auth/Upstash credentials are available in this workspace; full
	authenticated integration tests and `npm run smoke` could not be run. The
	live health endpoint confirms the service-role profile read works, but does
	not verify every table, RLS policy, or mutation.
- Supabase migrations 0001–0021 were reviewed read-only, but live migration
	application, RLS/grants, and storage policies on project
	`cncplsjsqsxuespnacoa` remain unverified.
- Migration 0021's authenticated insert grant/policy for evidence rows does not
	require an approved agent or validate private object ownership. The disabled
	backend POST does not prevent direct Supabase Data API inserts; fix the
	canonical grant/RLS/storage path in the Supabase repository before intake.
- Canonical storage migration 0007 restricts `reforestation-evidence` writes
	to reviewers/admins; no DApp evidence uploader was found. The backend returns
	503 for agent evidence submission. The canonical table also lacks structured
	planting date, coordinate, and notes fields.
- Canonical migration 0021 defines append-only evidence-review history and a
	database trigger; the backend still performs pending-state updates and
	`audit_logs` writes separately. The migration trigger lacks a pending-state
	concurrency guard. A canonical atomic review operation remains necessary.
- `/api/v1/certificates` is now wired to its profile-scoped implementation;
	certificates are read-only here and no issuance job is implemented.
- Durable notifications, authenticated lesson/enrollment APIs, and live
	database-backed education completion remain unimplemented or unverified.

### Required Render environment variable names

`SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`, `AUTH_SESSION_SECRET`,
`UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`. Render Blueprint
pins `SUPABASE_URL`, `CELO_NETWORK`, `CELO_CHAIN_ID`, `CELO_RPC_URL`,
`CELOHT_ALLOWED_ORIGIN`, and `NODE_VERSION`.

The assessment below is retained as historical context from 2026-09-15.

## Previous Assessment — 2026-09-15

## Executive Status

Repository: celoht-backend

Date: 2026-09-15

Final status: NOT READY

## Verification Matrix

| Area | Status | Evidence |
| --- | --- | --- |
| Build | READY | `npm run build` completed successfully in this workspace. |
| Typecheck | READY | `npm run typecheck` completed successfully. |
| Tests | READY | `npm test` passed: 5 files, 24 tests. |
| Security | READY WITH CONDITIONS | Static security controls and fail-closed config are implemented and the dependency audit reported zero production vulnerabilities. Live integration security verification remains pending. |
| Dependencies | READY | `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities. |
| Auth | READY WITH CONDITIONS | Wallet nonce/signature verification and HMAC session tokens are implemented; live replay/RLS validation is not available. |
| Authorization | READY WITH CONDITIONS | Server-side role re-resolution is enforced from the database; live RBAC and admin integration checks remain pending. |
| Database | BLOCKED | Live Supabase project and RLS validation are not available in this workspace. |
| Blockchain | BLOCKED | No live Celo Sepolia RPC and deployment validation were available here. |
| External integrations | BLOCKED | Shared Redis, canonical Supabase, and canonical Celo deployment dependencies are not configured in this environment. |
| CI/CD | READY | GitHub Actions runs typecheck, lint, mock-data guard, tests, build, and audit. |
| Documentation | READY WITH CONDITIONS | Repo docs are internally consistent and explicit about fail-closed behavior; production deployment docs remain environment dependent. |
| Production deployment | BLOCKED | No live deployment credentials or infrastructure were available to verify runtime production readiness. |

## Findings

### ID: F-001
- Severity: P1
- File/path: [rateLimit.ts](rateLimit.ts)
- Problem: The production rate limiter requires a shared Redis store, but the repository intentionally fails closed when that store is unavailable. This is safe for security, but it means the app is not deployable without the live external Redis service.
- Security/business impact: Without the production shared store, API abuse protections are not enforced across instances or containers, and the service will reject traffic instead of operating normally.
- Repair performed: Kept fail-closed behavior explicit and documented; added a CI mock-data guard and pinned TypeScript to a supported version to reduce false-positive risk in tooling.
- Verification performed: Static review plus repository-wide verification commands.
- Remaining dependency: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from the live production environment.

### ID: F-002
- Severity: P0
- File/path: [app/api/v1/health/route.ts](app/api/v1/health/route.ts)
- Problem: Health checks are implemented correctly, but they cannot be verified as production-ready without the actual Supabase and RPC dependencies present.
- Security/business impact: The app may be healthy in code while the live services remain unavailable; the code intentionally returns a 503 when dependencies fail, which is the correct behavior but requires external validation.
- Repair performed: Readiness now reports safe configuration diagnostics, checks read-only Supabase access, verifies the Sepolia RPC chain ID and production rate-limit store, and avoids health-probe writes.
- Verification performed: Repository-level tests and build passed; live dependency validation remains blocked externally.
- Remaining dependency: Live disposable Supabase project and Celo Sepolia RPC access.

### ID: F-003
- Severity: P1
- File/path: [scripts/mock-data-guard.mjs](scripts/mock-data-guard.mjs)
- Problem: Production code had no explicit guard to prevent mock-data imports or demo-style fallback patterns from silently entering the release path.
- Security/business impact: A production app that silently falls back to mock or fake data would mislead operators and create false trust in operational metrics.
- Repair performed: Added a CI and local guard that scans production code paths for prohibited mock-data imports or directories.
- Verification performed: `npm run mock-data-guard` passed.
- Remaining dependency: None in-repo; enforcement is now active in CI.

### ID: F-004
- Severity: P2
- File/path: [package.json](package.json)
- Problem: The repository used an unsupported TypeScript-eslint combination with a newer TypeScript version, which caused lint/tooling warnings even though the code itself passed.
- Security/business impact: Toolchain mismatch is a reliability issue; it can create false confidence in lint output and complicate future upgrades.
- Repair performed: Pinned TypeScript to 5.5.3 to match the supported range of the installed eslint toolchain.
- Verification performed: Typecheck, lint, test, and build all passed after the fix.
- Remaining dependency: None.

## External Blockers

### Blocker 1
- Exact requirement: A disposable or production Supabase project with the canonical schema and RLS rules must be available, along with the required service-role and anon credentials.
- Exact environment variables or service required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Why it cannot be verified locally: This workspace does not contain a live Supabase project or credentials for authenticated/RLS validation.
- Exact command/test to run once available: `npm run smoke` with the required environment variables exported, or a live end-to-end auth/RLS/replay validation suite against the canonical Supabase project.

### Blocker 2
- Exact requirement: A live Celo Sepolia RPC endpoint and a configured chain deployment must be available for wallet and chain validation.
- Exact environment variables or service required: `CELO_CHAIN_ID`, `CELO_RPC_URL`, `CELO_NETWORK`.
- Why it cannot be verified locally: No live Celo Sepolia RPC connection or canonical deployment metadata was available in this workspace.
- Exact command/test to run once available: `node scripts/smoke.mjs` after exporting the required variables and a valid `CELO_RPC_URL`.

### Blocker 3
- Exact requirement: A production shared rate-limit service must be configured and reachable by the backend.
- Exact environment variables or service required: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Why it cannot be verified locally: The live Upstash Redis REST endpoint and token are not present in this environment.
- Exact command/test to run once available: `node scripts/smoke.mjs` and a live API stress check against the production Redis store.

## Residual Risks

- Live Supabase RLS and cross-user authorization remain unverified without a real project.
- Live Celo Sepolia RPC and wallet-identity checks remain unverified without access to the canonical chain configuration.
- Shared multi-instance rate limiting remains unverified in production because the live Upstash endpoint is not configured here.
- Full governance and indexer integration remains dependent on repository-level canonical artifacts outside this workspace.

## Final Certification

NOT READY — remaining blockers: live Supabase, Celo Sepolia RPC, and shared Redis verification required.
