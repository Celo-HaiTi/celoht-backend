# CONTRIBUTING.md

## Before opening a PR
```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```
All must pass — CI enforces the same commands.

## Rules specific to this repository
- Never add a value under `NEXT_PUBLIC_*` that is a secret.
- Never write to a table documented as INDEXER OWNED in
  `celoht-supabase/docs/OWNERSHIP.md`.
- Any new sensitive administrative action must call `writeAuditLog()` in the
  same request as its state change.
- Any new route touching Supabase must go through
  `src/lib/supabase/server.ts`, not a hand-rolled client.
- No mock/fake data paths — missing configuration must throw
  `ConfigurationError` and be handled as a 503, not silently defaulted.
