# Troubleshooting

## Health returns 503

Read the response's `error.details` for missing or invalid variable names and
dependency statuses. Check Render logs for `health.configuration_invalid` or
`health.dependency_unavailable`; diagnostics never include secret values.
Production requires valid Supabase credentials, `CELO_CHAIN_ID=11142220`, a
Celo Sepolia `CELO_RPC_URL`, `AUTH_SESSION_SECRET`, both Upstash REST variables,
and `CELOHT_ALLOWED_ORIGIN=https://app.celoht.com`. Confirm that the Supabase
`system_health` table is readable using the service-role key. The health probe
is read-only and the service never returns mock data when a dependency fails.

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