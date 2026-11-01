# ENVIRONMENT.md

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | Canonical project `cncplsjsqsxuespnacoa`; Render Blueprint pins the project URL |
| `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY` | yes | Use one publishable/anon key; never substitute a server secret |
| `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` | yes | **Secret.** Server-only, never `NEXT_PUBLIC_*`; the modern alias must use `sb_secret_` |
| `CELO_NETWORK` | yes | Must be `celoSepolia` |
| `CELO_CHAIN_ID` | yes | Must be an officially supported CeloHT chain (currently `11142220`) |
| `CELO_RPC_URL` | yes | `https://forno.celo-sepolia.celo-testnet.org` (Celo Sepolia only) |
| `CELO_CONFIRMATIONS` | no (default 1) | Confirmation depth for indexed state |
| `CELO_BACKFILL_BLOCKS` | no (default 0) | Initial block backfill range |
| `CELO_POLL_INTERVAL_MS` | no (default 10000) | Indexer polling interval |
| `CELO_RPC_RETRIES` | no (default 3) | RPC retry count |
| `CELO_RPC_TIMEOUT_MS` | no (default 5000) | Per-request RPC timeout |
| `AUTH_SESSION_SECRET` | yes | Random secret ≥32 characters with at least 16 distinct characters |
| `AUTH_NONCE_TTL_SECONDS` | no (default 300) | Wallet challenge lifetime |
| `AUTH_SESSION_TTL_SECONDS` | no (default 86400) | Session lifetime |
| `UPSTASH_REDIS_REST_URL` | required in production | Shared Redis REST endpoint for atomic rate limits |
| `UPSTASH_REDIS_REST_TOKEN` | required in production | **Secret.** Shared Redis REST authentication token |
| `CELOHT_ALLOWED_ORIGIN` | required in production | Must be `https://app.celoht.com`; credentialed CORS allowlist |
| `PORT` | supplied by Render | Do not configure manually; `npm start` binds to this port on `0.0.0.0` |

See `docs/SECURITY.md` for how these are validated and why the service
fails closed if any required value is missing.
