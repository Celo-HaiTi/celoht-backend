# DEPLOYMENT.md

## Prerequisites
- A `celoht-supabase` project with all migrations applied.
- A Celo Sepolia RPC endpoint.
- Values for every variable in `.env.example`.

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
Set all variables from `.env.example` in your hosting platform's secret
manager. `SUPABASE_SERVICE_ROLE_KEY` and `AUTH_SESSION_SECRET` must be
treated as secrets, not build-time public values.

## Health checks
Point your platform's health check at `GET /api/v1/health`. It returns 503
whenever required configuration is missing or the database is unreachable —
treat 503 as "not ready," never as a signal to fall back to cached/fake data.
