"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PortalApiError, PortalShell, portalRequest, usePortal } from "../portal/PortalShell";
import type { MessageKey } from "../portal/messages";

type ProfileRecord = { displayName: string | null; avatarUrl: string | null; walletAddress: string };
type ProgressRecord = { lesson_id: string; completed: boolean; completed_at: string | null };
type AgentRecord = { off_chain_kyc_status: string; on_chain_registry_status: string | null; updated_at: string | null };
type ContributionRecord = { project_id: string; amount: string; asset_address: string; transaction_hash: string; created_at: string };
type TransactionRecord = { transaction_hash: string; event_name: string; confirmed: boolean; created_at: string };
type EvidenceRecord = { id: string; project_id: string; status: string; trees_verified: number | null; verified_at: string | null };
type GovernanceRecord = { onChainProposalId: string; activity: { eventName: string; transactionHash: string; occurredAt: string; actor: string | null }[] };
type FeedCategory = "authentication" | "transactions" | "progress" | "agentUpdates" | "evidence" | "governance";
type FeedItem = { id: string; category: FeedCategory; title: string; detail: string; occurredAt: string; href?: string };
type NotificationPreferences = Record<FeedCategory, boolean>;
type SectionResult<T> = { value: T | null; unavailable: boolean };

type ProfileSnapshot = {
  profile: ProfileRecord | null;
  progress: ProgressRecord[];
  courses: { id: string; title: string }[];
  agent: AgentRecord | null;
  contributions: ContributionRecord[];
  transactions: TransactionRecord[];
  evidence: EvidenceRecord[];
  governance: GovernanceRecord[];
  unavailable: Record<string, boolean>;
};

const defaultPreferences: NotificationPreferences = {
  authentication: true,
  transactions: true,
  progress: true,
  agentUpdates: true,
  evidence: true,
  governance: true,
};

const categoryKeys: { category: FeedCategory; label: MessageKey }[] = [
  { category: "authentication", label: "authentication" },
  { category: "transactions", label: "transactions" },
  { category: "progress", label: "progress" },
  { category: "agentUpdates", label: "agentUpdates" },
  { category: "evidence", label: "evidence" },
  { category: "governance", label: "governance" },
];

async function section<T>(path: string): Promise<SectionResult<T>> {
  try {
    return { value: await portalRequest<T>(path), unavailable: false };
  } catch (error) {
    if (error instanceof PortalApiError && error.status === 404) return { value: null, unavailable: false };
    return { value: null, unavailable: true };
  }
}

function categoryTitle(category: FeedCategory, t: (key: MessageKey) => string): string {
  return t(category);
}

