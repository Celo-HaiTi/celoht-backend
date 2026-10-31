# KYC.md

## Flow
1. Agent sends a multipart file and `documentType` to
   `POST /api/v1/agents/kyc`. The backend authenticates the wallet, validates
   a non-empty PDF/JPEG/PNG up to 10 MB, stores it under the agent's
   `{agent_id}/...` prefix in private `agent-kyc` storage, and registers the
   record. The browser never receives Supabase credentials.
2. A reviewer/admin reads `GET /api/v1/admin/kyc`. Each pending item contains
   a signed document URL valid for five minutes. The backend never returns a
   raw storage path.
3. A reviewer/admin calls `POST /api/v1/admin/kyc` with a decision. This
   updates the KYC record and `agents.off_chain_kyc_status`, and writes an
   audit event. It does not approve or reject the separate agent application.
4. The application is reviewed separately through `GET`/`POST
   /api/v1/admin/agents`; approval requires the latest submitted KYC record to
   have an actual reviewer approval.

Directory verification is derived from the latest submitted KYC record, and
is shown only when that record has an approved status, reviewer, and review
timestamp. Application approval or indexed on-chain registration alone is not
a KYC verification.

## Document confidentiality
- The backend never returns a permanent public URL or raw KYC storage path.
   Reviewer access uses a short-lived URL generated only after the backend
   enforces the reviewer/admin role.
