# DATABASE.md (backend perspective)

This repository does not define the schema — that lives in `celoht-supabase`.
This document covers only what's backend-specific.

## Backend-internal table
This backend introduces one table not present in `celoht-supabase`, since it
is purely an authentication implementation detail rather than application
data: `auth_challenges` (nonce storage for wallet sign-in). Add it via a
migration in `celoht-supabase` before deploying, using the schema documented
in `src/lib/auth/nonce.ts`, with RLS fully closed to any non-service-role
access.

## Tables this backend reads/writes
See `celoht-supabase/docs/OWNERSHIP.md` — this backend owns every table
marked BACKEND OWNED and reads (never writes) tables marked INDEXER OWNED.
