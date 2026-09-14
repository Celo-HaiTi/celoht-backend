# CeloHT Backend Operational Readiness Matrix

Assessment date: 2026-09-14.

This repository owns the application API and wallet-auth boundary. Supabase
schema, blockchain indexing, governance mutation, and smart-contract deployment
remain owned by their canonical Celo-HaiTi repositories.

| Component | Current State | Required Work | Can Implement Internally? | External Audit Required? | Final Status |
| --- | --- | --- | --- | --- | --- |
| Wallet nonce and signature auth | Implemented with server-side challenge storage, expiry, single-use consumption, strict address/nonce/signature validation, and HMAC sessions | Run live replay/RLS tests against canonical Supabase | Partly | No | NEEDS TESTING |
| Session and authorization | Implemented; role is reloaded from `profiles` on every request | Verify role changes and revoked profiles in live integration | Partly | No | NEEDS TESTING |
| API validation and error handling | Implemented with Zod, generic errors, request IDs, and fail-closed config handling | Exercise every route with live database and unauthorized requests | Yes | No | NEEDS TESTING |
| Supabase schema and RLS | Canonical migrations exist in `celoht-supabase`, including `0013_auth_challenges.sql` | Apply migrations to a disposable project and run RLS tests | No, owned externally | No | BLOCKED BY EXTERNAL DEPENDENCY |
| Indexer-backed reads | Backend read boundary is documented; canonical indexer manifests and tables exist | Verify indexed records, checkpoint, restart, and API responses against a live stack | No, owned externally | No | NEEDS INTEGRATION |
| Governance mutations and execution | Governance schema and service exist in `celoht-governance`; this backend exposes read-only proposal presentation | Integrate the canonical governance API or explicitly keep mutations outside this backend | No, owned externally | No | NEEDS INTEGRATION |
| Chain configuration | Celo Sepolia chain ID is enforced; canonical contract/indexer manifests agree on addresses | Add live RPC and bytecode verification to deployment smoke tests | Partly | No | NEEDS TESTING |
| Rate limiting | In-memory limiter works for one process and unit tests | Deploy a shared Redis or edge-store limiter before multi-instance production | Yes, pending infrastructure configuration | No | NEEDS IMPLEMENTATION |
| Health/readiness | Config, database reachability, and health snapshot persistence are checked | Verify from deployed service and alert on 503 | Partly | No | NEEDS DEPLOYMENT |
| Deployment | Render blueprint and CI build pipeline exist | Configure secrets, deploy, restart, and verify health/API smoke tests | Partly | No | NEEDS DEPLOYMENT |
| Dependency security | Production `npm audit` is clean at high severity | Keep CI audit blocking rather than informational | Yes | No | COMPLETE |
| Independent review | No independent contract, treasury, penetration, or legal review is represented here | Obtain qualified independent reviews after technical readiness | No | Yes | PENDING EXTERNAL AUDIT |

## External Audit Status

### PENDING EXTERNAL AUDIT

- Independent smart-contract security audit.
- Independent Treasury/Safe security review.
- Independent penetration test.
- Formal legal review where applicable.

These items do not replace the internal work still listed as `NEEDS TESTING`,
`NEEDS IMPLEMENTATION`, `NEEDS INTEGRATION`, or `NEEDS DEPLOYMENT`.

## Verified Cross-Repository Artifacts

- `Celo-HaiTi/celoht-supabase/0013_auth_challenges.sql`: backend-owned auth challenge table with deny-all client RLS.
- `Celo-HaiTi/celoht-governance/migrations/0013_governance_workflow.sql`: governance workflow, votes, quorum, audit, and execution tables.
- `Celo-HaiTi/celoht-smart-contracts/deployments/celoSepolia.json` and `Celo-HaiTi/celoht-indexer/deployments/celoSepolia.json`: matching chain ID `11142220`, verified contract addresses, and deployment blocks.

## Final Status

### NOT READY

Internal engineering and live integration work remains before this backend can
truthfully be called operational. The remaining work is not an external audit
excuse: it is primarily shared rate limiting, live database/RLS/auth testing,
cross-service indexing verification, and deployment verification.
