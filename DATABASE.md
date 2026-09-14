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
