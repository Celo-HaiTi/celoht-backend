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
- Never infer verified physical reforestation impact from
  `reforestation_contributions` alone — that inference is exactly what
  `reforestation_evidence` + the admin verification flow exists to prevent.

## Reforestation contribution reads
The reforestation API joins indexer-owned contribution references to
`blockchain_transactions` and includes only rows marked `confirmed`. Wallet
history is scoped to the authenticated profile's wallet. Receipt confirmation
also queries the configured Celo Sepolia RPC and requires the configured
confirmation depth before reconciling the matching project, wallet, and
transaction hash. The API never inserts a contribution or transaction row;
the indexer remains the source of truth.
