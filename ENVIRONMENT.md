# ENVIRONMENT.md

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | From Supabase project settings |
| `SUPABASE_ANON_KEY` | yes | Public key; safe for client use where applicable |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Secret.** Server-only, never `NEXT_PUBLIC_*` |
| `CELO_NETWORK` | yes | Must be `celoSepolia` |
| `CELO_CHAIN_ID` | yes | Must be an officially supported CeloHT chain (currently `11142220`) |
| `CELO_RPC_URL` | yes | Celo Sepolia RPC endpoint |
| `CELO_CONFIRMATIONS` | no (default 1) | Confirmation depth for indexed state |
| `CELO_BACKFILL_BLOCKS` | no (default 0) | Initial block backfill range |
| `CELO_POLL_INTERVAL_MS` | no (default 10000) | Indexer polling interval |
| `CELO_RPC_RETRIES` | no (default 3) | RPC retry count |
| `CELO_RPC_TIMEOUT_MS` | no (default 5000) | Per-request RPC timeout |
| `AUTH_SESSION_SECRET` | yes | ≥32-char random secret for session HMAC signing |
| `AUTH_NONCE_TTL_SECONDS` | no (default 300) | Wallet challenge lifetime |
| `AUTH_SESSION_TTL_SECONDS` | no (default 86400) | Session lifetime |
| `UPSTASH_REDIS_REST_URL` | required in production | Shared Redis REST endpoint for atomic rate limits |
| `UPSTASH_REDIS_REST_TOKEN` | required in production | **Secret.** Shared Redis REST authentication token |

See `docs/SECURITY.md` for how these are validated and why the service
fails closed if any required value is missing.
