# KYC.md

## Flow
1. Agent uploads a document to the private `agent-kyc` Supabase Storage
   bucket from the client (using a Supabase client scoped to their own
   session, per that bucket's RLS policy in `celoht-supabase`).
2. Agent calls `POST /api/v1/agents/kyc` with `{ documentType, storagePath }`
   to register the submission; this also flips `agents.off_chain_kyc_status`
   to `kyc_review` on first submission.
3. A reviewer/admin reads `GET /api/v1/admin/kyc` to receive the pending queue
   and short-lived signed URLs for documents in the private `agent-kyc` bucket.
   Paths must be under the matching `{agent_id}/` prefix; signed URLs expire
   after five minutes and raw storage paths are not returned.
4. A reviewer/admin calls `POST /api/v1/admin/kyc` with a decision, which:
   - updates `agent_kyc.status`,
   - updates `agents.off_chain_kyc_status`,
   - writes an audit log entry.

## Document confidentiality
- The backend never returns a public URL for a KYC document. Signed URL
   creation happens server-side after `requireRole(reviewer, admin)` and path
   validation.
