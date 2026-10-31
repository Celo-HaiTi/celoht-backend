# DEPLOYMENT.md

## Render prerequisites
- A `celoht-supabase` project with all migrations applied, including the
	`system_health` table and the wallet-auth tables.
- A Celo Sepolia RPC endpoint that reports chain ID `11142220`.
- An Upstash Redis REST database for shared production rate limiting.
- The Render Blueprint in `render.yaml` connected to this repository.

## Render environment
The Blueprint sets `NODE_VERSION=20`, `NODE_ENV=production`,
`CELO_CHAIN_ID=11142220`, `CELO_NETWORK=celoSepolia`, and
`CELOHT_ALLOWED_ORIGIN=https://app.celoht.com`. Render supplies `PORT`; do not
set or hard-code it yourself.

Set these values in the Render service's Environment page; do not commit them:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (secret; server-side only)
- `CELO_RPC_URL` (Celo Sepolia only)
- `AUTH_SESSION_SECRET` (random secret, at least 32 characters)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN` (secret)

The remaining `CELO_*` confirmation, polling, timeout, and retry settings have
non-secret defaults in `render.yaml`. The backend rejects missing required
production configuration and does not fall back to mock data.

## Build & run
```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

## Environment
Set the environment above, apply the Blueprint, and deploy. Keep
`SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SESSION_SECRET`, and
`UPSTASH_REDIS_REST_TOKEN` secret and server-only. Never prefix them with
`NEXT_PUBLIC_`.

The wallet frontend must call the backend with `credentials: "include"`.
Production session cookies are `HttpOnly`, `Secure`, and `SameSite=None` for
cross-origin credentialed requests. CORS allows only
`https://app.celoht.com` with credentials.

## Health checks
Render's health check is configured for `GET /api/v1/health`. It returns 200
only after required configuration, read-only Supabase access, the Sepolia RPC
chain ID, and the configured production rate-limit store pass. A 503 includes
safe component names and missing/invalid environment variable names, never
secret values. Confirm the live deployment with `npm run smoke` after setting
the required variables and `BACKEND_URL`.
