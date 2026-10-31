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
  It never returns file paths or signed URLs.
- `GET /api/v1/agents/reforestation/evidence` returns only the authenticated
   agent's own reports, including `pending`, `verified`, or `rejected` status;
   private file paths are omitted.
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

1. An agent with the `agent` role and approved `off_chain_kyc_status` uploads
   photographs and supporting documents to the private
   `reforestation-evidence` Supabase Storage bucket.
2. The agent calls `POST /api/v1/reforestation/evidence` with `projectId`, an
   ISO calendar `plantingDate`, `latitude`, `longitude`, optional `notes`, and
   one or more uploaded `storagePaths`.
3. The API requires every object path to start with that agent's
   `<agents.id>/` prefix, checks that the private objects can be signed, and
   creates a `pending` report. The submission is audit logged.
4. A reviewer or admin reads `GET /api/v1/admin/evidence`, which returns the
   pending queue with file URLs expiring after five minutes.
5. The reviewer/admin posts `{ evidenceId, decision, treesVerified? }` to
   `/api/v1/admin/evidence`. Approval requires a positive `treesVerified`
   value. Only a still-pending report can be decided. Both outcomes are
   audit logged and cannot be overwritten through this API.
6. Public endpoints include only `verified` reports. Pending reports remain
   pending, rejected reports remain rejected, and neither contributes to
   verified impact metrics.

## Supabase deployment prerequisites

This backend repository does not contain the canonical Supabase migrations or
Storage policies. Before enabling the routes, deploy and verify the matching
schema and policies in `celoht-supabase`:

- Create `reforestation-evidence` as a **private** bucket. Its upload policy
  must bind the authenticated uploader to an approved agent profile and
   restrict object names to that agent's `<agents.id>/` prefix. Deny object
   updates/overwrites after upload. Do not grant public read access. The
   service role is used only server-side for temporary reviewer URLs.
- Ensure `reforestation_evidence` supports `agent_id`, `project_id`,
  `planting_date`, `latitude`, `longitude`, `notes`, `storage_paths`,
  `trees_verified`, `status`, `verified_by`, and `verified_at`; allow statuses
  `pending`, `verified`, and `rejected`.
- Ensure `reforestation_contributions` exposes `project_id`, `wallet_address`,
  `amount`, `asset_address`, `transaction_hash`, and `created_at`; the
  indexer remains its sole writer.
- Ensure `blockchain_transactions` records the same `transaction_hash` and
  only marks transactions `confirmed` at the deployment's configured
  confirmation depth.

If these external prerequisites are absent or incompatible, the routes fail
closed with a service error; do not replace them with sample projects,
contributions, receipts, or evidence. The API implementation and automated
tests cannot substitute for live Supabase RLS, Storage-policy, RPC, and
contract-deployment verification.
