# CeloHT Testnet Pilot Security and Quality Audit

**Audit date:** 2026-11-01

**Final status:** **NOT READY**

This audit covers separate checkouts; source revisions are recorded below. No
wallet-signed transaction, approval, donation, registration, or governance vote
was submitted. All live chain calls were read-only and used Celo Sepolia only.

## Scope and revisions

| Repository | Revision | Checks performed |
|---|---|---|
| `celoht-dapp` | `8bf9767` | typecheck, lint, 22 tests, production/custom-domain builds, artifact assertions, contract sync, dependency audit |
| `celoht-backend` | `43eb127` | typecheck, lint, 89 tests, production build, production/full dependency audits |
| `celoht-supabase` | `0c1a844` | schema validation, disposable PostgreSQL migration/RLS suite, mock-data guard, dependency audit |
| `celoht-indexer` | `cf3cd91` | typecheck, lint, 22 tests, build, mock-data guard, read-only Sepolia RPC integration, dependency audits |
| `celoht-smart-contracts` | `4ee7f01` | read-only deployment/ABI source for DApp contract synchronization |

## Security findings

### High

**H-01 — Public indexer health can disclose RPC URL credentials.**
`celoht-indexer/src/indexing/backfill.ts` stores `String(err)` as
`indexer_state.last_error`; `src/health/server.ts` includes that database field
as `lastError` in unauthenticated `/health` and `/readyz` responses. A controlled
probe against the installed viem version confirmed that a synthetic token in
an RPC URL appears verbatim in the thrown error string. A production RPC URL
with credentials in its path/query can therefore leak them to unauthenticated
callers after an RPC failure. Store only a sanitized error code/type, redact
URLs before persistence/logging, and remove raw errors from public health
responses. Add a canary regression test for the health payload and logs.

**H-02 — Indexer production dependency audit fails on direct Zod.**
`celoht-indexer/package.json` allows Zod 3; the lockfile resolves `zod@3.25.76`.
`npm audit --omit=dev --audit-level=high` reports GHSA-mrhx-c7xc-m3w5, high
severity, for memory exhaustion when validating oversized constrained
collections. npm only offers `zod@4.6.7` as a fix, which is a breaking upgrade.
The current indexer schemas are primarily fixed deployment metadata and
environment validation, so untrusted collection reachability is limited, but
the production advisory remains unresolved. Upgrade to a patched version,
verify Zod 4 behavior, and rerun typecheck, tests, build, and the production
audit before deployment.

**High-severity development advisories:** the indexer full dependency tree also
flags `brace-expansion`, `source-map-js`, and `vite`; these are development/test
dependencies, not in the production-only audit. Update the Vite/Vitest/ESLint
dependency tree and rerun all checks. DApp/backend full audits report moderate
development-tooling advisories only; their production-only audits pass.

### High pilot blockers (functional/security boundary)

**P1 — Live API deployment has route and domain failures.** The Render service
health endpoint returned HTTP 200 on 2026-11-01 with database, Sepolia RPC, and
rate-limit dependencies healthy. However, `api.celoht.com` fails TLS,
`GET /api/v1/certificates` is misrouted to public governance data, and
`GET /api/v1/reforestation/evidence` returns HTTP 500. A healthy dependency
probe does not certify every route or canonical schema integration.

**P1 — Evidence upload has no complete agent path.** The backend now returns
503 from agent evidence submission. The DApp contains no evidence upload client,
and Supabase `0007_storage.sql` permits reforestation-evidence writes only for
reviewer/admin roles. The backend now follows the canonical project-ID prefix,
but there is no owner-bound upload capability or structured planting metadata
in the canonical evidence table. Migration 0021 also permits authenticated
users to insert evidence rows without requiring agent approval or validating
object ownership; the disabled backend route does not block direct Data API
inserts. Fix the grant/RLS, deploy a reviewed upload policy/client, and define
supported evidence metadata before enabling submission.

