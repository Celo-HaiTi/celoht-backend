# ADMIN.md

## Reviewer capabilities
- Access the `/admin` review queues only; user management, agent decisions,
  catalog management, audit logs, governance, and health remain admin-only.
- Review KYC submissions and open their five-minute signed document URLs
  (`GET /api/v1/admin/kyc`); approve/reject through `POST /api/v1/admin/kyc`
- Review pending planting reports and access evidence files through expiring
  signed URLs (`GET /api/v1/admin/evidence`)
- Verify/reject reforestation evidence (`POST /api/v1/admin/evidence`)

## Admin-only capabilities
- Everything a reviewer can do, plus:
- Review applications and approve/suspend/reject an agent's off-chain status
  (`GET`/`POST /api/v1/admin/agents`)
- List users and change another profile's role (`GET`/`PATCH /api/v1/admin/users`)
- Create, edit, and publish/draft courses and reforestation projects
  (`GET`/`POST`/`PATCH /api/v1/admin/courses` and `/admin/projects`)
- Read the full audit trail (`GET /api/v1/admin/audit-logs`)
- Monitor the read-only governance endpoint and live operational health from
  `/admin`; neither section adds authority or mutating governance actions.

## Authorization boundary
Every admin page request uses the signed wallet session. Every protected API
re-reads the actor's current role from `profiles.role` and applies
`requireRole()` server-side; frontend navigation is not an authorization
control. Role changes cannot target the acting administrator's own profile.
No wallet or Founder identity receives a role automatically. Admin role
changes, review decisions, and course/project mutations append audit records.

## Audit trail guarantee
Every evidence submission and admin/reviewer decision calls
`writeAuditLog()` in the same request as the state-changing update, recording
actor, action, target, and relevant metadata. `audit_logs` has no
update/delete endpoint anywhere in this backend, matching the append-only RLS
policy in `celoht-supabase`.

## Deployment verification
`celoht-supabase/STORAGE.md` currently documents the reforestation evidence
object prefix as `{project_id}/...`, while the backend workflow and its
validation use `{agents.id}/...`. Verify the deployed storage policies and
upload client agree before enabling that workflow; do not weaken the path
check to work around a policy mismatch.
