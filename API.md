# API.md

Base path: `/api/v1`

All responses are `{ "data": ... }` on success or
`{ "error": { "code", "message", "details" } }` on failure.

## Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/nonce` | none | Issue a sign-in challenge for a wallet address |
| POST | `/auth/verify` | none | Verify a signed challenge; sets session cookie |
| POST | `/auth/logout` | session | Clears the session cookie |

## Profile
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/profile` | session | Caller's own profile |
| PATCH | `/profile` | session | Update display name / avatar (never role) |

## Agents
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/agents` | session | Caller's own agent application/status |
| POST | `/agents` | session | Apply to become an agent |
| GET | `/agents/kyc` | session | Caller's own KYC submissions |
| POST | `/agents/kyc` | session | Submit a KYC document reference |

## Education
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/courses` | none | Published courses |
| GET | `/progress` | session | Caller's own progress |
| POST | `/progress` | session | Upsert lesson completion |
| GET | `/certificates` | session | Caller's own issued certificates |

## On-chain data (read-only)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/transactions` | none | Indexed on-chain events (optionally filter by `wallet`) |
| GET | `/reforestation` | none | Published projects with contribution + verified-impact counts |
| GET | `/reforestation/evidence` | none | Verified evidence only |
| GET | `/governance` | none | Proposals with 1-wallet-1-vote tallies |

## Admin (reviewer/admin only, server-side enforced)
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/admin/kyc` | reviewer, admin | Pending KYC queue |
| POST | `/admin/kyc` | reviewer, admin | Approve/reject a KYC submission |
| POST | `/admin/agents` | admin | Approve/suspend/reject an agent |
| POST | `/admin/evidence` | reviewer, admin | Verify/reject reforestation evidence |
| GET | `/admin/audit-logs` | admin | Read audit trail (no write endpoint exists) |

## Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | 200 only if config valid and DB reachable; otherwise 503 |
