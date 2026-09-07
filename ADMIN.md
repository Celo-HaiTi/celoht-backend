# ADMIN.md

## Reviewer capabilities
- Approve/reject KYC submissions (`POST /api/v1/admin/kyc`)
- Verify/reject reforestation evidence (`POST /api/v1/admin/evidence`)

## Admin-only capabilities
- Everything a reviewer can do, plus:
- Approve/suspend/reject an agent's off-chain status (`POST /api/v1/admin/agents`)
- Read the full audit trail (`GET /api/v1/admin/audit-logs`)
- Change another profile's role (direct table update, service role — not yet
  exposed as its own endpoint in this initial implementation; add one with
  the same `requireRole(actor, ["admin"])` + `writeAuditLog` pattern before
  relying on it in production)

## Audit trail guarantee
Every admin/reviewer decision route calls `writeAuditLog()` in the same
request as the state-changing update, recording actor, action, target, and
relevant metadata. `audit_logs` has no update/delete endpoint anywhere in
this backend, matching the append-only RLS policy in `celoht-supabase`.
