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
`celoht-governance/migrations/0013_governance_workflow.sql`. The Governance
page submits wallet-signed votes directly to the official Celo Sepolia
contract; this backend does not write governance votes, create proposals, or
execute outcomes. Public proposal presentation reconciles the
indexer-owned `governance_proposals` and confirmed `blockchain_transactions`
with contract reads.

## Readiness probe
`GET /api/v1/health` performs a read-only `id` query against `profiles` using
the server-side service-role client. No `system_health` table is required, and
this repository contains no migration for one. The canonical Supabase schema
must still be applied so the core `profiles` table exists and is readable by
the service role.

## Canonical reforestation contract
The canonical `reforestation_contributions` rows reference
`blockchain_transactions` through `blockchain_transaction_id` and identify the
wallet with `contributor_wallet_address`; the transaction hash and confirmation
state come from the indexer-owned transaction row. The canonical
`reforestation_evidence` row stores one `storage_path`, `project_id`, and
`submitted_by`, plus verification state. It has no `agent_id`, `storage_paths`,
planting-date, coordinate, or notes columns. Do not reintroduce those fields
without an approved external migration.
