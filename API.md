# API.md

Base path: `/api/v1`

`GET /` returns service discovery (`apiBasePath` and `healthPath`); it does not
assert readiness. Use `GET /api/v1/health` to check dependencies.

All responses are `{ "data": ... }` on success or
`{ "error": { "code", "message", "details", "requestId" } }` on failure.
Errors also return the same `requestId` in the `x-request-id` response header.
`limit` defaults to 20 and is capped at 100; `offset` defaults to 0.

## Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/nonce` | none | Issue a sign-in challenge for a wallet address |
| POST | `/auth/verify` | none | Verify a signed challenge; sets session cookie |
| GET | `/auth/session` | session | Return the authenticated wallet and current role |
| POST | `/auth/logout` | none | Clear the session cookie |

## Profile
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/profile` | session | Caller's verified wallet, current role, display name, and avatar URL |
| PATCH | `/profile` | session | Update display name / avatar (never role) |

## Agents
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/agents` | session | Caller's own agent application/status |
| POST | `/agents` | session | Apply to become an agent |
| GET | `/agents/kyc` | session | Caller's own KYC submissions |
| POST | `/agents/kyc` | session | Submit a KYC document reference |
| GET | `/agents/reforestation/evidence` | agent session | Track the caller's own planting report review states |

## Education
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/courses` | none | Published courses |
| GET | `/progress` | session | Caller's own progress |
| POST | `/progress` | session | Upsert lesson completion |
| GET | `/certificates` | session | Caller's own issued certificates |

## Blockchain
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/transactions` | none | Indexed on-chain events (optionally filter by `wallet`) |
| GET | `/reforestation` | none | Published projects, confirmed contribution records, and verified planting reports |
| GET | `/reforestation/evidence` | none | Verified planting reports without private file paths |
| POST | `/reforestation/evidence` | approved agent session | Submit planting date, coordinates, notes, and private storage paths for review |
| GET | `/reforestation/contributions` | session | Caller's indexed contributions whose transactions are confirmed |
| POST | `/reforestation/contributions` | session | Check a Celo Sepolia receipt and match it to the caller's indexed contribution |
| GET | `/governance` | none | Official Celo Sepolia contract proposals, exact results/windows, confirmed activity, and optional wallet vote/fee state |

Governance voting is submitted directly by the connected wallet to the official
contract; the backend never holds a signer or writes votes. See
[GOVERNANCE.md](GOVERNANCE.md) for role restrictions and transaction flow.
The browser interface is served at `/governance`.

## Admin (reviewer/admin only, server-side enforced)
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/admin/users` | admin | Paginated wallet profiles and application roles |
| PATCH | `/admin/users` | admin | Change another profile's application role; audited; self-role changes are denied |
| GET | `/admin/agents` | admin | Paginated agent application review queue |
| GET | `/admin/kyc` | reviewer, admin | Pending KYC queue with five-minute signed private document links |
| POST | `/admin/kyc` | reviewer, admin | Approve/reject a KYC submission |
| POST | `/admin/agents` | admin | Approve/suspend/reject an agent |
| GET | `/admin/evidence` | reviewer, admin | Pending planting reports with short-lived private file links |
| POST | `/admin/evidence` | reviewer, admin | Verify/reject a pending planting report |
| GET | `/admin/courses` | admin | Paginated course management records |
| POST | `/admin/courses` | admin | Create a course as draft by default |
| PATCH | `/admin/courses` | admin | Edit course content or publication status |
| GET | `/admin/projects` | admin | Paginated reforestation project management records |
| POST | `/admin/projects` | admin | Create a project as draft by default |
| PATCH | `/admin/projects` | admin | Edit project content or publication status |
| GET | `/admin/audit-logs` | admin | Read audit trail (no write endpoint exists) |

The `/profile` interface composes authenticated profile, learning progress,
agent status, confirmed contributions, wallet activity, and governance data.
Its notification feed is derived from these real records; category preferences
and the selected language are stored per wallet in that browser. It does not
claim push delivery or cross-device preference synchronization.
`/admin` provides the protected administrative console. Governance and
operational status are read-only views there.

## Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | 200 only if config, Supabase, Celo Sepolia RPC, and production rate-limit store are healthy; otherwise 503 |

The backend reads indexer-owned blockchain tables but never writes them. It
does not expose transaction-signing or treasury private-key operations.
See [REFORESTATION.md](REFORESTATION.md) for the pilot flow and required
Supabase storage/database setup.
