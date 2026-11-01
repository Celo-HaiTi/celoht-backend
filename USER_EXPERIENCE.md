# User Experience and Administration

## Profile

Open `/profile` and authenticate by signing the server-issued wallet challenge.
The page displays the verified wallet address and current server-resolved role,
and allows the owner to update the existing display name and avatar fields.
Learning progress, agent status, confirmed reforestation contributions,
wallet-attributed transactions, evidence review states, and governance events
come from the authenticated or public read APIs; missing data is shown as empty
or unavailable, never filled with sample records.

The profile notification feed is assembled from real records:

- Authentication: the successful wallet verification time recorded in this
  browser after `/auth/verify` succeeds.
- Transactions: confirmed indexer records scoped to the verified wallet.
- Education: completed lessons and their recorded completion timestamps.
- Agent application: stored application status and `updated_at`.
- Reforestation: confirmed contributions and reviewed evidence records.
- Governance: indexed confirmed events associated with the verified wallet.

Notification category preferences and the selected language are stored in
browser local storage under a key scoped to the verified wallet. Supported
interface languages are Haitian Creole, English, French, and Spanish. These
settings do not synchronize across browsers or devices. The notification feed
is an in-app record view, not push delivery. The authentication entry is local
to the browser and is not represented as a server-wide login history.

## Administration

Open `/admin` using a wallet session whose current `profiles.role` is `admin`
or `reviewer`. Reviewers can access only KYC and planting-evidence queues;
user management, agent decisions, catalog management, governance, audit, and
health remain admin-only. The API re-resolves that role on every privileged
request; hiding a link in the browser is not treated as authorization. The
console provides:

- User list and audited role changes for another profile. The acting admin
  cannot change their own role through this endpoint.
- Agent application decisions, reviewer KYC decisions, and planting evidence
  decisions using the existing audited server routes.
- Course and project creation, editing, and publication state changes. New
  records default to draft. Mutations are validated and audited.
- Read-only governance monitoring, append-only audit history, and the live
  dependency health endpoint.

No account or Founder identity receives administrative authority by default.
Governance monitoring cannot create proposals, change contract roles, execute
treasury actions, or override the Council. Operational and governance sections
show unavailable states when their real dependencies cannot be read.

KYC and planting evidence files remain in private storage. Reviewer/admin APIs
create short-lived signed URLs after server-side role checks and path checks;
the UI does not expose public object URLs.

## Verification Notes

Unit tests cover profile identity, admin role updates, catalog mutation and
audit behavior, reviewer signed KYC access, and locale completeness. Live
Supabase role/RLS/storage policies, Celo Sepolia, and production health
dependencies still require deployment verification.

The backend now follows the canonical `{project_id}/...` evidence object
prefix. Agent uploads remain unavailable: the canonical storage migration
grants evidence writes only to reviewers/admins, and the DApp has no uploader.
Do not claim the evidence workflow works until a reviewed upload API/policy is
deployed and tested end to end.