"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ClassificationBadge } from "@/components/documents/ClassificationBadge";
import { PolicyEditor } from "@/components/documents/PolicyEditor";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { DOCUMENT_ACCESS_ACTIONS, type ActivePolicy, type EffectiveAccessUser, type PolicyAssignment, type PolicyHistoryItem, type PolicyTaxonomySummary, type PropagationStatus } from "@/types/api/document-policy.types";
import type { DocumentView } from "@/types/api/documents.types";
import type { UserView } from "@/types/api/users.types";
import { listUsers } from "@/services/users.service";
import * as policyApi from "@/services/document-policy.service";

type Tab = "overview" | "active" | "assignments" | "effective" | "history" | "propagation";
const TABS: Tab[] = ["overview", "active", "assignments", "effective", "history", "propagation"];

export function DocumentPolicyPanel({ document: doc }: { document: DocumentView }) {
  const permissions = usePermissions();
  const canManage = permissions.can(Permission.DOCUMENTS_MANAGE_ACCESS);
  const [tab, setTab] = useState<Tab>("overview");
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

  if (!canManage) return <section className="mt-6 rounded-xl border border-outline-variant/30 p-4"><h4 className="font-bold">Access policy</h4><p className="mt-1 text-sm text-on-surface-variant">Policy management controls are hidden because your coarse permissions do not include manage access. This does not describe effective document access.</p></section>;
  return <section className="mt-6 border-t border-outline-variant/30 pt-5" aria-labelledby="access-policy-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 id="access-policy-title" className="text-title-md font-bold">Document access policy</h4><p className="text-xs text-on-surface-variant">Only backend effective-access results describe user access.</p></div>{active && <Button size="sm" onClick={() => setEditing(true)}>Manage access</Button>}</div>
    <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist">{TABS.map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${tab === item ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"}`}>{item[0]?.toUpperCase()}{item.slice(1)}</button>)}</div>
    {loading && <div className="mt-4 space-y-2" role="status"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}
    {!loading && error && <PolicyLoadError kind={error} retry={() => void refresh()} />}
    {!loading && !error && active && <div className="mt-4">
      {tab === "overview" && <div className="grid gap-3 sm:grid-cols-2"><Info label="Sensitivity"><ClassificationBadge level={taxonomy?.classificationLevel ?? doc.classification} /></Info><Info label="Category">{taxonomy?.categoryName ?? "Not assigned"}</Info><Info label="Department">{taxonomy?.departmentName ?? "Not assigned"}</Info><Info label="Owner">{doc.owner ?? "Unavailable"}</Info><Info label="Active policy version">{active.policyVersion}</Info><Info label="Propagation">{propagation?.status ?? "Unavailable"}</Info></div>}
      {tab === "active" && <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Info label="Policy family"><code title={active.policyId}>{active.policyId.slice(0, 8)}…</code></Info><Info label="Version / status">v{active.policyVersion} · {active.status}</Info><Info label="Effective from">{new Date(active.effectiveFrom).toLocaleString()}</Info><Info label="Effective until">{active.effectiveUntil ? new Date(active.effectiveUntil).toLocaleString() : "No expiry"}</Info><Info label="Inheritance">{active.inherits ? `v${active.inherits.policyVersion}` : "None"}</Info><Info label="Reason">{active.provenance.reason ?? "Not provided"}</Info></div><SafeRules rules={active.rules} /></div>}
      {tab === "assignments" && (assignments.length === 0 ? <Empty>No explicit assignments.</Empty> : <div className="space-y-4">{Object.entries(groups).map(([subject, rows]) => <div key={subject}><h5 className="font-bold capitalize">{subject.replaceAll("_", " ")}</h5><ul className="mt-2 space-y-2">{rows?.map((assignment, index) => <li key={`${subject}-${assignment.subjectId ?? index}`} className={`rounded-lg border p-3 text-sm ${assignment.effect === "deny" ? "border-error/30 bg-error-container/40" : "border-outline-variant/30"}`}><div className="flex flex-wrap items-center gap-2"><strong>{assignment.stale ? "Stale reference" : assignment.displayLabel}</strong><Badge status={assignment.effect === "deny" ? "error" : "success"}>{assignment.effect === "deny" ? "Denied" : "Allowed"}</Badge>{assignment.inherited && <Badge status="info">Inherited</Badge>}{assignment.stale && <Badge status="warning">Unavailable principal</Badge>}</div><p className="mt-1 text-on-surface-variant">{assignment.actions.join(", ")}</p></li>)}</ul></div>)}</div>)}
      {tab === "effective" && <div><label className="block text-sm font-semibold">Select up to 100 active users<select multiple size={Math.min(8, Math.max(3, users.length))} value={selectedUsers} onChange={(event) => setSelectedUsers(Array.from(event.target.selectedOptions, (option) => option.value).slice(0, 100))} className="mt-2 w-full rounded-lg border border-outline-variant bg-surface p-2">{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><Button className="mt-3" disabled={!selectedUsers.length} onClick={() => void inspectAccess()}>Inspect effective access</Button>{!decisions.length ? <Empty>No effective-access results selected.</Empty> : <div className="mt-4 overflow-x-auto"><table className="min-w-[1000px] text-xs"><thead><tr><th className="p-2 text-start">User</th>{DOCUMENT_ACCESS_ACTIONS.map((action) => <th key={action} className="p-2 text-center">{action.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{decisions.map((user) => <tr key={user.userId} className="border-t border-outline-variant/30"><th className="p-2 text-start">{user.displayName}</th>{DOCUMENT_ACCESS_ACTIONS.map((action) => <td key={action} className="p-2 text-center"><span aria-label={`${action}: ${user.actions[action] ? "allowed" : "denied"}`}>{user.actions[action] ? "✓ Allowed" : "✕ Denied"}</span></td>)}</tr>)}</tbody></table></div>}</div>}
      {tab === "history" && (historyLoading && history.length === 0 ? <div className="space-y-2" role="status"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : historyError ? <HistoryLoadError retry={() => void refreshHistory()} /> : history.length === 0 ? <Empty>No policy history.</Empty> : <div><ol className="space-y-2">{[...history].sort((a, b) => b.policyVersion - a.policyVersion).map((item) => <li key={`${item.policyId}-${item.policyVersion}`} className="rounded-lg border border-outline-variant/30 p-3"><div className="flex items-center gap-2"><strong>Version {item.policyVersion}</strong>{item.policyVersion === active.policyVersion && <Badge status="success">Active</Badge>}<Badge status="neutral">Read only</Badge></div><p className="mt-1 text-sm text-on-surface-variant">{item.reason ?? "No change reason"} · {new Date(item.createdAt).toLocaleString()}</p></li>)}</ol>{historyCursor && <Button className="mt-3" variant="outline" disabled={historyLoading} onClick={() => void loadMoreHistory()}>{historyLoading ? "Loading…" : "Load older versions"}</Button>}</div>)}
      {tab === "propagation" && propagation && <PropagationView status={propagation} />}
    </div>}
    {editing && active && taxonomy && <PolicyEditor documentId={doc.id} active={active} taxonomy={taxonomy} onClose={() => setEditing(false)} onApplied={async () => { setEditing(false); await refresh(); }} />}
  </section>;
}

function Info({ label, children }: { label: string; children: React.ReactNode }) { return <div className="rounded-lg bg-surface-container-low p-3"><dt className="text-xs font-semibold text-on-surface-variant">{label}</dt><dd className="mt-1 font-medium">{children}</dd></div>; }
function Empty({ children }: { children: React.ReactNode }) { return <p className="my-5 rounded-lg bg-surface-container-low p-4 text-center text-sm text-on-surface-variant">{children}</p>; }
function SafeRules({ rules }: { rules: ActivePolicy["rules"] }) { return <div><h5 className="font-bold">Rule summaries</h5>{rules.length === 0 ? <Empty>No local rules.</Empty> : <ul className="mt-2 space-y-2">{rules.map((rule) => <li key={rule.ruleId} className="rounded-lg bg-surface-container-low p-3 text-sm"><strong>{rule.effect === "deny" ? "Deny" : "Allow"}</strong> · {rule.subject.type.replaceAll("_", " ")} · {rule.actions.join(", ")}</li>)}</ul>}</div>; }
function PolicyLoadError({ kind, retry }: { kind: string; retry: () => void }) { const text = kind === "unavailable" ? "This document or policy is unavailable." : kind === "denied" ? "The backend denied this policy request." : "Policy data could not be loaded safely."; return <div role="alert" className="mt-4 rounded-lg bg-error-container p-4 text-sm"><p>{text}</p><Button className="mt-2" size="sm" variant="outline" onClick={retry}>Retry</Button></div>; }
function HistoryLoadError({ retry }: { retry: () => void }) { return <div role="alert" className="rounded-lg bg-error-container p-4 text-sm"><p>Policy history could not be loaded. Other policy data remains available.</p><Button className="mt-2" size="sm" variant="outline" onClick={retry}>Retry history</Button></div>; }
function PropagationView({ status }: { status: PropagationStatus }) { const current = status.status === "current" && status.appliedPolicyVersion === status.desiredPolicyVersion; return <div className="space-y-3"><div className="flex gap-2"><Badge status={current ? "success" : status.status === "failed" || status.status === "dead_letter" ? "error" : "warning"}>{current ? "Current" : status.status.replaceAll("_", " ")}</Badge>{status.reindexRequired && <Badge status="warning">Reindex required</Badge>}</div><div className="grid gap-3 sm:grid-cols-2"><Info label="Desired policy version">{status.desiredPolicyVersion}</Info><Info label="Applied/indexed version">{status.appliedPolicyVersion ?? "Not applied"}</Info><Info label="Attempts">{status.attempts}</Info><Info label="Completed">{status.completedAt ? new Date(status.completedAt).toLocaleString() : "Pending"}</Info></div>{status.failureCode && <p role="alert" className="rounded-lg bg-error-container p-3">Failure code: {status.failureCode}. {status.retryAvailable ? "An authorized backend recovery may be available." : "No retry action is exposed."}</p>}<p className="rounded-lg bg-primary/5 p-3 text-sm">Synchronous API access follows the active policy immediately. Propagation status describes derived metadata and indexing; pending or failed propagation does not revert API enforcement.</p></div>; }
