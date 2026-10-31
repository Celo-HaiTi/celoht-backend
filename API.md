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
| GET | `/courses?locale=ht\|en\|fr\|es` | none | Published courses with localized descriptions and learning objectives |
| GET | `/courses/{courseId}?locale=...` | none | Course modules, lessons, localized content, and quiz IDs |
| POST | `/courses/{courseId}/enrollments` | session | Enroll the caller in a published course |
| GET | `/courses/{courseId}/quizzes/{quizId}?locale=...` | session | Quiz questions and choices; answer keys are never returned |
| POST | `/courses/{courseId}/quizzes/{quizId}/submit` | session | Submit choices for server-side scoring and progress updates |
| GET | `/courses/{courseId}/results?locale=...` | session | Caller's quiz-attempt and score history |
| GET | `/progress?locale=...` | session | Caller's enrollment, lesson progress, and course completion history |
| POST | `/progress` | session | Record lesson start; completion is granted only by a passing quiz |
| GET | `/certificates` | session | Caller's verified, enrollment-linked certificates |

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
| GET | `/admin/courses?locale=...` | admin | List draft, published, and archived courses |
| POST | `/admin/courses` | admin | Create or replace a draft course and publish after validation |
| GET | `/admin/audit-logs` | admin | Read audit trail (no write endpoint exists) |

## Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | 200 only if config, Supabase, Celo Sepolia RPC, and production rate-limit store are healthy; otherwise 503 |

The backend reads indexer-owned blockchain tables but never writes them. It
does not expose transaction-signing or treasury private-key operations.
