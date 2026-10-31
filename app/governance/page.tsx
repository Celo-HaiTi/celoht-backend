"use client";

import { useEffect, useState } from "react";
import {
  createWalletClient,
  custom,
  defineChain,
  formatUnits,
  getAddress,
  parseEventLogs,
  publicActions,
  type Address,
  type Hash,
} from "viem";
import {
  CELOHT_GOVERNANCE_ADDRESS,
  CELO_SEPOLIA_CHAIN_ID,
  CeloHTGovernanceAbi,
  USDmAbi,
} from "@/lib/governance/contract";

type ProposalActivity = {
  eventName: string;
  transactionHash: Hash;
  blockNumber: string;
  occurredAt: string;
  actor: Address | null;
  vote: "for" | "against" | "abstain" | null;
};

type Proposal = {
  id: string;
  onChainProposalId: string;
  title: string | null;
  description: string | null;
  metadataURI: string;
  contentHash: Hash;
  proposer: Address;
  status: "upcoming" | "voting" | "awaiting_finalization" | "finalized";
  indexedStatus: string;
  votingStartsAt: string;
  votingEndsAt: string;
  finalized: boolean;
  votes: { for: string; against: string; abstain: string };
  activity: ProposalActivity[];
  walletVoteState: {
    hasVoted: boolean;
    usdmBalance: string;
    usdmAllowance: string;
    isAuthorizedProposer: boolean;
  } | null;
};

type GovernanceData = {
  contract: {
    chainId: number;
    address: Address;
    usdmAddress: Address;
    usdmDecimals: number;
    participationFee: string;
    treasury: Address;
    votingRequiresRole: false;
    walletIsAuthorizedProposer: boolean | null;
  };
  proposals: Proposal[];
};

type InjectedWallet = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: InjectedWallet;
  }
}

const celoSepolia = defineChain({
  id: CELO_SEPOLIA_CHAIN_ID,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] } },
});

async function fetchGovernance(wallet?: string): Promise<GovernanceData> {
  const query = wallet ? `?wallet=${encodeURIComponent(wallet)}` : "";
  const response = await fetch(`/api/v1/governance${query}`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "Governance data is unavailable.");
  return result.data as GovernanceData;
}

