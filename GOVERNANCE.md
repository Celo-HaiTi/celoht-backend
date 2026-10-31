# CeloHT Governance Interface

The Governance page is available at `/governance`. It presents published
`governance_proposals` records only after matching each on-chain ID to the
official CeloHT Governance contract on Celo Sepolia (`11142220`). Proposal
windows, status, finalization, and vote totals are read from the contract;
confirmed `ProposalCreated`, `VoteCast`, and `ProposalFinalized` indexer events
supply the activity ledger. Missing records are shown as empty, never seeded.

## Official deployment and authorization

The interface uses the verified deployment in
`Celo-HaiTi/celoht-smart-contracts/deployments/celoSepolia.json`:

- CeloHT Governance: `0x7D384851FAbB912287206556479Dd30c740CAdA5`
- USDm: `0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b`
- Chain ID: `11142220`

The contract's authorization and voting rules are:

- `createProposal` requires the on-chain `PROPOSER_ROLE`. The page does not
  offer proposal creation and does not infer that a connected wallet can
  propose. The API can report `hasRole(PROPOSER_ROLE, wallet)` from live chain
  state.
- `vote` has no role gate in the deployed contract. It requires the voting
  window to be open, that the wallet has not already voted, and that the
  wallet can transfer the contract's exact current USDm participation fee.
  The fee is read from the contract, displayed using the token's on-chain
  decimals, and approved exactly; no unlimited allowance is requested.
- The contract enforces one vote per wallet per proposal. The UI also reads
  `hasVoted` for the connected wallet, but the contract remains authoritative
  when the transaction is submitted.
- Vote outcomes are advisory. A finalized result does not execute a treasury
  action, change a role, or override the Council. The interface does not expose
  treasury, admin, or proposal-creation transactions.

On 2026-10-31, a read-only query to the official Sepolia RPC confirmed the
manifest's deployer/protocol-admin address
`0xAC4F2AE7127150eAf411E7Be774531af9c94Bb66` currently has
`DEFAULT_ADMIN_ROLE`, `GOVERNANCE_ADMIN_ROLE`, `PROPOSER_ROLE`, and
`TREASURY_ADMIN_ROLE`. This is a point-in-time contract observation, not an
identity claim about the Founder. The frontend grants that address no special
presentation or override capability. The contract itself does not encode the
Governance Council as an access-control role; the deployed admin custody and
advisory-only contract boundary must not be presented as proof of collective
Council control. Role custody changes require the separately governed,
reviewed on-chain process.

## Wallet vote flow

1. A visitor connects an injected wallet. The interface requests Celo Sepolia
   before any transaction.
2. The public API returns the contract's fee, voting window, finalization,
   exact results, and—when a wallet address is supplied—`hasVoted`, USDm
   balance/allowance, and proposer-role state.
3. If allowance is insufficient, the visitor may approve only the exact fee
   for the governance contract. The UI waits for the approval receipt.
4. The visitor selects For, Against, or Abstain. The wallet sends the
   transaction directly to the official contract; the backend never holds a
   private key or submits a vote for the user.
5. The UI waits for a successful Sepolia receipt and verifies that it contains
   a `VoteCast` event from the official contract for the selected proposal,
   option, and connected voter before reporting confirmation.

Proposal metadata is identified by the on-chain URI and content hash. The
interface can load JSON metadata from HTTPS or IPFS on user request. It displays
the on-chain content hash but does not claim that arbitrary metadata content
has been cryptographically validated against it; the contract does not define
a content-hash encoding scheme.

## API

`GET /api/v1/governance` returns `{ contract, proposals }`. Add the optional
`wallet=0x...` query parameter to include that address's on-chain vote, USDm,
allowance, and proposer-role state. It rejects malformed wallet addresses and
fails closed if the configured RPC chain or official contract deployment
cannot be verified. No governance mutation route is exposed by this backend.

## Governance principle

The Governance Council is the highest ongoing collective decision-making body.
The contract's one-wallet-one-vote results support collective deliberation but
are advisory only and do not implement a Council quorum or treasury execution
process. The interface does not grant the Founder automatic ownership, veto
rights, Council seats, or overrides; it also does not imply that the current
contract's admin key is the Council. Any binding effect must follow the
separately documented Council and Safe/multisig process.
