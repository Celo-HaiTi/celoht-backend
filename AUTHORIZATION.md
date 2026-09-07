# AUTHORIZATION.md

Authorization is enforced **server-side**, in `src/lib/auth/authorization.ts`:

- `requireActor(req)` resolves the session cookie, verifies its HMAC
  signature, and then re-reads `profiles.role` fresh from the database —
  the role is never taken from the session token's own payload, from a
  header, or from `localStorage`/client state.
- `requireRole(actor, roles)` throws a 403 (`AuthError`) if the actor's
  database role isn't in the allowed set.

Every `/api/v1/admin/*` route calls both, in that order, before touching
any data. There is no separate "is admin" flag stored anywhere the client
can influence (e.g. no user-editable metadata is ever read as authorization,
per project policy).

## Role transitions
Only `/api/v1/admin/agents` (admin-only) and direct `profiles` updates by an
admin can change a role or an agent's status. `PATCH /api/v1/profile`
explicitly excludes `role` from its accepted fields.
