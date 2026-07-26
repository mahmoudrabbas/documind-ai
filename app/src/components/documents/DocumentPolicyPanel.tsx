"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Alert } from "@/components/ui/Alert";
import { Tabs, Tab, TabPanel } from "@/components/ui/Tabs";
import { ClassificationBadge } from "@/components/documents/ClassificationBadge";
import { PolicyEditor } from "@/components/documents/PolicyEditor";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { DOCUMENT_ACCESS_ACTIONS, type ActivePolicy, type EffectiveAccessUser, type PolicyAssignment, type PolicyHistoryItem, type PolicyTaxonomySummary, type PropagationStatus } from "@/types/api/document-policy.types";
import type { DocumentView } from "@/types/api/documents.types";
import type { UserView } from "@/types/api/users.types";
import { listUsers } from "@/services/users.service";
import * as policyApi from "@/services/document-policy.service";

type TabId = "overview" | "active" | "assignments" | "effective" | "history" | "propagation";
const TABS: { id: TabId; label: string; icon?: string }[] = [
  { id: "overview", label: "Overview", icon: "info" },
  { id: "active", label: "Active", icon: "check_circle" },
  { id: "assignments", label: "Assignments", icon: "group" },
  { id: "effective", label: "Effective", icon: "shield" },
  { id: "history", label: "History", icon: "history" },
  { id: "propagation", label: "Propagation", icon: "sync" },
];