**P1 — Notifications are not a durable cross-repository feature.** Supabase
contains notification tables and RLS, but the backend exposes no `/notifications`
routes and the indexer has no notification producer. The DApp requests those
endpoints but falls back to local storage; its only `createNotification`
call-site is wallet transaction confirmation. Auth, education, agent, evidence,
and governance events are not integrated into a durable feed. Wire authorized
backend APIs and event-driven producers before claiming those notification
types work.

**P1 — Transaction history is always empty in the DApp.**
`celoht-dapp/app/wallet/activity/page.tsx` initializes `activity` to `[]` and
does not call its backend transaction API or query the chain. The screen will
always show its empty state, even when confirmed transactions exist. Connect
the wallet-scoped confirmed transaction API and test sent/received/pending/
failed states without invented records.

**P1 — The profile/admin modules are split across deployments.** The DApp is a
static GitHub Pages build at `app.celoht.com`; the authenticated profile/admin
pages are Next routes in `celoht-backend` and are not part of that static
artifact. The DApp profile is wallet/on-chain display, not the backend's
verified profile editor, and the DApp has no admin page. Integrate navigation
and authenticated API workflows in the static app or explicitly deploy and
route the backend UI on a supported server host.

### Medium

**M-01 — Education progress is local-only in the DApp.** Lessons and quizzes
are implemented, but `CoursePageClient` stores completion in browser
`localStorage`; it does not call backend enrollment/progress APIs. The pilot
center itself states lesson detail/enrollment/quizzes are not exposed by the
backend. Cross-device progress and authenticated enrollment are therefore
unverified.

**M-02 — Reforestation storage path documentation conflicts.** Supabase
`STORAGE.md` specifies a project-ID prefix, while backend validation and its
runbook specify an agent-ID prefix. Current Supabase policies restrict
reforestation evidence writes to reviewers/admins, not agents. This combination
will prevent the documented agent upload workflow until migrations, policy,
backend, DApp uploader, and docs agree.

## Security controls that passed source review

- Backend wallet signatures use `viem.verifyMessage`; the single-use challenge
  is consumed only after signature verification. HMAC sessions use
  `timingSafeEqual`, expiration, `HttpOnly`, and production `Secure`/
  `SameSite=None` cookies. Unit tests pass; production session issuance was not
  live-tested because the database is unhealthy.
- Privileged backend APIs re-resolve `profiles.role` server-side and enforce
  role checks. Admin mutations are audit-logged; self-role changes are denied.
- Backend chain configuration is Sepolia-only (`11142220`) and fails closed.
  Indexer `ALLOWED_NETWORKS` contains only `celoSepolia`.
- The DApp build tested here supports Sepolia only: network config tests reject
  mainnet, and its deploy workflow does not set the explicit mainnet activation
  variables. Mainnet activation code exists but was not enabled or used.
- DApp contract sync against the official smart-contract repository passed for
  the Sepolia deployment and five ABIs. The read-only RPC check confirmed chain
  ID `11142220`, governance/USDm bytecode, and USDm 18 decimals.
- Supabase disposable PostgreSQL verification passed all migrations/database
  assertions. RLS and private storage policies were source-reviewed; live
  project policies were not reachable for verification.
- No tracked `.env` files or obvious committed private-key/provider-token
  patterns were found. DApp environment examples use public RPC URLs; secret
  Supabase/backend credentials are not bundled in the DApp.
- CORS is restricted to the configured app origin. Production configuration
  rejects other origins and requires the shared rate-limit store; the live
  health response reported that store healthy.

## Functional test results

