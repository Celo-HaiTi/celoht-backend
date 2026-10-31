# INDEXER_INTEGRATION.md

The backend and `celoht-indexer` share one Postgres database but never share
write responsibility for the same tables (`celoht-supabase/docs/OWNERSHIP.md`).

## What the backend reads from indexer-owned tables
`blockchain_transactions`, `agent_transactions`,
`reforestation_contributions`, `governance_proposals`,
`governance_activity`, and `agents.on_chain_registry_status`.

## What the backend must never do
- Never write to `blockchain_transactions`, `agent_transactions`,
  `reforestation_contributions`, `governance_proposals`,
  `governance_activity`, or `indexer_state`.
- Never fabricate a value for `agents.on_chain_registry_status` — it either
  reflects what the indexer wrote, or is `null` ("not yet observed
  on-chain").
- The indexer calls `sync_agent_registry_status_from_events(chain_id)` after
  each registry sync pass. This handles wallets registered before their
  off-chain application exists and clears status when the source event is
  orphaned. The backend never calls this function or writes the mirror.
- Never infer verified physical reforestation impact from
  `reforestation_contributions` alone — that inference is exactly what
  `reforestation_evidence` + the admin verification flow exists to prevent.
