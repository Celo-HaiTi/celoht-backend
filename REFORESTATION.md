# Reforestation Pilot

Pilot geography: Léogâne, Haiti. Projects are read from registered
`reforestation_projects` rows with `status = published`; this service does not
seed demonstration projects or invent goals. The public `objectives` value is
the registered project `description`, and `location` is returned from the
project record. Register Léogâne project details in the canonical database.

## Public and wallet APIs

- `GET /api/v1/reforestation` returns published project details, confirmed
  indexed contribution references, and verified planting reports as separate
  records. `verifiedTreesPlanted` is the sum of reviewer-entered
  `trees_verified`; no financial amount is converted into trees or other
  environmental impact.
- `GET /api/v1/reforestation/evidence` exposes verified report metadata only.
   It never returns file paths or signed URLs. The canonical table has no
   structured planting date, coordinate, or notes columns.
- `GET /api/v1/agents/reforestation/evidence` returns only the authenticated
   agent's own reports, scoped by `submitted_by`, including `pending`,
   `verified`, or `rejected` status; private file paths are omitted.
- `GET /api/v1/reforestation/contributions` requires a wallet session and
  returns only the caller's indexed contributions whose
  `blockchain_transactions.confirmed` value is true.
- `POST /api/v1/reforestation/contributions` accepts `{ projectId,
  transactionHash }`. It checks the configured RPC chain ID is Celo Sepolia
  (`11142220`), requires a successful receipt with at least
  `CELO_CONFIRMATIONS`, then reconciles the transaction against the indexer's
  confirmed transaction and contribution records for that project and
  authenticated wallet. It returns `202` while receipt/indexer confirmation is
  pending. The backend does not write contribution or transaction records.

The DApp must connect the visitor's wallet and send the contribution directly
through the officially published CeloHT Reforestation contract deployment
metadata and ABI. This backend has no official reforestation deployment
address or ABI configured, so it deliberately does not relay, sign, or guess
contract calls. Never request or transmit a private key to this API.

## Planting evidence workflow

The canonical backend evidence row stores `project_id`, one `storage_path`,
`submitted_by`, and verification state. It cannot persist planting date,
coordinates, notes, or multiple paths. Public routes expose verified counts
and timestamps only.

**Pilot blocker:** `POST /api/v1/reforestation/evidence` returns 503. Canonical
Supabase migration 0007 permits `reforestation-evidence` object writes only to
reviewers/admins, and the DApp repository contains no agent evidence uploader.
The reviewer queue still signs project-prefixed private objects already present
in the canonical table. Do not weaken owner checks or mark evidence as uploaded
to work around this.

There is a separate canonical RLS issue: migration 0021 grants the
`authenticated` role insert access to `project_id`, `storage_path`, and
`submitted_by`, and its policy checks submitter identity and published project
only. It does not require an approved agent or verify that the referenced
private object belongs to that submitter. The backend's 503 does not block
direct Data API inserts. A reviewed Supabase migration must restrict this
policy/grant and bind upload ownership before evidence intake can be enabled.

Migration 0021 defines append-only `reforestation_evidence_reviews` with a
database trigger that updates evidence and writes the audit record. The current
backend decision route still uses a pending-state compare-and-set plus
`audit_logs` directly; this is not equivalent to the canonical review-history
transaction and must be reconciled before claiming the complete review audit
workflow. Its review trigger also needs a concurrency guard to prevent two
simultaneous review inserts from overwriting one pending decision.

## Supabase deployment prerequisites

This backend repository does not contain the canonical Supabase migrations or
Storage policies. Deploy and verify the matching schema and policies in
`celoht-supabase`:

- Keep `reforestation-evidence` **private**. Migration 0007 currently grants
   object writes to reviewer/admin roles only. Any agent upload policy or
   service-issued upload URL requires an explicitly reviewed change in the
   Supabase/DApp repositories.
- The canonical `reforestation_evidence` table stores `project_id`,
   `storage_path`, `submitted_by`, `trees_verified`, `status`, `verified_by`,
   and `verified_at`; it does not store structured planting metadata.
- The canonical `reforestation_contributions` table exposes
   `blockchain_transaction_id`, `project_id`, `contributor_wallet_address`,
   `amount`, and `asset_address`. Join the hash and confirmation state from
   `blockchain_transactions`; the indexer remains the sole writer.
- Ensure `blockchain_transactions` records the same `transaction_hash` and
  only marks transactions `confirmed` at the deployment's configured
  confirmation depth.

If these external prerequisites are absent or incompatible, the routes fail
closed with a service error; do not replace them with sample projects,
contributions, receipts, or evidence. The API implementation and automated
tests cannot substitute for live Supabase RLS, Storage-policy, RPC, and
contract-deployment verification.