async function loadProposalMetadata(uri: string): Promise<Record<string, unknown>> {
  const resolvedUri = uri.startsWith("ipfs://")
    ? `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`
    : uri;
  const parsedUri = new URL(resolvedUri);
  if (parsedUri.protocol !== "https:" || parsedUri.username || parsedUri.password) {
    throw new Error("Only credential-free HTTPS and IPFS metadata are supported.");
  }
  const response = await fetch(parsedUri, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Proposal metadata could not be loaded.");
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Proposal metadata must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function votePercentage(value: string, total: bigint): number {
  if (total === 0n) return 0;
  return Number((BigInt(value) * 10_000n) / total) / 100;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
}

export default function GovernancePage() {
  const [data, setData] = useState<GovernanceData | null>(null);
  const [wallet, setWallet] = useState<Address | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string; hash?: Hash } | null>(null);

  useEffect(() => {
    let active = true;
    void fetchGovernance().then((result) => {
      if (!active) return;
      setData(result);
      setSelectedId(result.proposals[0]?.id ?? null);
    }).catch((error: unknown) => {
      if (active) setMessage({ kind: "error", text: error instanceof Error ? error.message : "Governance data is unavailable." });
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const selected = data?.proposals.find((proposal) => proposal.id === selectedId) ?? null;
  const totalVotes = selected
    ? BigInt(selected.votes.for) + BigInt(selected.votes.against) + BigInt(selected.votes.abstain)
    : 0n;
  const fee = data ? BigInt(data.contract.participationFee) : 0n;
  const allowance = selected?.walletVoteState ? BigInt(selected.walletVoteState.usdmAllowance) : 0n;
  const balance = selected?.walletVoteState ? BigInt(selected.walletVoteState.usdmBalance) : 0n;

  async function refreshGovernance(address = wallet) {
    try {
      const result = await fetchGovernance(address ?? undefined);
      setData(result);
      setSelectedId((current) => current && result.proposals.some((proposal) => proposal.id === current)
        ? current
        : result.proposals[0]?.id ?? null);
      setMetadata(null);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Governance data is unavailable." });
    }
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setMessage({ kind: "error", text: "No injected wallet was found." });
      return;
    }
    try {
      const client = createWalletClient({ chain: celoSepolia, transport: custom(window.ethereum as never) });
      const [address] = await client.requestAddresses();
      if (!address) throw new Error("The wallet did not return an account.");
      const normalized = getAddress(address);
      setWallet(normalized);
      setMessage({ kind: "info", text: `Connected ${shortAddress(normalized)}.` });
      await refreshGovernance(normalized);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Wallet connection was not completed." });
    }
  }

  async function getWalletClient() {
    if (!window.ethereum || !wallet) throw new Error("Connect a wallet to continue.");
    const client = createWalletClient({
      account: wallet,
      chain: celoSepolia,
      transport: custom(window.ethereum as never),
    }).extend(publicActions);
    const currentChainId = await client.getChainId();
    if (currentChainId !== CELO_SEPOLIA_CHAIN_ID) {
      await client.switchChain({ id: CELO_SEPOLIA_CHAIN_ID });
    }
    return client;
  }

  async function approveFee() {
    if (!data || !wallet) return;
    setWorking(true);
    setMessage(null);
    try {
      const client = await getWalletClient();
      const hash = await client.writeContract({
        account: wallet,
        address: data.contract.usdmAddress,
        abi: USDmAbi,
        functionName: "approve",
        args: [data.contract.address, fee],
      });
      setMessage({ kind: "info", text: "Waiting for USDm approval confirmation.", hash });
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== "success") throw new Error("USDm approval transaction reverted.");
      setMessage({ kind: "success", text: "Exact participation-fee approval confirmed.", hash });
      await refreshGovernance(wallet);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "USDm approval failed." });
    } finally {
      setWorking(false);
    }
  }

  async function castVote(option: 1 | 2 | 3, choice: string) {
    if (!data || !selected || !wallet) return;
    setWorking(true);
    setMessage(null);
    try {
      if (selected.status !== "voting") throw new Error("Voting is not currently open on the contract.");
      if (selected.walletVoteState?.hasVoted) throw new Error("This wallet has already voted on this proposal.");
      if (balance < fee) throw new Error("This wallet does not have enough USDm for the exact participation fee.");
      if (allowance < fee) throw new Error("Approve the exact USDm participation fee before voting.");
      const client = await getWalletClient();
      const hash = await client.writeContract({
        account: wallet,
        address: data.contract.address,
        abi: CeloHTGovernanceAbi,
        functionName: "vote",
        args: [BigInt(selected.onChainProposalId), option],
      });
      setMessage({ kind: "info", text: "Vote submitted. Waiting for the contract receipt.", hash });
      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== "success") throw new Error("Vote transaction reverted.");
      const voteEvents = parseEventLogs({ abi: CeloHTGovernanceAbi, logs: receipt.logs, eventName: "VoteCast" });
      const confirmedEvent = voteEvents.find((event) =>
        event.address.toLowerCase() === data.contract.address.toLowerCase()
        && event.args.proposalId === BigInt(selected.onChainProposalId)
        && event.args.voter.toLowerCase() === wallet.toLowerCase()
        && Number(event.args.option) === option
      );
      if (!confirmedEvent) throw new Error("Receipt did not contain the expected CeloHT Governance VoteCast event.");
      setMessage({ kind: "success", text: `Vote (${choice}) confirmed on Celo Sepolia.`, hash });
      await refreshGovernance(wallet);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Vote could not be confirmed." });
    } finally {
      setWorking(false);
    }
  }

  async function showMetadata(proposal: Proposal) {
    setMetadata(null);
    setMessage({ kind: "info", text: "Loading the proposal's published metadata." });
    try {
      setMetadata(await loadProposalMetadata(proposal.metadataURI));
      setMessage(null);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Proposal metadata could not be loaded." });
    }
  }

  const publishedCount = data?.proposals.length ?? 0;
  const finalizedCount = data?.proposals.filter((proposal) => proposal.finalized).length ?? 0;
  const voteCount = data?.proposals.reduce((sum, proposal) =>
    sum + BigInt(proposal.votes.for) + BigInt(proposal.votes.against) + BigInt(proposal.votes.abstain), 0n) ?? 0n;

  return (
    <main className="governance-page">
      <header className="masthead">
        <a className="wordmark" href="/governance" aria-label="CeloHT Governance home">CELO<span>HT</span></a>
        <div className="masthead-title">
          <span className="eyebrow">Community decisions</span>
          <h1>Governance</h1>
        </div>
        <div className="masthead-actions">
          <span className="network-tag"><i /> Celo Sepolia · 11142220</span>
          <button className="wallet-button" onClick={connectWallet} disabled={loading}>
            {wallet ? shortAddress(wallet) : "Connect wallet"}
          </button>
        </div>
      </header>

      <section className="overview" aria-label="Governance overview">
        <div className="overview-intro">
          <p>One wallet, one vote.</p>
          <span>The Governance Council is the highest ongoing collective decision-making body. Contract-counted outcomes; no token-weighted voting.</span>
        </div>
        <div className="overview-stat"><span>Published proposals</span><strong>{loading ? "—" : publishedCount}</strong></div>
        <div className="overview-stat"><span>Finalized</span><strong>{loading ? "—" : finalizedCount}</strong></div>
        <div className="overview-stat"><span>Recorded votes</span><strong>{loading ? "—" : voteCount.toString()}</strong></div>
      </section>

      {message && (
        <div className={`notice notice-${message.kind}`} role="status">
          <span>{message.text}</span>
          {message.hash && <a href={`https://celo-sepolia.blockscout.com/tx/${message.hash}`} target="_blank" rel="noreferrer">View transaction</a>}
        </div>
      )}

      <div className="workspace">
        <aside className="proposal-index" aria-label="Published proposals">
          <div className="section-heading">
            <h2>Proposals</h2>
            <span>{data ? String(data.proposals.length).padStart(2, "0") : "··"}</span>
          </div>
          {loading && <p className="empty-state">Reading confirmed governance records…</p>}
          {!loading && data?.proposals.length === 0 && (
            <p className="empty-state">No published proposals are indexed yet.</p>
          )}
          <div className="proposal-list">
            {data?.proposals.map((proposal, index) => (
              <button
                className={`proposal-row ${selectedId === proposal.id ? "is-selected" : ""}`}
                key={proposal.id}
                onClick={() => { setSelectedId(proposal.id); setMetadata(null); setMessage(null); }}
                aria-pressed={selectedId === proposal.id}
              >
                <span className="proposal-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="proposal-summary">
                  <strong>{proposal.title || `Proposal ${proposal.onChainProposalId}`}</strong>
                  <small>{new Date(proposal.votingEndsAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</small>
                </span>
                <span className={`status-mark status-${proposal.status}`} aria-label={proposal.status.replaceAll("_", " ")} />
              </button>
            ))}
          </div>
        </aside>

        <section className="proposal-detail" aria-live="polite">
          {!selected && !loading && (
            <div className="no-selection">
              <span className="index-mark">CH / GOV</span>
              <h2>Governance record</h2>
              <p>Published proposals will appear here after the CeloHT Governance indexer confirms them.</p>
            </div>
          )}
          {selected && data && (
            <>
              <div className="detail-topline">
                <span>ON-CHAIN PROPOSAL {selected.onChainProposalId}</span>
                <span className={`status-pill status-pill-${selected.status}`}>{selected.status.replaceAll("_", " ")}</span>
              </div>
              <h2 className="proposal-title">{selected.title || `Proposal ${selected.onChainProposalId}`}</h2>
              {selected.description && selected.description !== selected.metadataURI && (
                <p className="proposal-description">{selected.description}</p>
              )}

              <div className="metadata-line">
                <span>Metadata</span>
                <a href={selected.metadataURI.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${selected.metadataURI.slice(7)}` : selected.metadataURI} target="_blank" rel="noreferrer">{selected.metadataURI}</a>
                <button className="text-button" onClick={() => showMetadata(selected)}>Load details</button>
              </div>
              {metadata && (
                <section className="metadata-panel" aria-label="Proposal metadata">
                  {typeof metadata.title === "string" && <h3>{metadata.title}</h3>}
                  {typeof metadata.description === "string" && <p>{metadata.description}</p>}
                  <pre>{JSON.stringify(metadata, null, 2)}</pre>
                </section>
              )}

              <div className="proposal-facts">
                <div><span>Proposed by</span><a href={`https://celo-sepolia.blockscout.com/address/${selected.proposer}`} target="_blank" rel="noreferrer">{shortAddress(selected.proposer)}</a></div>
                <div><span>Voting opens</span><strong>{formatDate(selected.votingStartsAt)}</strong></div>
                <div><span>Voting closes</span><strong>{formatDate(selected.votingEndsAt)}</strong></div>
                <div><span>Content hash</span><code>{shortAddress(selected.contentHash)}</code></div>
              </div>

              <section className="results-section" aria-labelledby="results-title">
                <div className="section-heading results-heading">
                  <h3 id="results-title">Contract results</h3>
                  <span>{totalVotes.toString()} total</span>
                </div>
                <div className="results-bar" aria-label="Vote distribution">
                  <span className="bar-for" style={{ width: `${votePercentage(selected.votes.for, totalVotes)}%` }} />
                  <span className="bar-against" style={{ width: `${votePercentage(selected.votes.against, totalVotes)}%` }} />
                  <span className="bar-abstain" style={{ width: `${votePercentage(selected.votes.abstain, totalVotes)}%` }} />
                </div>
                <div className="result-counts">
                  <span><i className="dot-for" /> For <b>{selected.votes.for}</b></span>
                  <span><i className="dot-against" /> Against <b>{selected.votes.against}</b></span>
                  <span><i className="dot-abstain" /> Abstain <b>{selected.votes.abstain}</b></span>
                </div>
                {selected.finalized && <p className="advisory-note">Finalized on-chain. This vote is advisory and does not execute a treasury action.</p>}
              </section>

              <section className="vote-section" aria-labelledby="cast-vote-title">
                <div className="section-heading"><h3 id="cast-vote-title">Your ballot</h3><span>{wallet ? shortAddress(wallet) : "WALLET NOT CONNECTED"}</span></div>
                <p className="fee-note">Fixed participation fee: {formatUnits(fee, data.contract.usdmDecimals)} USDm. Paying more never increases voting power.</p>
                {!wallet && <button className="connect-inline" onClick={connectWallet}>Connect wallet to check vote status</button>}
                {wallet && selected.walletVoteState?.hasVoted && <p className="ballot-state">This wallet has already voted on this proposal.</p>}
                {wallet && selected.status === "voting" && !selected.walletVoteState?.hasVoted && balance < fee && (
                  <p className="ballot-state">This wallet needs {formatUnits(fee, data.contract.usdmDecimals)} USDm to vote. The participation fee is fixed and does not increase voting power.</p>
                )}
                {wallet && selected.status === "voting" && !selected.walletVoteState?.hasVoted && balance >= fee && allowance < fee && (
                  <div className="approval-row">
                    <p>Approve exactly {formatUnits(fee, data.contract.usdmDecimals)} USDm for this contract.</p>
                    <button className="action-button" disabled={working} onClick={approveFee}>{working ? "Waiting…" : "Approve exact fee"}</button>
                  </div>
                )}
                {wallet && selected.status === "voting" && !selected.walletVoteState?.hasVoted && balance >= fee && allowance >= fee && (
                  <div className="ballot-buttons">
                    <button onClick={() => castVote(1, "For")} disabled={working}>For</button>
                    <button onClick={() => castVote(2, "Against")} disabled={working}>Against</button>
                    <button onClick={() => castVote(3, "Abstain")} disabled={working}>Abstain</button>
                  </div>
                )}
                {selected.status !== "voting" && <p className="ballot-state">The contract is not accepting votes for this proposal right now.</p>}
              </section>

              <section className="activity-section" aria-labelledby="activity-title">
                <div className="section-heading"><h3 id="activity-title">Governance activity</h3><span>CONFIRMED EVENTS</span></div>
                {selected.activity.length === 0 && <p className="empty-state compact">No confirmed activity events are indexed for this proposal.</p>}
                {selected.activity.length > 0 && (
                  <ol className="activity-list">
                    {selected.activity.map((activity) => (
                      <li key={`${activity.transactionHash}-${activity.eventName}`}>
                        <span className="activity-event">{activity.eventName === "VoteCast" ? `Voted ${activity.vote ?? ""}` : activity.eventName.replace("Proposal", "Proposal ")}</span>
                        <span>{activity.actor ? shortAddress(activity.actor) : "Contract event"}</span>
                        <span>{new Date(activity.occurredAt).toLocaleString("en", { timeZone: "UTC" })} UTC</span>
                        <a href={`https://celo-sepolia.blockscout.com/tx/${activity.transactionHash}`} target="_blank" rel="noreferrer">{shortAddress(activity.transactionHash)}</a>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
        </section>
      </div>

      <footer className="governance-footer">
        <span>Official CeloHT Governance contract · Celo Sepolia only</span>
        <a href={`https://celo-sepolia.blockscout.com/address/${data?.contract.address ?? CELOHT_GOVERNANCE_ADDRESS}`} target="_blank" rel="noreferrer">Contract ↗</a>
        <span>Administrative roles are contract-controlled; voting does not grant proposal or override privileges.</span>
      </footer>
    </main>
  );
}