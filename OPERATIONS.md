# Operations

## Runtime checks

- `/api/v1/health` is a readiness check: configuration must parse and the
  Supabase health table must be reachable.
- The application process itself is the liveness check. Restart the process if
  liveness fails; do not use the readiness endpoint as a restart signal.
- Every API response includes `x-request-id` on errors. Preserve it when
  escalating failures.

## Required production controls

- Set `SUPABASE_SERVICE_ROLE_KEY` only in the server environment.
- Set `CELOHT_ALLOWED_ORIGIN` to the exact dApp/admin origin. Do not use `*`
  with credentialed cookies.
- Replace the in-memory rate limiter with a shared store before running more
  than one application instance.
- Run the Supabase migrations from `celoht-supabase` before deploying this
  service, including `auth_challenges` from the backend auth migration.
- Confirm the indexer is healthy and advancing its canonical sync state before
  enabling blockchain dashboards.

## Deploy sequence

1. Apply and verify Supabase migrations and private storage policies.
2. Deploy the indexer and confirm canonical tables are receiving events.
3. Configure secrets and the verified Celo Sepolia chain ID.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and
   `npm run audit` in CI.
5. Smoke test nonce, verify, health, one public read, and one forbidden admin
   request.