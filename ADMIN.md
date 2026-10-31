# ADMIN.md

## Reviewer capabilities
- Review pending agent applications (`GET /api/v1/admin/agents`)
- Approve/reject agent applications (`POST /api/v1/admin/agents`)
- Approve/reject KYC submissions (`POST /api/v1/admin/kyc`)
- Verify/reject reforestation evidence (`POST /api/v1/admin/evidence`)

## Admin-only capabilities
- Everything a reviewer can do, plus:
- Suspend an agent's off-chain status (`POST /api/v1/admin/agents`)
- List, create, and edit draft education courses, then publish validated course content (`GET`, `POST /api/v1/admin/courses`)
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

Course authors submit a complete localized course document. Haitian Creole
(`ht`) is required for titles, descriptions, objectives, lesson content, quiz
prompts, and answer choices; English (`en`), French (`fr`), and Spanish (`es`)
translations are optional and fall back to Creole. Publishing requires at
least one module, one lesson, and a non-empty quiz for every lesson. Published
courses with enrollment history cannot be rewritten; archive them instead.
Course creation and publication are audited.