function formatDate(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const locale = language === "ht" ? "ht-HT" : language === "fr" ? "fr-FR" : language === "es" ? "es-ES" : "en";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function ProfileContent() {
  const { session, sessionLoading, language, lastSignInAt, t } = usePortal();
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadId, setReloadId] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [preferencesFor, setPreferencesFor] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const wallet = encodeURIComponent(session.walletAddress);
    const requests = [
      section<ProfileRecord>("/profile"),
      section<ProgressRecord[]>("/progress"),
      section<{ id: string; title: string }[]>("/courses?limit=100"),
      section<AgentRecord>("/agents"),
      section<ContributionRecord[]>("/reforestation/contributions?limit=100"),
      section<TransactionRecord[]>(`/transactions?wallet=${wallet}&limit=100`),
      session.role === "agent" ? section<EvidenceRecord[]>("/agents/reforestation/evidence") : Promise.resolve({ value: [] as EvidenceRecord[], unavailable: false }),
      section<GovernanceRecord[]>(`/governance?wallet=${wallet}`),
    ] as const;

    void Promise.all(requests).then(([profile, progress, courses, agent, contributions, transactions, evidence, governance]) => {
      if (!active) return;
      const current: ProfileSnapshot = {
        profile: profile.value,
        progress: progress.value ?? [],
        courses: courses.value ?? [],
        agent: agent.value,
        contributions: contributions.value ?? [],
        transactions: transactions.value ?? [],
        evidence: evidence.value ?? [],
        governance: governance.value ?? [],
        unavailable: {
          profile: profile.unavailable,
          progress: progress.unavailable,
          courses: courses.unavailable,
          agent: agent.unavailable,
          contributions: contributions.unavailable,
          transactions: transactions.unavailable,
          evidence: evidence.unavailable,
          governance: governance.unavailable,
        },
      };
      setSnapshot(current);
      setDisplayName(current.profile?.displayName ?? "");
      setAvatarUrl(current.profile?.avatarUrl ?? "");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [session, reloadId]);

  useEffect(() => {
    if (!session) {
      setPreferencesFor(null);
      return;
    }
    const key = `celoht.portal.notifications.${session.walletAddress.toLowerCase()}`;
    const stored = window.localStorage.getItem(key);
    try {
      setPreferences(stored ? { ...defaultPreferences, ...JSON.parse(stored) } : defaultPreferences);
    } catch {
      setPreferences(defaultPreferences);
    }
    setPreferencesFor(key);
  }, [session]);

  useEffect(() => {
    if (preferencesFor) window.localStorage.setItem(preferencesFor, JSON.stringify(preferences));
  }, [preferences, preferencesFor]);

  const activity = useMemo(() => {
    if (!session || !snapshot) return [] as FeedItem[];
    const items: FeedItem[] = [];
    if (lastSignInAt) items.push({ id: `auth-${lastSignInAt}`, category: "authentication", title: t("signInEvent"), detail: session.walletAddress, occurredAt: lastSignInAt });
    for (const transaction of snapshot.transactions) {
      if (!transaction.confirmed) continue;
      items.push({
        id: `tx-${transaction.transaction_hash}`,
        category: "transactions",
        title: transaction.event_name.replaceAll("_", " "),
        detail: transaction.transaction_hash,
        occurredAt: transaction.created_at,
        href: `https://celo-sepolia.blockscout.com/tx/${transaction.transaction_hash}`,
      });
    }
    for (const progress of snapshot.progress) {
      if (!progress.completed || !progress.completed_at) continue;
      items.push({ id: `lesson-${progress.lesson_id}`, category: "progress", title: `${t("completedLessons")} · ${progress.lesson_id}`, detail: "", occurredAt: progress.completed_at });
    }
    if (snapshot.agent?.updated_at) {
      items.push({ id: `agent-${snapshot.agent.updated_at}`, category: "agentUpdates", title: `${t("agentApplication")} · ${snapshot.agent.off_chain_kyc_status.replaceAll("_", " ")}`, detail: "", occurredAt: snapshot.agent.updated_at });
    }
    for (const report of snapshot.evidence) {
      if (report.status === "pending" || !report.verified_at) continue;
      items.push({ id: `evidence-${report.id}`, category: "evidence", title: `${t("evidence")} · ${report.status.replaceAll("_", " ")}`, detail: report.trees_verified === null ? "" : `${t("treesVerified")}: ${report.trees_verified}`, occurredAt: report.verified_at });
    }
    for (const proposal of snapshot.governance) {
      for (const event of proposal.activity) {
        if (event.actor?.toLowerCase() !== session.walletAddress.toLowerCase()) continue;
        items.push({
          id: `gov-${event.transactionHash}`,
          category: "governance",
          title: `${t("governance")} · ${event.eventName.replaceAll("_", " ")}`,
          detail: `Proposal ${proposal.onChainProposalId}`,
          occurredAt: event.occurredAt,
          href: `https://celo-sepolia.blockscout.com/tx/${event.transactionHash}`,
        });
      }
    }
    for (const contribution of snapshot.contributions) {
      items.push({
        id: `contribution-${contribution.transaction_hash}`,
        category: "transactions",
        title: t("contributions"),
        detail: `${contribution.amount} · ${contribution.asset_address}`,
        occurredAt: contribution.created_at,
        href: `https://celo-sepolia.blockscout.com/tx/${contribution.transaction_hash}`,
      });
    }
    return items.filter((item) => !Number.isNaN(new Date(item.occurredAt).getTime())).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  }, [session, snapshot, lastSignInAt, t]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const payload: { displayName?: string; avatarUrl?: string } = {};
      if (displayName.trim()) payload.displayName = displayName.trim();
      if (avatarUrl.trim()) payload.avatarUrl = avatarUrl.trim();
      await portalRequest("/profile", { method: "PATCH", body: JSON.stringify(payload) });
      setSaveMessage(t("saved"));
      setReloadId((current) => current + 1);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : t("failed"));
    } finally {
      setSaving(false);
    }
  }

  if (sessionLoading) return <p className="portal-state" role="status">{t("loading")}</p>;
  if (!session) return <div className="portal-state"><h1>{t("profileTitle")}</h1><p>{t("signInRequired")}</p></div>;

  const visibleNotifications = activity.filter((item) => preferences[item.category]);
  const completedLessons = snapshot?.progress.filter((item) => item.completed).length ?? 0;

  return (
    <div className="portal-page">
      <div className="portal-page-heading">
        <div><p className="portal-eyebrow">CELOHT / ACCOUNT</p><h1>{t("profileTitle")}</h1><p>{t("profileSubtitle")}</p></div>
        <button className="portal-button portal-button-secondary" onClick={() => { setRefreshing(true); setReloadId((current) => current + 1); window.setTimeout(() => setRefreshing(false), 350); }} disabled={loading}>
          {refreshing ? t("refreshing") : t("refresh")}
        </button>
      </div>

      {!snapshot && loading && <p className="portal-state" role="status">{t("loading")}</p>}
      {snapshot && (
        <>
          <div className="portal-profile-grid">
            <section className="portal-section profile-identity" aria-labelledby="identity-title">
              <div className="portal-section-heading"><div><p className="portal-eyebrow">ACCOUNT</p><h2 id="identity-title">{t("verifiedAddress")}</h2></div><span className="portal-role">{session.role}</span></div>
              <code className="wallet-address">{session.walletAddress}</code>
              <form className="profile-form" onSubmit={(event) => void saveProfile(event)}>
                <label>{t("displayName")}<input value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} /></label>
                <label>{t("avatarUrl")}<input type="url" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} /></label>
                <div className="form-actions"><button className="portal-button" type="submit" disabled={saving}>{saving ? t("saving") : t("saveProfile")}</button>{saveMessage && <span role="status">{saveMessage}</span>}</div>
              </form>
            </section>

            <section className="portal-section" aria-labelledby="education-title">
              <div className="portal-section-heading"><div><p className="portal-eyebrow">LEARNING</p><h2 id="education-title">{t("education")}</h2></div><strong className="portal-metric">{completedLessons}</strong></div>
              {snapshot.unavailable.progress ? <p className="portal-muted">{t("unavailable")}</p> : <p className="portal-muted">{t("completedLessons")} · {completedLessons} / {snapshot.progress.length} · {snapshot.courses.length} {t("courses").toLowerCase()}</p>}
              {snapshot.progress.filter((item) => item.completed).length > 0 && <ul className="portal-record-list">{snapshot.progress.filter((item) => item.completed).slice(0, 5).map((item) => <li key={item.lesson_id}><span>{item.lesson_id}</span><time>{item.completed_at ? formatDate(item.completed_at, language) : ""}</time></li>)}</ul>}
            </section>

            <section className="portal-section" aria-labelledby="agent-title">
              <div className="portal-section-heading"><div><p className="portal-eyebrow">FIELD WORK</p><h2 id="agent-title">{t("agentApplication")}</h2></div></div>
              {snapshot.unavailable.agent ? <p className="portal-muted">{t("unavailable")}</p> : snapshot.agent ? <div className="status-record"><strong>{snapshot.agent.off_chain_kyc_status.replaceAll("_", " ")}</strong><span>{snapshot.agent.on_chain_registry_status?.replaceAll("_", " ") ?? ""}</span><time>{snapshot.agent.updated_at ? formatDate(snapshot.agent.updated_at, language) : ""}</time></div> : <p className="portal-muted">{t("noApplication")}</p>}
            </section>

            <section className="portal-section" aria-labelledby="contributions-title">
              <div className="portal-section-heading"><div><p className="portal-eyebrow">CELOHT / IMPACT</p><h2 id="contributions-title">{t("contributions")}</h2></div><strong className="portal-metric">{snapshot.contributions.length}</strong></div>
              {snapshot.unavailable.contributions ? <p className="portal-muted">{t("unavailable")}</p> : snapshot.contributions.length === 0 ? <p className="portal-muted">{t("noRecords")}</p> : <ul className="portal-record-list">{snapshot.contributions.slice(0, 5).map((item) => <li key={item.transaction_hash}><a href={`https://celo-sepolia.blockscout.com/tx/${item.transaction_hash}`} target="_blank" rel="noreferrer">{item.amount} · {item.asset_address.slice(0, 8)}…</a><time>{formatDate(item.created_at, language)}</time></li>)}</ul>}
            </section>
          </div>

          <div className="portal-profile-grid portal-lower-grid">
            <section className="portal-section" aria-labelledby="activity-title">
              <div className="portal-section-heading"><div><p className="portal-eyebrow">VERIFIED RECORDS</p><h2 id="activity-title">{t("activity")}</h2></div><span>{activity.length}</span></div>
              {activity.length === 0 ? <p className="portal-muted">{t("emptyActivity")}</p> : <ol className="portal-activity-list">{activity.slice(0, 30).map((item) => <li key={item.id}><span className="activity-marker" /><div><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</div><time>{formatDate(item.occurredAt, language)}</time>{item.href && <a href={item.href} target="_blank" rel="noreferrer" aria-label={`${item.title}, transaction`}>↗</a>}</li>)}</ol>}
            </section>
            <section className="portal-section" aria-labelledby="notifications-title">
              <div className="portal-section-heading"><div><p className="portal-eyebrow">LOCAL PREFERENCES</p><h2 id="notifications-title">{t("notifications")}</h2></div><span>{visibleNotifications.length}</span></div>
              <fieldset className="notification-preferences">
                <legend>{t("notificationPreferences")}</legend>
                {categoryKeys.map(({ category, label }) => <label key={category}><input type="checkbox" checked={preferences[category]} onChange={(event) => setPreferences((current) => ({ ...current, [category]: event.target.checked }))} /><span>{t(label)}</span></label>)}
              </fieldset>
              {visibleNotifications.length === 0 ? <p className="portal-muted">{t("emptyActivity")}</p> : <ul className="notification-list">{visibleNotifications.slice(0, 8).map((item) => <li key={item.id}><strong>{categoryTitle(item.category, t)}</strong><span>{item.title}</span><time>{formatDate(item.occurredAt, language)}</time></li>)}</ul>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return <PortalShell active="profile"><ProfileContent /></PortalShell>;
}