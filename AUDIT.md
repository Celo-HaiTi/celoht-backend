# Repository Audit

## Repository Role

`celoht-backend` is the CeloHT application backend and API layer. Its role in the ecosystem is to provide authenticated application workflows for the DApp, including wallet authentication, profile/session handling, KYC, education/progress, reforestation, governance presentation, certificates, admin review, and audit logging.

This repository is not a blockchain indexer, not a smart contract deployment repository, and not a DApp UI. It reads indexer-owned on-chain tables when present, but it does not write blockchain data itself.

## Architecture

The current architecture is a Next.js App Router backend with TypeScript strict mode, Zod request validation, `@supabase/supabase-js`, and `viem` for signature verification.

Key architecture points:

- Route handlers live in the top-level `route*.ts` files and under `app/api/v1/**/route.ts`.
- Server-side configuration is centralized in `config.ts` and re-exported via `src/lib/config.ts`.
- Server-only Supabase access is isolated in `src/lib/supabase/server.ts` and guarded by `server-only`.
- Auth/session logic lives in `session.ts` and `authorization.ts`.
- Business logic route handlers use `withApiErrorHandling()` and `apiError()` for consistent fail-closed responses.
- Health and readiness are represented by `GET /api/v1/health`, which returns `503` if required configuration or the database is unavailable.

## Existing Functionality

The repository already contains working code for the following areas:

- Wallet authentication flow with nonce issuance and signature verification
- Session issuance, validation, and cookie handling
- Server-side role enforcement by reloading `profiles.role` from the database
- Fail-closed configuration handling that refuses to start with missing or unsupported values
- Standardized API error responses and request logging
- Health endpoint that fails closed when required dependencies are unavailable
- Admin/audit routes for agent/KYC/evidence/audit-log workflows
- Application routes covering agents, certificates, courses, governance, profile, progress, reforestation, and transactions

## Incomplete Functionality

The repository is functionally strong at the code level, but some areas remain incomplete from a production-readiness perspective:

- Canonical schema, ABI, deployment, and governance artifacts were verified through the public Celo-HaiTi sibling repositories during this assessment.
- Production deployment secrets, live Supabase URL/project values, and live RPC settings are not present in this workspace.
- Multi-instance rate limiting is implemented through an Upstash-compatible
  shared Redis REST store, but the live store is not configured in this workspace.
- There are no live end-to-end tests against a disposable Supabase project and verified chain configuration.
- The repository documents intended integrations but does not independently verify the live canonical database schema or external contract addresses/ABI from sibling repos.

## Mock/Simulated Functionality

The checked-in code does not appear to include fake production data paths. The fail-closed configuration design is intentional and explicit:

- Missing configuration throws `ConfigurationError` and routes return `503`.
- The `server-only.ts` file is a test-support no-op guard, not production data.
- Placeholder values in CI are purely to satisfy build-time environment requirements; they are not production credentials.

## Dependencies

Required external dependencies for a real deployment include:

- Supabase project (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- Celo Sepolia RPC endpoint (`CELO_RPC_URL`)
- Session secret (`AUTH_SESSION_SECRET`)
- Canonical CeloHT sibling repositories, especially:
  - `celoht-supabase`
  - `celoht-indexer`
  - `celoht-dapp`
  - `celoht-governance`
  - `celoht-smart-contracts`

The sibling repositories are not checked out locally, but their canonical public artifacts were inspected. Live application connectivity remains unverified.

## Security

Verified strengths:

- Secret handling is server-only and isolated from browser bundles.
- `getConfig()` validates required environment variables and rejects unapproved chain IDs.
- Session tokens use HMAC signing and `timingSafeEqual` comparison.
- Authentication re-reads roles from the database rather than trusting client-side claims.
- Error responses are standardized and do not leak internal exceptions.

Remaining security risks / gaps:

- Live shared rate-limit behavior and failure recovery remain unverified without
  a configured Redis REST store.
- Live end-to-end auth/RLS/replay testing is not present in this workspace.
- Live canonical integrations (database, contracts, governance model) remain unverified because no deployed environment is available.

## Deployment

The repository contains deployment configuration and health handling for a single Next.js backend service:

- `render.yaml` defines a web service deployment shape.
- `DEPLOYMENT.md` documents required environment values and build/run order.
- `GET /api/v1/health` checks configuration and database reachability.

Current deployment status cannot be verified beyond repository configuration because live environment variables and external service deployments are not present in this workspace.

## Documentation

Available documentation is strong and extensive:

- `README.md`
- `ARCHITECTURE.md`
- `SECURITY.md`
- `AUTHENTICATION.md`
- `AUTHORIZATION.md`
- `ADMIN.md`
- `KYC.md`
- `INDEXER_INTEGRATION.md`
- `DEPLOYMENT.md`
- `ENVIRONMENT.md`
- `OPERATIONS.md`
- `CONTRIBUTING.md`
- `TROUBLESHOOTING.md`

Documentation gap: the repository documents the intended boundary with other CeloHT repos, but live deployment URLs and runtime connectivity are not available here.

## Production Blockers

### P0 — Critical production blocker

- `BLOCKED — LIVE VERIFICATION REQUIRED`: Real deployment values for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CELO_RPC_URL`, and `AUTH_SESSION_SECRET` are not present in this workspace, so no live production deployment can be certified.
- `NEEDS CONFIGURATION`: The shared Redis REST limiter is implemented, but its live endpoint and token are not available in this workspace.

### P1 — Important production issue

- The shared limiter still requires live Redis verification before multi-instance deployment.
- Live end-to-end auth/RLS/replay testing against a disposable Supabase project has not been run.

### P2 — Improvement

- Add explicit operational runbooks for production secret rotation and deployment verification.
- Add stronger observability around auth failures, health alerts, and request IDs.

## Current Status

NOT READY

This status is supported by the repository’s code-level verification results, but not by live production integration or deployment evidence.
