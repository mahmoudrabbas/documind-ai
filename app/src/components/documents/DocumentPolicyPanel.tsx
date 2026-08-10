"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Alert } from "@/components/ui/Alert";
import { Tabs, Tab, TabPanel } from "@/components/ui/Tabs";
import { ClassificationBadge } from "@/components/documents/ClassificationBadge";
import { PolicyEditor } from "@/components/documents/PolicyEditor";
import { codeLabel } from "@/lib/i18n/code-label";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { DOCUMENT_ACCESS_ACTIONS, type ActivePolicy, type EffectiveAccessUser, type PolicyAssignment, type PolicyHistoryItem, type PolicyTaxonomySummary, type PropagationStatus } from "@/types/api/document-policy.types";
import type { DocumentView } from "@/types/api/documents.types";
import type { UserView } from "@/types/api/users.types";
import { listUsers } from "@/services/users.service";
import * as policyApi from "@/services/document-policy.service";

type TabId = "overview" | "active" | "assignments" | "effective" | "history" | "propagation";
const TABS: { id: TabId; icon?: string }[] = [
  { id: "overview", icon: "info" },
  { id: "active", icon: "check_circle" },
  { id: "assignments", icon: "group" },
  { id: "effective", icon: "shield" },
  { id: "history", icon: "history" },
  { id: "propagation", icon: "sync" },
];

