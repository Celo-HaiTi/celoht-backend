# KYC.md

## Flow
1. Agent uploads a document to the private `agent-kyc` Supabase Storage
   bucket from the client (using a Supabase client scoped to their own
   session, per that bucket's RLS policy in `celoht-supabase`).
2. Agent calls `POST /api/v1/agents/kyc` with `{ documentType, storagePath }`
   to register the submission; this also flips `agents.off_chain_kyc_status`
   to `kyc_review` on first submission.
3. A reviewer/admin calls `POST /api/v1/admin/kyc` with a decision, which:
   - updates `agent_kyc.status`,
   - updates `agents.off_chain_kyc_status`,
   - writes an audit log entry.

## Document confidentiality
- The backend never returns a public URL for a KYC document. Retrieval (not
  yet exposed as a route in this initial implementation) must go through a
  short-lived Supabase signed URL generated server-side after an
  authorization check equivalent to `agent_kyc_select_owner` /
  `agent_kyc_select_reviewer_admin` in `celoht-supabase`.
