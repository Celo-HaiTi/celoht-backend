# CeloHT Agent Network

## Separation of records
- `agents` stores the off-chain application, private application details,
  public directory profile, separate `application_status` and
  `off_chain_kyc_status`, and the indexer's on-chain status mirror.
- `agent_kyc` stores private document references and reviewer decisions.
- `agent_services` stores service offerings and availability.
- `agent_profiles` links the legacy application to verified wallet identities;
  `agent_activity` is read only for that caller and contains only recorded
  activity. Empty activity stays empty.
- `agents.on_chain_registry_status` is indexer-owned. Backend routes never
  write or infer it.

Public directory results are limited to profiles explicitly made public,
applications approved off-chain, and agents whose registry status is
`registered` in the indexer mirror. KYC decisions never approve or reject an
application. Verification status is derived from the latest submitted KYC
record and is verified only when that record has an approved status, reviewer,
and review timestamp. A newer pending or rejected submission supersedes an
older approval. Public responses omit application details, wallet addresses,
KYC paths, and reviewer notes; available services are hidden while verification
is not current.

## Wallet registration
Wallet login authorizes the off-chain application. On-chain registration is a
separate user-wallet transaction. The official `CeloHTAgentRegistry` exposes
`registerAgent()`, which can call `USDM.transferFrom` for the configured fee;
the connected wallet must hold and approve the required USDM. Registry status,
activity, and verification flags are indexer/contract data, never client
claims. The backend does not hold a signing key or submit registry
transactions. `setAgentStatus` and `setAgentVerified` require the contract's
`AGENT_ADMIN_ROLE`; the backend does not attempt those calls.

The contract's `verified` bit reflects an off-chain identity result but is not
itself proof of that review. The API reports `verified` only when the latest
`agent_kyc` record is actually approved by an authorized reviewer.

## API flow
1. Sign in with the connected wallet.
2. `POST /api/v1/agents` submits a strict application and public profile;
   status begins as `pending` and registry status remains `null` until the
   indexer observes the wallet's transaction.
3. Upload KYC material as multipart to `POST /api/v1/agents/kyc`; the backend
   stores it under the private `{agent_id}/...` prefix.
4. Reviewers use `GET /api/v1/admin/agents`, review the separate KYC record,
   and decide KYC with `POST /api/v1/admin/kyc`. Application state remains
   separate; `POST /api/v1/admin/agents` approves/rejects the application and
   requires the latest KYC submission to be approved. Decisions record
   reviewer/time and append audit entries.
5. After approval, indexed registration, and approved KYC, the agent may set
   `directoryPublic: true` with `PATCH /api/v1/agents`.
6. Agents manage offerings with `GET`/`POST /api/v1/agents/services` and
   `PATCH /api/v1/agents/services/{serviceId}`. Public search is available at
   `GET /api/v1/agents/directory`; profiles are at
   `GET /api/v1/agents/directory/{agentId}`.
7. `GET /api/v1/agents/activity` returns only the caller's recorded activity.

Client roles cannot write application, KYC, or service rows directly. The
backend authenticates each mutation and the canonical schema enforces RLS.
Applications, profiles, services, verification results, and activity are
never seeded with fabricated production records.