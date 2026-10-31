# DATABASE.md (backend perspective)

This repository does not define the shared schema. The authoritative schema
lives in `Celo-HaiTi/celoht-supabase`; this document covers the backend's
database contract and ownership boundary.

## Backend-internal table
The canonical `celoht-supabase/0013_auth_challenges.sql` migration defines
`auth_challenges` for wallet sign-in. It is backend-owned data deployed by the
Supabase repository, with lower-case EVM address and 32-byte nonce constraints,
unique challenge identifiers, expiry ordering, and deny-all RLS for client
roles. Do not create a second migration in this repository.

## Tables this backend reads/writes
See `celoht-supabase/OWNERSHIP.md` — this backend owns every table
marked BACKEND OWNED and reads (never writes) tables marked INDEXER OWNED.

The governance workflow tables are owned and migrated by
`celoht-governance/migrations/0013_governance_workflow.sql`; this backend does
not currently expose governance mutation or execution endpoints.

## Education workflows
`celoht-supabase/0021_education_platform.sql` adds localized course content,
quiz attempts, enrollment-scoped progress, and certificate linkage. The
backend calls the `record_education_lesson_start`, `submit_education_quiz`,
and `save_education_course` service-role-only functions. Clients have no write
policies or Data API privileges for enrollment, completion, attempt, answer,
or certificate state; quiz answer tables are not granted to client roles.
Apply the canonical Supabase migrations before deploying this backend version.

## Agent network
Migration `celoht-supabase/0022_agent_network.sql` adds structured directory
fields and `agent_services`, and links each legacy application to the
normalized wallet/activity profile. The backend reads the indexer's
`agents.on_chain_registry_status` but never writes it. Public verification is
derived from the latest reviewer-approved `agent_kyc` record; application or
registry status alone is not proof of verification.

`agents.application_status` tracks application review independently from
`agents.off_chain_kyc_status` and `agents.on_chain_registry_status`. KYC
decisions do not implicitly approve applications; application approval
requires the latest submitted KYC record to have an approved status, reviewer,
and review timestamp. Only then can the agent appear as verified or offer
available services.

## Readiness probe
`GET /api/v1/health` performs a read-only `id` query against `profiles` using
the server-side service-role client. No `system_health` table is required, and
this repository contains no migration for one. The canonical Supabase schema
must still be applied so the core `profiles` table exists and is readable by
the service role.
