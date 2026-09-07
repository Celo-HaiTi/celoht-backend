# Troubleshooting

## Health returns 503

Check `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CELO_CHAIN_ID`,
`CELO_RPC_URL`, and `AUTH_SESSION_SECRET`. Then check Supabase connectivity and
the `system_health` table. The service intentionally does not return mock data
when a dependency is unavailable.

## Wallet verification fails

Request a fresh nonce and sign the exact `message` returned by `/auth/nonce`.
Challenges expire and can be consumed only once. Confirm the wallet address in
the signed message matches the requested address.

## Blockchain data is empty

The backend reads indexed projections; it does not scan RPC logs per request.
Check the indexer checkpoint, contract deployment metadata, and the chain ID.
Do not insert dashboard data directly into indexer-owned tables.

## Admin request returns 403

Roles are loaded from the server-side profile record on every request. A wallet
address or client-supplied role is not administrative proof. Assign the role
through the reviewed Supabase authorization workflow and sign in again.