"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PortalShell, portalRequest, usePortal } from "../portal/PortalShell";
import { translateStatus, type MessageKey } from "../portal/messages";

type UserRecord = { id: string; wallet_address: string; role: "user" | "agent" | "reviewer" | "admin"; display_name: string | null };
type AgentRecord = { id: string; profile_id: string; wallet_address: string; application_data: Record<string, unknown>; off_chain_kyc_status: string; on_chain_registry_status: string | null; created_at: string };
type KycRecord = { id: string; agent_id: string; document_type: string; status: string; submitted_at: string; signedUrl: string };
type EvidenceRecord = { id: string; project_id: string; submitted_by: string | null; trees_verified: number | null; status: string; created_at: string; signedUrl: string };
type CourseRecord = { id: string; title: string; description: string | null; status: "draft" | "published"; created_at: string };
type ProjectRecord = { id: string; title: string; description: string | null; location: string | null; status: "draft" | "published"; created_at: string };
type AuditRecord = { id: string; actor_id: string; action: string; target_table: string | null; target_id: string | null; metadata: Record<string, unknown>; created_at: string };
type GovernanceRecord = { onChainProposalId: string; title: string | null; status: string; finalized: boolean; votes: { for: string; against: string; abstain: string }; activity: { eventName: string; transactionHash: string; occurredAt: string }[] };
type HealthRecord = { status: string; dependencies: Record<string, "healthy" | "unavailable">; timestamp: string };
type Results<T> = { value: T | null; error: string | null };

type AdminSnapshot = {
  users: UserRecord[] | null;
  agents: AgentRecord[] | null;
  kyc: KycRecord[] | null;
  evidence: EvidenceRecord[] | null;
  courses: CourseRecord[] | null;
  projects: ProjectRecord[] | null;
  audit: AuditRecord[] | null;
  governance: GovernanceRecord[] | null;
  health: HealthRecord | null;
  errors: Record<string, string | null>;
};

async function safeRequest<T>(path: string): Promise<Results<T>> {
  try {
    return { value: await portalRequest<T>(path), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "Request failed." };
  }
}

function skippedRequest<T>(): Promise<Results<T>> {
  return Promise.resolve({ value: null, error: null });
}

