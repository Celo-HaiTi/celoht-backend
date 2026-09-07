# ENVIRONMENT.md

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | yes | From Supabase project settings |
| `SUPABASE_ANON_KEY` | yes | Public key; safe for client use where applicable |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Secret.** Server-only, never `NEXT_PUBLIC_*` |
| `CELO_CHAIN_ID` | yes | Must be an officially supported CeloHT chain (currently `11142220`) |
| `CELO_RPC_URL` | yes | Celo Sepolia RPC endpoint |
| `AUTH_SESSION_SECRET` | yes | ≥32-char random secret for session HMAC signing |
| `AUTH_NONCE_TTL_SECONDS` | no (default 300) | Wallet challenge lifetime |
| `AUTH_SESSION_TTL_SECONDS` | no (default 86400) | Session lifetime |

See `docs/SECURITY.md` for how these are validated and why the service
fails closed if any required value is missing.