export function DocumentPolicyPanel({ document: doc }: { document: DocumentView }) {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
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

  if (!canManage) return <section className="mt-6 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4"><h4 className="font-bold">{t("documents.accessPolicyTitle")}</h4><p className="mt-1 text-body-sm text-on-surface-variant">{t("documents.noAccessManagement")}</p></section>;
  return <section className="mt-6 border-t border-outline-variant/30 pt-5" aria-labelledby="access-policy-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 id="access-policy-title" className="text-title-md font-bold">{t("documents.accessPolicyTitle")}</h4><p className="text-body-sm text-on-surface-variant">{t("documents.accessPolicyNote")}</p></div>{active && <Button size="sm" onClick={() => setEditing(true)}><span className="material-symbols-outlined me-1 text-[16px]" aria-hidden="true">manage_accounts</span>{t("documents.manageAccess")}</Button>}</div>

    <Tabs active={tab} onChange={(id) => setTab(id as TabId)} ariaLabel={t("documents.accessPolicyTitle")} className="mt-4"
      panels={<>
        {loading && <div className="mt-4 space-y-3" role="status"><Skeleton className="h-12 w-full rounded-lg" /><Skeleton className="h-12 w-full rounded-lg" /><Skeleton className="h-12 w-full rounded-lg" /></div>}
        {!loading && error && <PolicyLoadError kind={error} retry={() => void refresh()} />}
        {!loading && !error && active && <div className="mt-4">
          <TabPanel id="overview">
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label={t("documents.sensitivity")}><ClassificationBadge level={taxonomy?.classificationLevel ?? doc.classification} /></Info>
              <Info label={t("documents.category")}>{taxonomy?.categoryName ?? t("documents.notAssigned")}</Info>
              <Info label={t("documents.department")}>{taxonomy?.departmentName ?? t("documents.notAssigned")}</Info>
              <Info label={t("documents.owner")}>{doc.owner ?? t("documents.unavailable")}</Info>
              <Info label={t("documents.activePolicyVersion")}>{active.policyVersion}</Info>
              <Info label={t("documents.propagationLabel")}>{propagation ? codeLabel(t, "documents.propagationStatus", propagation.status) : t("documents.unavailable")}</Info>
            </div>
          </TabPanel>
          <TabPanel id="active">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label={t("documents.policyFamily")}><code title={active.policyId} className="text-body-sm">{active.policyId.slice(0, 8)}…</code></Info>
                <Info label={t("documents.versionStatus")}>v{active.policyVersion} · {active.status}</Info>
                <Info label={t("documents.effectiveFrom")}>{new Date(active.effectiveFrom).toLocaleString(intlLocale)}</Info>
                <Info label={t("documents.effectiveUntil")}>{active.effectiveUntil ? new Date(active.effectiveUntil).toLocaleString(intlLocale) : t("documents.noExpiry")}</Info>
                <Info label={t("documents.inheritance")}>{active.inherits ? `v${active.inherits.policyVersion}` : t("documents.none")}</Info>
                <Info label={t("documents.reason")}>{active.provenance.reason ?? t("documents.notProvided")}</Info>
              </div>
              <SafeRules rules={active.rules} />
            </div>
          </TabPanel>
          <TabPanel id="assignments">
            {assignments.length === 0 ? (
              <Empty>{t("documents.noExplicitAssignments")}</Empty>
            ) : (
              <div className="space-y-4">
                {Object.entries(groups).map(([subject, rows]) => (
                  <div key={subject}>
                    <h5 className="text-label-md font-semibold capitalize text-on-surface">{codeLabel(t, "documents.subjectType", subject)}</h5>
                    <ul className="mt-2 space-y-2">
                      {rows?.map((assignment, index) => (
                        <li key={`${subject}-${assignment.subjectId ?? index}`} className={`rounded-lg border p-3 ${assignment.effect === "deny" ? "border-error/30 bg-error-container/30" : "border-outline-variant/30 bg-surface-container-low"}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-body-sm">{assignment.stale ? t("documents.staleReference") : assignment.displayLabel}</strong>
                            <Badge status={assignment.effect === "deny" ? "error" : "success"} label={assignment.effect === "deny" ? t("documents.denied") : t("documents.allowed")} />
                            {assignment.inherited && <Badge status="info" label={t("documents.inherited")} />}
                            {assignment.stale && <Badge status="warning" label={t("documents.unavailablePrincipal")} />}
                          </div>
                          <p className="mt-1 text-body-sm text-on-surface-variant">
                            {assignment.actions.map((act) => codeLabel(t, "documents.accessAction", act)).join(", ")}
                          </p>
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
                {t("documents.selectActiveUsers")}
                <select multiple size={Math.min(8, Math.max(3, users.length))} value={selectedUsers} onChange={(event) => setSelectedUsers(Array.from(event.target.selectedOptions, (option) => option.value).slice(0, 100))} className="mt-2 w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                  {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </label>
              <Button className="mt-3" disabled={!selectedUsers.length} onClick={() => void inspectAccess()}>
                <span className="material-symbols-outlined me-1 text-[16px]" aria-hidden="true">shield</span>
                {t("documents.inspectEffectiveAccess")}
              </Button>
              {!decisions.length ? (
                <Empty>{t("documents.noEffectiveResults")}</Empty>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-xl border border-outline-variant/30">
                  <table className="min-w-[1000px] text-body-sm">
                    <thead className="bg-surface-container-low">
                      <tr>
                        <th className="p-3 text-start text-label-md font-semibold">{t("documents.user")}</th>
                        {DOCUMENT_ACCESS_ACTIONS.map((action) => <th key={action} className="p-3 text-center text-label-sm font-semibold text-on-surface-variant">{codeLabel(t, "documents.accessAction", action)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {decisions.map((user) => (
                        <tr key={user.userId} className="border-t border-outline-variant/30">
                          <th className="p-3 text-start font-medium">{user.displayName}</th>
                          {DOCUMENT_ACCESS_ACTIONS.map((action) => (
                            <td key={action} className="p-3 text-center">
                              <span className={user.actions[action] ? "text-success" : "text-error"} aria-label={`${codeLabel(t, "documents.accessAction", action)}: ${user.actions[action] ? t("documents.allowed") : t("documents.denied")}`}>
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
              <Empty>{t("documents.noPolicyHistory")}</Empty>
            ) : (
              <div>
                <ol className="space-y-2">
                  {[...history].sort((a, b) => b.policyVersion - a.policyVersion).map((item) => (
                    <li key={`${item.policyId}-${item.policyVersion}`} className="rounded-lg border border-outline-variant/30 bg-surface-container-low p-3">
                      <div className="flex items-center gap-2">
                        <strong className="text-body-sm">{t("documents.versionNumberLabel", { version: String(item.policyVersion) })}</strong>
                        {item.policyVersion === active.policyVersion && <Badge status="success" label={t("documents.statusActive")} />}
                        <Badge status="neutral" label={t("documents.readOnly")} />
                      </div>
                      <p className="mt-1 text-body-sm text-on-surface-variant">{item.reason ?? t("documents.noChangeReason")} · {new Date(item.createdAt).toLocaleString(intlLocale)}</p>
                    </li>
                  ))}
                </ol>
                {historyCursor && <Button className="mt-3" variant="outline" disabled={historyLoading} onClick={() => void loadMoreHistory()}>{historyLoading ? t("common.loading") : t("documents.loadOlderVersions")}</Button>}
              </div>
            )}
          </TabPanel>
          <TabPanel id="propagation">
            {propagation && <PropagationView status={propagation} />}
          </TabPanel>
        </div>}
      </>}
    >
      {TABS.map((item) => <Tab key={item.id} id={item.id} icon={item.icon}>{t(`documents.tab.${item.id}`)}</Tab>)}
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
  const { t } = useI18n();

  return (
    <div>
      <h5 className="text-label-md font-semibold text-on-surface">{t("documents.ruleSummaries")}</h5>
      {rules.length === 0 ? (
        <Empty>{t("documents.noLocalRules")}</Empty>
      ) : (
        <ul className="mt-2 space-y-2">
          {rules.map((rule) => (
            <li key={rule.ruleId} className="flex items-center gap-2 rounded-lg bg-surface-container-low p-3 text-body-sm">
              <Badge status={rule.effect === "deny" ? "error" : "success"} label={rule.effect === "deny" ? t("documents.deny") : t("documents.allow")} />
              <span className="text-on-surface-variant">{codeLabel(t, "documents.subjectType", rule.subject.type)}</span>
              <span className="text-on-surface-variant">·</span>
              <span>{rule.actions.map((act) => codeLabel(t, "documents.accessAction", act)).join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PolicyLoadError({ kind, retry }: { kind: string; retry: () => void }) {
  const { t } = useI18n();
  const text = kind === "unavailable" ? "This document or policy is unavailable." : kind === "denied" ? "The backend denied this policy request." : "Policy data could not be loaded safely.";
  return (
    <Alert variant="error" title={t("documents.policyLoadError")}>
      <p>{text}</p>
      <Button className="mt-3" size="sm" variant="secondary" onClick={retry}>{t("common.retry")}</Button>
    </Alert>
  );
}

function HistoryLoadError({ retry }: { retry: () => void }) {
  const { t } = useI18n();
  return (
    <Alert variant="error" title={t("documents.historyLoadError")}>
      <p>{t("documents.historyLoadErrorText")}</p>
      <Button className="mt-3" size="sm" variant="secondary" onClick={retry}>{t("documents.retryHistory")}</Button>
    </Alert>
  );
}

function PropagationView({ status }: { status: PropagationStatus }) {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();

  const current = status.status === "current" && status.appliedPolicyVersion === status.desiredPolicyVersion;
  const statusBadge = current ? "success" : status.status === "failed" || status.status === "dead_letter" ? "error" : "warning";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge status={statusBadge} icon={current ? "check_circle" : "sync"} label={current ? t("documents.propagationStatus.current") : codeLabel(t, "documents.propagationStatus", status.status)} />
        {status.reindexRequired && <Badge status="warning" icon="warning" label={t("documents.reindexRequired")} />}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Info label={t("documents.desiredPolicyVersion")}>{status.desiredPolicyVersion}</Info>
        <Info label={t("documents.appliedIndexedVersion")}>{status.appliedPolicyVersion ?? t("documents.notApplied")}</Info>
        <Info label={t("documents.attempts")}>{status.attempts}</Info>
        <Info label={t("documents.completedLabel")}>{status.completedAt ? new Date(status.completedAt).toLocaleString(intlLocale) : t("documents.statusPending")}</Info>
      </div>
      {status.failureCode && (
        <Alert variant="error">
          <p>Failure code: {status.failureCode}. {status.retryAvailable ? "An authorized backend recovery may be available." : "No retry action is exposed."}</p>
        </Alert>
      )}
      <div className="rounded-lg bg-primary/[0.04] p-3 text-body-sm text-on-surface-variant">
        <span className="material-symbols-outlined me-1 align-middle text-[16px]" aria-hidden="true">info</span>
        {t("documents.propagationSyncNote")}
      </div>
    </div>
  );
}