function localDate(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const locale = language === "ht" ? "ht-HT" : language === "fr" ? "fr-FR" : language === "es" ? "es-ES" : "en";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function AdminContent() {
  const { session, sessionLoading, language, t } = usePortal();
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshId, setRefreshId] = useState(0);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [treeCounts, setTreeCounts] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    if (!session || (session.role !== "admin" && session.role !== "reviewer")) return;
    setLoading(true);
    const isAdmin = session.role === "admin";
    const [users, agents, kyc, evidence, courses, projects, audit, governance, health] = await Promise.all([
      isAdmin ? safeRequest<UserRecord[]>("/admin/users?limit=100") : skippedRequest<UserRecord[]>(),
      isAdmin ? safeRequest<AgentRecord[]>("/admin/agents?limit=100") : skippedRequest<AgentRecord[]>(),
      safeRequest<KycRecord[]>("/admin/kyc?limit=100"),
      safeRequest<EvidenceRecord[]>("/admin/evidence?limit=100"),
      isAdmin ? safeRequest<CourseRecord[]>("/admin/courses?limit=100") : skippedRequest<CourseRecord[]>(),
      isAdmin ? safeRequest<ProjectRecord[]>("/admin/projects?limit=100") : skippedRequest<ProjectRecord[]>(),
      isAdmin ? safeRequest<AuditRecord[]>("/admin/audit-logs?limit=100") : skippedRequest<AuditRecord[]>(),
      isAdmin ? safeRequest<GovernanceRecord[]>("/governance") : skippedRequest<GovernanceRecord[]>(),
      isAdmin ? safeRequest<HealthRecord>("/health") : skippedRequest<HealthRecord>(),
    ]);
    setSnapshot({
      users: users.value, agents: agents.value, kyc: kyc.value, evidence: evidence.value,
      courses: courses.value, projects: projects.value, audit: audit.value,
      governance: governance.value, health: health.value,
      errors: { users: users.error, agents: agents.error, kyc: kyc.error, evidence: evidence.error, courses: courses.error, projects: projects.error, audit: audit.error, governance: governance.error, health: health.error },
    });
    setLoading(false);
  }, [session]);

  useEffect(() => { void loadData(); }, [loadData, refreshId]);

  async function mutate(id: string, path: string, method: "POST" | "PATCH", payload: unknown) {
    setWorkingId(id);
    setFeedback(null);
    try {
      await portalRequest(path, { method, body: JSON.stringify(payload) });
      setFeedback(t("decisionSaved"));
      setRefreshId((current) => current + 1);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("failed"));
    } finally {
      setWorkingId(null);
    }
  }

  if (sessionLoading) return <p className="portal-state" role="status">{t("loading")}</p>;
  if (!session) return <div className="portal-state"><h1>{t("adminTitle")}</h1><p>{t("signInRequired")}</p></div>;
  if (session.role !== "admin" && session.role !== "reviewer") return <div className="portal-state"><h1>{t("adminTitle")}</h1><p role="alert">{t("noPermission")}</p></div>;

  const adminNav: [string, MessageKey][] = session.role === "admin" ? [
    ["users", "users"], ["agents", "agents"], ["kyc", "kyc"], ["planting-evidence", "plantingEvidence"],
    ["courses", "courses"], ["projects", "projects"], ["governance", "governanceMonitoring"], ["audit", "auditLogs"], ["operations", "operationalStatus"],
  ] : [["kyc", "kyc"], ["planting-evidence", "plantingEvidence"]];

  function unavailable(key: keyof AdminSnapshot) {
    return snapshot?.errors[key] ? <p className="portal-muted" role="status">{t("unavailable")}</p> : null;
  }

  function saveCourse(event: FormEvent<HTMLFormElement>, course: CourseRecord) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void mutate(course.id, "/admin/courses", "PATCH", {
      courseId: course.id,
      title: String(values.get("title") ?? "").trim(),
      description: String(values.get("description") ?? ""),
      status: String(values.get("status")),
    });
  }

  function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void mutate("new-course", "/admin/courses", "POST", {
      title: String(values.get("title") ?? "").trim(),
      description: String(values.get("description") ?? ""),
    });
    event.currentTarget.reset();
  }

  function saveProject(event: FormEvent<HTMLFormElement>, project: ProjectRecord) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void mutate(project.id, "/admin/projects", "PATCH", {
      projectId: project.id,
      title: String(values.get("title") ?? "").trim(),
      description: String(values.get("description") ?? ""),
      location: String(values.get("location") ?? ""),
      status: String(values.get("status")),
    });
  }

  function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void mutate("new-project", "/admin/projects", "POST", {
      title: String(values.get("title") ?? "").trim(),
      description: String(values.get("description") ?? ""),
      location: String(values.get("location") ?? ""),
    });
    event.currentTarget.reset();
  }

  return (
    <div className="portal-page admin-page">
      <div className="portal-page-heading">
        <div><p className="portal-eyebrow">CELOHT / CONTROL ROOM</p><h1>{t("adminTitle")}</h1><p>{t("adminSubtitle")}</p></div>
        <button className="portal-button portal-button-secondary" onClick={() => setRefreshId((current) => current + 1)} disabled={loading}>{loading ? t("refreshing") : t("refresh")}</button>
      </div>
      {feedback && <p className="admin-feedback" role="status">{feedback}</p>}
      <nav className="admin-section-nav" aria-label={t("adminTitle")}>
        {adminNav.map(([id, label]) => <a key={id} href={`#admin-${id}`}>{t(label)}</a>)}
      </nav>
      {loading && !snapshot && <p className="portal-state" role="status">{t("loading")}</p>}

      {snapshot && (
        <>
          {session.role === "admin" && (
            <>
          <section className="admin-section" id="admin-users" aria-labelledby="admin-users-title">
            <div className="admin-section-heading"><div><p className="portal-eyebrow">IDENTITY</p><h2 id="admin-users-title">{t("allUsers")}</h2></div><span>{snapshot.users?.length ?? "—"}</span></div>
            {unavailable("users")}
            {snapshot.users && snapshot.users.length === 0 && <p className="portal-muted">{t("noAdminRecords")}</p>}
            {snapshot.users && snapshot.users.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("wallet")}</th><th>{t("displayName")}</th><th>{t("role")}</th><th>{t("saveChanges")}</th></tr></thead><tbody>{snapshot.users.map((user) => <tr key={user.id}>
              <td><code>{user.wallet_address}</code></td><td>{user.display_name || "—"}</td>
              <td><select className="admin-select" aria-label={`${t("role")} ${user.wallet_address}`} value={user.role} onChange={(event) => void mutate(user.id, "/admin/users", "PATCH", { profileId: user.id, role: event.target.value })} disabled={workingId === user.id || user.id === session.profileId}>
                <option value="user">user</option><option value="agent">agent</option><option value="reviewer">reviewer</option><option value="admin">admin</option>
              </select></td><td>{user.id === session.profileId ? t("currentAccount") : workingId === user.id ? t("saving") : ""}</td>
            </tr>)}</tbody></table></div>}
          </section>

          <section className="admin-section" id="admin-agents" aria-labelledby="admin-agents-title">
            <div className="admin-section-heading"><div><p className="portal-eyebrow">FIELD WORK</p><h2 id="admin-agents-title">{t("agents")}</h2></div><span>{snapshot.agents?.length ?? "—"}</span></div>
            {unavailable("agents")}
            {snapshot.agents && snapshot.agents.length === 0 && <p className="portal-muted">{t("noAdminRecords")}</p>}
            {snapshot.agents?.map((agent) => <article className="admin-record" key={agent.id}>
              <div><strong>{agent.wallet_address}</strong><span>{translateStatus(language, agent.off_chain_kyc_status)} · {agent.on_chain_registry_status ? translateStatus(language, agent.on_chain_registry_status) : t("unavailable")}</span><small>{JSON.stringify(agent.application_data)}</small></div>
              <div className="admin-action-group">{(["approved", "suspended", "rejected"] as const).map((decision) => <button key={decision} className="admin-action" disabled={workingId === agent.id} onClick={() => void mutate(agent.id, "/admin/agents", "POST", { agentId: agent.id, decision })}>{workingId === agent.id ? t("saving") : decision === "approved" ? t("approve") : decision === "suspended" ? t("suspend") : t("reject")}</button>)}</div>
            </article>)}
          </section>
            </>
          )}

          <section className="admin-section" id="admin-kyc" aria-labelledby="admin-kyc-title">
            <div className="admin-section-heading"><div><p className="portal-eyebrow">IDENTITY REVIEW</p><h2 id="admin-kyc-title">{t("kyc")}</h2></div><span>{snapshot.kyc?.length ?? "—"}</span></div>
            {unavailable("kyc")}
            {snapshot.kyc && snapshot.kyc.length === 0 && <p className="portal-muted">{t("noAdminRecords")}</p>}
            {snapshot.kyc?.map((item) => <article className="admin-record" key={item.id}>
              <div><strong>{item.document_type}</strong><span>{translateStatus(language, item.status)} · {item.agent_id}</span><time>{localDate(item.submitted_at, language)}</time><a className="admin-private-file" href={item.signedUrl} target="_blank" rel="noreferrer">{t("signedFiles")}</a></div>
              <div className="admin-action-group"><button className="admin-action" disabled={workingId === item.id} onClick={() => void mutate(item.id, "/admin/kyc", "POST", { kycId: item.id, decision: "approved" })}>{t("approve")}</button><button className="admin-action admin-action-danger" disabled={workingId === item.id} onClick={() => void mutate(item.id, "/admin/kyc", "POST", { kycId: item.id, decision: "rejected" })}>{t("reject")}</button></div>
            </article>)}
          </section>

          <section className="admin-section" id="admin-planting-evidence" aria-labelledby="admin-evidence-title">
            <div className="admin-section-heading"><div><p className="portal-eyebrow">VERIFICATION</p><h2 id="admin-evidence-title">{t("plantingEvidence")}</h2></div><span>{snapshot.evidence?.length ?? "—"}</span></div>
            {unavailable("evidence")}
            {snapshot.evidence && snapshot.evidence.length === 0 && <p className="portal-muted">{t("noAdminRecords")}</p>}
            {snapshot.evidence?.map((item) => <article className="admin-record admin-evidence" key={item.id}>
              <div><strong>{item.project_id}</strong><span>{localDate(item.created_at, language)} · {item.submitted_by ?? "—"}</span><a className="admin-private-file" href={item.signedUrl} target="_blank" rel="noreferrer">{t("signedFiles")}</a></div>
              <div className="admin-action-group"><label>{t("treesVerified")}<input className="admin-input" type="number" min="1" step="1" value={treeCounts[item.id] ?? ""} onChange={(event) => setTreeCounts((current) => ({ ...current, [item.id]: event.target.value }))} /></label><button className="admin-action" disabled={workingId === item.id || Number(treeCounts[item.id]) < 1} onClick={() => void mutate(item.id, "/admin/evidence", "POST", { evidenceId: item.id, decision: "verified", treesVerified: Number(treeCounts[item.id]) })}>{t("approve")}</button><button className="admin-action admin-action-danger" disabled={workingId === item.id} onClick={() => void mutate(item.id, "/admin/evidence", "POST", { evidenceId: item.id, decision: "rejected" })}>{t("reject")}</button></div>
            </article>)}
          </section>

          {session.role === "admin" && (
            <>
          <section className="admin-section" id="admin-courses" aria-labelledby="admin-courses-title">
            <div className="admin-section-heading"><div><p className="portal-eyebrow">LEARNING</p><h2 id="admin-courses-title">{t("courseDetails")}</h2></div><span>{snapshot.courses?.length ?? "—"}</span></div>
            {unavailable("courses")}
            {snapshot.courses && snapshot.courses.length === 0 && <p className="portal-muted">{t("noAdminRecords")}</p>}
            <form className="admin-create-record" onSubmit={createCourse}>
              <h3>{t("createCourse")}</h3>
              <div className="admin-edit-fields"><label>{t("title")}<input className="admin-input" name="title" maxLength={160} required /></label><label>{t("description")}<textarea className="admin-input" name="description" maxLength={8000} rows={3} /></label><button className="admin-action" type="submit" disabled={workingId === "new-course"}>{workingId === "new-course" ? t("saving") : t("createCourse")}</button></div>
            </form>
            {snapshot.courses?.map((course) => <form className="admin-edit-record" key={course.id} onSubmit={(event) => saveCourse(event, course)}>
              <div className="admin-record-meta"><code>{course.id}</code><span>{course.status === "published" ? t("published") : t("draft")}</span></div>
              <div className="admin-edit-fields"><label>{t("title")}<input className="admin-input" name="title" defaultValue={course.title} maxLength={160} required /></label><label>{t("description")}<textarea className="admin-input" name="description" defaultValue={course.description ?? ""} maxLength={8000} rows={3} /></label><label>{t("status")}<select className="admin-select" name="status" defaultValue={course.status}><option value="draft">{t("draft")}</option><option value="published">{t("published")}</option></select></label><button className="admin-action" type="submit" disabled={workingId === course.id}>{t("saveChanges")}</button></div>
            </form>)}
          </section>

          <section className="admin-section" id="admin-projects" aria-labelledby="admin-projects-title">
            <div className="admin-section-heading"><div><p className="portal-eyebrow">REFORESTATION</p><h2 id="admin-projects-title">{t("projectDetails")}</h2></div><span>{snapshot.projects?.length ?? "—"}</span></div>
            {unavailable("projects")}
            {snapshot.projects && snapshot.projects.length === 0 && <p className="portal-muted">{t("noAdminRecords")}</p>}
            <form className="admin-create-record" onSubmit={createProject}>
              <h3>{t("createProject")}</h3>
              <div className="admin-edit-fields"><label>{t("title")}<input className="admin-input" name="title" maxLength={160} required /></label><label>{t("description")}<textarea className="admin-input" name="description" maxLength={8000} rows={3} /></label><label>{t("location")}<input className="admin-input" name="location" maxLength={200} /></label><button className="admin-action" type="submit" disabled={workingId === "new-project"}>{workingId === "new-project" ? t("saving") : t("createProject")}</button></div>
            </form>
            {snapshot.projects?.map((project) => <form className="admin-edit-record" key={project.id} onSubmit={(event) => saveProject(event, project)}>
              <div className="admin-record-meta"><code>{project.id}</code><span>{project.status === "published" ? t("published") : t("draft")}</span></div>
              <div className="admin-edit-fields"><label>{t("title")}<input className="admin-input" name="title" defaultValue={project.title} maxLength={160} required /></label><label>{t("description")}<textarea className="admin-input" name="description" defaultValue={project.description ?? ""} maxLength={8000} rows={3} /></label><label>{t("location")}<input className="admin-input" name="location" defaultValue={project.location ?? ""} maxLength={200} /></label><label>{t("status")}<select className="admin-select" name="status" defaultValue={project.status}><option value="draft">{t("draft")}</option><option value="published">{t("published")}</option></select></label><button className="admin-action" type="submit" disabled={workingId === project.id}>{t("saveChanges")}</button></div>
            </form>)}
          </section>

          <section className="admin-section" id="admin-governance" aria-labelledby="admin-governance-title">
            <div className="admin-section-heading"><div><p className="portal-eyebrow">CELO SEPOLIA · 11142220</p><h2 id="admin-governance-title">{t("governanceMonitoring")}</h2></div><span>{snapshot.governance?.length ?? "—"}</span></div>
            {unavailable("governance")}
            {snapshot.governance && snapshot.governance.length === 0 && <p className="portal-muted">{t("noAdminRecords")}</p>}
            {snapshot.governance?.map((proposal) => <article className="admin-record" key={proposal.onChainProposalId}><div><strong>{proposal.title || `${t("proposal")} ${proposal.onChainProposalId}`}</strong><span>{translateStatus(language, proposal.status)} · {proposal.finalized ? translateStatus(language, "finalized") : t("open")}</span><small>{t("for")} {proposal.votes.for} · {t("against")} {proposal.votes.against} · {t("abstain")} {proposal.votes.abstain}</small></div><a className="admin-action" href="/governance">{t("open")}</a></article>)}
          </section>

          <section className="admin-section" id="admin-audit" aria-labelledby="admin-audit-title">
            <div className="admin-section-heading"><div><p className="portal-eyebrow">APPEND-ONLY RECORDS</p><h2 id="admin-audit-title">{t("auditLogs")}</h2></div><span>{snapshot.audit?.length ?? "—"}</span></div>
            {unavailable("audit")}
            {snapshot.audit && snapshot.audit.length === 0 && <p className="portal-muted">{t("noAdminRecords")}</p>}
            <ol className="admin-audit-list">{snapshot.audit?.map((item) => <li key={item.id}><time>{localDate(item.created_at, language)}</time><strong>{item.action.replaceAll("_", " ")}</strong><span>{item.actor_id}</span><small>{item.target_table ?? "—"} / {item.target_id ?? "—"}</small><code>{JSON.stringify(item.metadata)}</code></li>)}</ol>
          </section>

          <section className="admin-section" id="admin-operations" aria-labelledby="admin-operations-title">
            <div className="admin-section-heading"><div><p className="portal-eyebrow">LIVE DEPENDENCY CHECK</p><h2 id="admin-operations-title">{t("operationalStatus")}</h2></div><span>{snapshot.health?.status ?? t("unavailable")}</span></div>
            {unavailable("health")}
            {snapshot.health && <div className="admin-dependencies">{Object.entries(snapshot.health.dependencies).map(([name, status]) => <div key={name}><span>{name}</span><strong className={status === "healthy" ? "dependency-healthy" : "dependency-down"}>{status === "healthy" ? t("healthy") : t("needsAttention")}</strong></div>)}<time>{localDate(snapshot.health.timestamp, language)}</time></div>}
          </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminPage() {
  return <PortalShell active="admin"><AdminContent /></PortalShell>;
}