export function DocumentPolicyPanel({ document: doc }: { document: DocumentView }) {
  const permissions = usePermissions();
  const canManage = permissions.can(Permission.DOCUMENTS_MANAGE_ACCESS);
  const [tab, setTab] = useState<TabId>("overview");
  const [active, setActive] = useState<ActivePolicy | null>(null);
  const [taxonomy, setTaxonomy] = useState<PolicyTaxonomySummary | null>(null);
  const [assignments, setAssignments] = useState<PolicyAssignment[]>([]);
  const [history, setHistory] = useState<PolicyHistoryItem[]>([]);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [propagation, setPropagation] = useState<PropagationStatus | null>(null);
  const [users, setUsers] = useState<UserView[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<EffectiveAccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const refreshHistory = useCallback(async (signal?: AbortSignal) => {
    setHistoryLoading(true); setHistoryError(null);
    try {
      const result = await policyApi.getPolicyHistory(doc.id, undefined, signal); if (signal?.aborted) return;
      setHistory(result.data.policies); setHistoryCursor(result.data.nextCursor);
    } catch (cause) { if (!signal?.aborted) setHistoryError(policyApi.classifyPolicyError(cause)); }
    finally { if (!signal?.aborted) setHistoryLoading(false); }
  }, [doc.id]);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null); setHistoryError(null); setActive(null); setTaxonomy(null); setAssignments([]); setHistory([]); setHistoryCursor(null); setPropagation(null); setDecisions([]);
    try {
      const current = await policyApi.getActivePolicy(doc.id, signal); if (signal?.aborted) return;
      setActive(current.data.policy); setTaxonomy(current.data.taxonomy);
      const [assignmentResult, propagationResult] = await Promise.all([
        policyApi.getPolicyAssignments(doc.id, signal), policyApi.getPropagationStatus(doc.id, signal), refreshHistory(signal),
      ]);
      if (signal?.aborted) return;
      setAssignments(assignmentResult.data.assignments); setPropagation(propagationResult.data);
    } catch (cause) { if (!signal?.aborted) setError(policyApi.classifyPolicyError(cause)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [doc.id, refreshHistory]);
  useEffect(() => { const controller = new AbortController(); if (canManage) void refresh(controller.signal); else setLoading(false); return () => controller.abort(); }, [canManage, refresh]);
  useEffect(() => { if (tab !== "effective" || users.length) return; const controller = new AbortController(); void listUsers(1, 100, controller.signal).then((result) => setUsers(result.data.users.filter((user) => user.status === "active"))).catch((cause) => setError(policyApi.classifyPolicyError(cause))); return () => controller.abort(); }, [tab, users.length]);

  async function inspectAccess() { if (!selectedUsers.length) return; setLoading(true); setError(null); try { const result = await policyApi.getEffectiveAccess(doc.id, selectedUsers.slice(0, 100)); setDecisions(result.data.users); } catch (cause) { setError(policyApi.classifyPolicyError(cause)); } finally { setLoading(false); } }
  async function loadMoreHistory() {
    if (!historyCursor || historyLoading) return;
    setHistoryLoading(true); setHistoryError(null);
    try { const result = await policyApi.getPolicyHistory(doc.id, historyCursor); setHistory((current) => [...current, ...result.data.policies]); setHistoryCursor(result.data.nextCursor); }
    catch (cause) { setHistoryError(policyApi.classifyPolicyError(cause)); }
    finally { setHistoryLoading(false); }
  }
  const groups = useMemo(() => assignments.reduce<Partial<Record<PolicyAssignment["subjectType"], PolicyAssignment[]>>>((result, assignment) => {
    (result[assignment.subjectType] ??= []).push(assignment); return result;
  }, {}), [assignments]);

  if (!canManage) return <section className="mt-6 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4"><h4 className="font-bold">Access policy</h4><p className="mt-1 text-body-sm text-on-surface-variant">Policy management controls are hidden because your coarse permissions do not include manage access. This does not describe effective document access.</p></section>;
  return <section className="mt-6 border-t border-outline-variant/30 pt-5" aria-labelledby="access-policy-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 id="access-policy-title" className="text-title-md font-bold">Document access policy</h4><p className="text-body-sm text-on-surface-variant">Only backend effective-access results describe user access.</p></div>{active && <Button size="sm" onClick={() => setEditing(true)}><span className="material-symbols-outlined me-1 text-[16px]" aria-hidden="true">manage_accounts</span>Manage access</Button>}</div>

    <Tabs active={tab} onChange={(id) => setTab(id as TabId)} ariaLabel="Policy sections" className="mt-4"
      panels={<>
        {loading && <div className="mt-4 space-y-3" role="status"><Skeleton className="h-12 w-full rounded-lg" /><Skeleton className="h-12 w-full rounded-lg" /><Skeleton className="h-12 w-full rounded-lg" /></div>}
        {!loading && error && <PolicyLoadError kind={error} retry={() => void refresh()} />}
        {!loading && !error && active && <div className="mt-4">
          <TabPanel id="overview">
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="Sensitivity"><ClassificationBadge level={taxonomy?.classificationLevel ?? doc.classification} /></Info>
              <Info label="Category">{taxonomy?.categoryName ?? "Not assigned"}</Info>
              <Info label="Department">{taxonomy?.departmentName ?? "Not assigned"}</Info>
              <Info label="Owner">{doc.owner ?? "Unavailable"}</Info>
              <Info label="Active policy version">{active.policyVersion}</Info>
              <Info label="Propagation">{propagation?.status ?? "Unavailable"}</Info>
            </div>
          </TabPanel>
          <TabPanel id="active">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Policy family"><code title={active.policyId} className="text-body-sm">{active.policyId.slice(0, 8)}…</code></Info>
                <Info label="Version / status">v{active.policyVersion} · {active.status}</Info>
                <Info label="Effective from">{new Date(active.effectiveFrom).toLocaleString()}</Info>
                <Info label="Effective until">{active.effectiveUntil ? new Date(active.effectiveUntil).toLocaleString() : "No expiry"}</Info>
                <Info label="Inheritance">{active.inherits ? `v${active.inherits.policyVersion}` : "None"}</Info>
                <Info label="Reason">{active.provenance.reason ?? "Not provided"}</Info>
              </div>
              <SafeRules rules={active.rules} />
            </div>
          </TabPanel>
          <TabPanel id="assignments">
            {assignments.length === 0 ? (
              <Empty>No explicit assignments.</Empty>
            ) : (
              <div className="space-y-4">
                {Object.entries(groups).map(([subject, rows]) => (
                  <div key={subject}>
                    <h5 className="text-label-md font-semibold capitalize text-on-surface">{subject.replaceAll("_", " ")}</h5>
                    <ul className="mt-2 space-y-2">
                      {rows?.map((assignment, index) => (
                        <li key={`${subject}-${assignment.subjectId ?? index}`} className={`rounded-lg border p-3 ${assignment.effect === "deny" ? "border-error/30 bg-error-container/30" : "border-outline-variant/30 bg-surface-container-low"}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-body-sm">{assignment.stale ? "Stale reference" : assignment.displayLabel}</strong>
                            <Badge status={assignment.effect === "deny" ? "error" : "success"}>{assignment.effect === "deny" ? "Denied" : "Allowed"}</Badge>
                            {assignment.inherited && <Badge status="info">Inherited</Badge>}
                            {assignment.stale && <Badge status="warning">Unavailable principal</Badge>}
                          </div>
                          <p className="mt-1 text-body-sm text-on-surface-variant">{assignment.actions.join(", ")}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </TabPanel>
          <TabPanel id="effective">
            <div>
              <label className="block text-label-md font-semibold text-on-surface-variant">
                Select up to 100 active users
                <select multiple size={Math.min(8, Math.max(3, users.length))} value={selectedUsers} onChange={(event) => setSelectedUsers(Array.from(event.target.selectedOptions, (option) => option.value).slice(0, 100))} className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                  {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </label>
              <Button className="mt-3" disabled={!selectedUsers.length} onClick={() => void inspectAccess()}>
                <span className="material-symbols-outlined me-1 text-[16px]" aria-hidden="true">shield</span>
                Inspect effective access
              </Button>
              {!decisions.length ? (
                <Empty>No effective-access results selected.</Empty>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-xl border border-outline-variant/30">
                  <table className="min-w-[1000px] text-body-sm">
                    <thead className="bg-surface-container-low">
                      <tr>
                        <th className="p-3 text-start text-label-md font-semibold">User</th>
                        {DOCUMENT_ACCESS_ACTIONS.map((action) => <th key={action} className="p-3 text-center text-label-sm font-semibold text-on-surface-variant">{action.replaceAll("_", " ")}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {decisions.map((user) => (
                        <tr key={user.userId} className="border-t border-outline-variant/30">
                          <th className="p-3 text-start font-medium">{user.displayName}</th>
                          {DOCUMENT_ACCESS_ACTIONS.map((action) => (
                            <td key={action} className="p-3 text-center">
                              <span className={user.actions[action] ? "text-success" : "text-error"} aria-label={`${action}: ${user.actions[action] ? "allowed" : "denied"}`}>
                                {user.actions[action] ? "✓" : "✕"}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabPanel>
          <TabPanel id="history">
            {historyLoading && history.length === 0 ? (
              <div className="space-y-2" role="status"><Skeleton className="h-12 w-full rounded-lg" /><Skeleton className="h-12 w-full rounded-lg" /></div>
            ) : historyError ? (
              <HistoryLoadError retry={() => void refreshHistory()} />
            ) : history.length === 0 ? (
              <Empty>No policy history.</Empty>
            ) : (
              <div>
                <ol className="space-y-2">
                  {[...history].sort((a, b) => b.policyVersion - a.policyVersion).map((item) => (
                    <li key={`${item.policyId}-${item.policyVersion}`} className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-3">
                      <div className="flex items-center gap-2">
                        <strong className="text-body-sm">Version {item.policyVersion}</strong>
                        {item.policyVersion === active.policyVersion && <Badge status="success">Active</Badge>}
                        <Badge status="neutral">Read only</Badge>
                      </div>
                      <p className="mt-1 text-body-sm text-on-surface-variant">{item.reason ?? "No change reason"} · {new Date(item.createdAt).toLocaleString()}</p>
                    </li>
                  ))}
                </ol>
                {historyCursor && <Button className="mt-3" variant="outline" disabled={historyLoading} onClick={() => void loadMoreHistory()}>{historyLoading ? "Loading…" : "Load older versions"}</Button>}
              </div>
            )}
          </TabPanel>
          <TabPanel id="propagation">
            {propagation && <PropagationView status={propagation} />}
          </TabPanel>
        </div>}
      </>}
    >
      {TABS.map((item) => <Tab key={item.id} id={item.id} icon={item.icon}>{item.label}</Tab>)}
    </Tabs>

    {editing && active && taxonomy && <PolicyEditor documentId={doc.id} active={active} taxonomy={taxonomy} onClose={() => setEditing(false)} onApplied={async () => { setEditing(false); await refresh(); }} />}
  </section>;
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-container-low p-3">
      <dt className="text-label-sm text-on-surface-variant">{label}</dt>
      <dd className="mt-1 font-medium text-on-surface">{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="my-5 rounded-lg bg-surface-container-low p-4 text-center text-body-sm text-on-surface-variant">{children}</p>;
}

function SafeRules({ rules }: { rules: ActivePolicy["rules"] }) {
  return (
    <div>
      <h5 className="text-label-md font-semibold text-on-surface">Rule summaries</h5>
      {rules.length === 0 ? (
        <Empty>No local rules.</Empty>
      ) : (
        <ul className="mt-2 space-y-2">
          {rules.map((rule) => (
            <li key={rule.ruleId} className="flex items-center gap-2 rounded-lg bg-surface-container-low p-3 text-body-sm">
              <Badge status={rule.effect === "deny" ? "error" : "success"}>{rule.effect === "deny" ? "Deny" : "Allow"}</Badge>
              <span className="text-on-surface-variant">{rule.subject.type.replaceAll("_", " ")}</span>
              <span className="text-on-surface-variant">·</span>
              <span>{rule.actions.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PolicyLoadError({ kind, retry }: { kind: string; retry: () => void }) {
  const text = kind === "unavailable" ? "This document or policy is unavailable." : kind === "denied" ? "The backend denied this policy request." : "Policy data could not be loaded safely.";
  return (
    <Alert variant="error" title="Policy load error">
      <p>{text}</p>
      <Button className="mt-3" size="sm" variant="secondary" onClick={retry}>Retry</Button>
    </Alert>
  );
}

function HistoryLoadError({ retry }: { retry: () => void }) {
  return (
    <Alert variant="error" title="History load error">
      <p>Policy history could not be loaded. Other policy data remains available.</p>
      <Button className="mt-3" size="sm" variant="secondary" onClick={retry}>Retry history</Button>
    </Alert>
  );
}

function PropagationView({ status }: { status: PropagationStatus }) {
  const current = status.status === "current" && status.appliedPolicyVersion === status.desiredPolicyVersion;
  const statusBadge = current ? "success" : status.status === "failed" || status.status === "dead_letter" ? "error" : "warning";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge status={statusBadge} icon={current ? "check_circle" : "sync"}>
          {current ? "Current" : status.status.replaceAll("_", " ")}
        </Badge>
        {status.reindexRequired && <Badge status="warning" icon="warning">Reindex required</Badge>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Info label="Desired policy version">{status.desiredPolicyVersion}</Info>
        <Info label="Applied/indexed version">{status.appliedPolicyVersion ?? "Not applied"}</Info>
        <Info label="Attempts">{status.attempts}</Info>
        <Info label="Completed">{status.completedAt ? new Date(status.completedAt).toLocaleString() : "Pending"}</Info>
      </div>
      {status.failureCode && (
        <Alert variant="error">
          <p>Failure code: {status.failureCode}. {status.retryAvailable ? "An authorized backend recovery may be available." : "No retry action is exposed."}</p>
        </Alert>
      )}
      <div className="rounded-lg bg-primary/[0.04] p-3 text-body-sm text-on-surface-variant">
        <span className="material-symbols-outlined me-1 align-middle text-[16px]" aria-hidden="true">info</span>
        Synchronous API access follows the active policy immediately. Propagation status describes derived metadata and indexing; pending or failed propagation does not revert API enforcement.
      </div>
    </div>
  );
}