| Workflow | Result | Evidence / limitation |
|---|---|---|
| Wallet connect/disconnect | Partial | DApp unit tests cover provider choices and disconnected states; no browser wallet was available for an interactive session. |
| Network switching | Pass, code-level | DApp tests and UI target Celo Sepolia only; no live wallet switch was executed. |
| CELO/USDm balances | Partial | Wagmi hooks and verified token metadata are present; no user wallet was supplied to check balances. |
| Send/receive | Not executed | Send uses wallet-signed CELO/ERC-20 transactions and receipt state; receive renders address/QR. No funds or wallet transaction was used. |
| Transaction history | Fail | DApp activity source is hard-coded empty. |
| Authentication | Partial | Backend signature/session unit tests pass; live API currently returns unhealthy database dependency. |
| Education enrollment/quizzes | Partial | Local lesson content and quizzes exist; enrollment/progress persistence is browser-local, not backend-backed. |
| Agent registration/verification | Partial | DApp contains a real Sepolia registry registration flow and a separate local-preview page; no registration or verification transaction was submitted. |
| Reforestation contributions | Partial | Donation UI uses official Sepolia contracts and confirmation receipts; no wallet transaction was submitted. |
| Reforestation evidence | Fail | No agent upload client/server upload authorization path; storage prefix/policy mismatch remains. |
| Governance proposals/voting | Fail / unavailable | DApp says proposal feed is unavailable. Read-only Sepolia scan found zero governance proposal logs at head block `40211702`; no vote was submitted. |
| Notifications | Fail / partial | Local browser notifications only; only transfer confirmation has a creation call-site, no backend routes or indexer producers. |
| User profiles | Partial | DApp shows wallet/on-chain state; backend verified profile editor exists separately and live DB is unhealthy. |
| Admin authorization | Pass, code-level | Role checks/audit tests pass; production admin access could not be exercised while backend DB is unavailable. |

## Commands and outcomes

- DApp: `npm run typecheck`, `npm run lint`, `npm test` (22/22), `npm run
  build`, `npm run build:custom-domain`, `npm run contracts:sync`,
  `npm run guard:mock-data`, `npm run audit` all passed. GitHub Pages artifact
  assertions passed with `CNAME=app.celoht.com`.
- Backend: `npm run typecheck`, `npm run lint`, `npm test` (89/89),
  `npm run build`, `npm run mock-data-guard`, and `npm run audit` passed.
- Supabase: `npm run validate` passed (20 migrations, 36 required tables);
  `npm run verify:postgres` passed in its disposable PostgreSQL container;
  mock-data guard and `npm audit` passed.
- Indexer: `npm run typecheck`, `npm run lint`, `npm test` (22/22),
  `npm run build`, and mock-data guard passed. Read-only
  `npm run test:integration:rpc` passed on chain `11142220` (`governanceLogs=0`,
  `usdmTransferLogs=32`). Production `npm audit --omit=dev --audit-level=high`
  fails on H-02.
- Indexer `test:integration:postgres` and `test:integration:failure` fail fast
  with “POSTGRES_TEST_URL or DATABASE_URL is required”; neither variable is
  present. They were not pointed at any non-disposable database.
- The indexer's Vitest run emits a non-fatal Vite warning about `__dirname`
  under `configLoader: 'native'`.

## Remaining external blockers and remediation

1. Fix and retest indexer health error redaction; never persist/return provider
   exception strings that may contain credential-bearing RPC URLs.
2. Upgrade indexer Zod to a patched major version and resolve high dev-tree
   advisories; make production `npm audit --omit=dev --audit-level=high` pass.
3. Restore production Supabase connectivity. The live health endpoint currently
   returns 503 with database `query_failed`; verify configuration/schema/RLS in
   the deployed project without exposing secrets.
4. Implement durable notification APIs and real event producers; connect the
   DApp preferences/feed to them.
5. Connect wallet activity to confirmed chain/indexer records; do not report
   locally fabricated transaction history.
6. Define and test an agent evidence upload path consistent across DApp,
   backend, Supabase storage policy, and `STORAGE.md`.
7. Run browser wallet tests using a disposable Celo Sepolia wallet, including
   connect/disconnect/network switch, balances, receive, and controlled
   test-value send/donation/registration flows. Verify education, profile,
   admin, and governance against the live testnet backend after health recovers.
8. Provide a disposable Supabase URL for the indexer Postgres integration and
   failure-mode suites; do not use production for tests that drop schemas.

**Pilot readiness: NOT READY.** The production high dependency advisory and
confirmed public error-secret disclosure are unresolved. Required live API,
notification, evidence-upload, history, governance, and wallet workflows are
also unavailable or unverified. No successful testnet transaction is claimed.