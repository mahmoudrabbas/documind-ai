"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui/DashboardPage";
import {
  getKnowledgeGapById,
  assignKnowledgeGap,
  resolveKnowledgeGap,
  dismissKnowledgeGap,
  reopenKnowledgeGap,
  triggerGapReevaluation,
  getGapOccurrences,
  getGapReevaluations,
} from "@/services/knowledge-gaps.service";
import { listDocuments } from "@/services/documents.service";
import { listUsers } from "@/services/users.service";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import type { KnowledgeGap, GapOccurrence, GapReevaluation } from "@/types/api/knowledge-gaps.types";
import type { DocumentView } from "@/types/api/documents.types";
import type { UserView } from "@/types/api/users.types";
import { GapStatusBadge } from "../components/GapStatusBadge";
import { GapSeverityBadge } from "../components/GapSeverityBadge";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

type ActionTab = "resolve" | "test" | "assign" | "dismiss";

export default function KnowledgeGapDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const gapId = resolvedParams.id;
  const { can } = usePermissions();
  const { t, tPlural } = useI18n();
  const intlLocale = useIntlLocale();

  const [gap, setGap] = useState<KnowledgeGap | null>(null);
  const [occurrences, setOccurrences] = useState<GapOccurrence[]>([]);
  const [reevaluations, setReevaluations] = useState<GapReevaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Available documents & users for dropdown pickers
  const [documents, setDocuments] = useState<DocumentView[]>([]);
  const [users, setUsers] = useState<UserView[]>([]);

  // Action state
  const [activeTab, setActiveTab] = useState<ActionTab>("resolve");
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Action forms
  const [assigneeId, setAssigneeId] = useState("");
  const [customAssigneeId, setCustomAssigneeId] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [selectedDocId, setSelectedDocId] = useState("");
  const [customDocId, setCustomDocId] = useState("");
  const [dismissReason, setDismissReason] = useState("");
  const [testDocId, setTestDocId] = useState("");
  const [customTestDocId, setCustomTestDocId] = useState("");

  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [gapRes, occRes, reevalRes] = await Promise.all([
        getKnowledgeGapById(gapId),
        getGapOccurrences(gapId).catch(() => ({ occurrences: [] })),
        getGapReevaluations(gapId).catch(() => ({ reevaluations: [] })),
      ]);

      setGap(gapRes.gap);
      setOccurrences(occRes.occurrences);
      setReevaluations(reevalRes.reevaluations);
      if (gapRes.gap.assigneeId) setAssigneeId(gapRes.gap.assigneeId);
      if (gapRes.gap.resolutionNotes) setResolutionNotes(gapRes.gap.resolutionNotes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("dashboard.gapDetail.loadError"));
    } finally {
      setLoading(false);
    }
  }, [gapId, t]);

  // Load available documents and users for pickers only if permitted
  useEffect(() => {
    fetchDetail();

    if (can(Permission.DOCUMENTS_READ)) {
      listDocuments(1, 50)
        .then((res) => setDocuments(res.data.documents || []))
        .catch(() => setDocuments([]));
    }

    if (can(Permission.USERS_READ)) {
      listUsers(1, 50)
        .then((res) => setUsers(res.data.users || []))
        .catch(() => setUsers([]));
    }
  }, [fetchDetail, can]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalId = customAssigneeId.trim() || assigneeId;
    if (!finalId) return;
    try {
      setActionLoading(true);
      setActionSuccess(null);
      const res = await assignKnowledgeGap(gapId, { assigneeId: finalId });
      setGap(res.gap);
      setActionSuccess(t("dashboard.gapDetail.assignSuccess"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("dashboard.gapDetail.assignError"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionNotes.trim()) return;
    try {
      setActionLoading(true);
      setActionSuccess(null);
      const docId = customDocId.trim() || selectedDocId;
      const res = await resolveKnowledgeGap(gapId, {
        resolutionNotes,
        linkedDocumentIds: docId ? [docId] : [],
      });
      setGap(res.gap);
      setActionSuccess(t("dashboard.gapDetail.resolveSuccess"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("dashboard.gapDetail.resolveError"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDismiss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dismissReason.trim()) return;
    try {
      setActionLoading(true);
      setActionSuccess(null);
      const res = await dismissKnowledgeGap(gapId, { reason: dismissReason });
      setGap(res.gap);
      setActionSuccess(t("dashboard.gapDetail.dismissSuccess"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("dashboard.gapDetail.dismissError"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async () => {
    try {
      setActionLoading(true);
      setActionSuccess(null);
      const res = await reopenKnowledgeGap(gapId);
      setGap(res.gap);
      setActionSuccess(t("dashboard.gapDetail.reopenSuccess"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("dashboard.gapDetail.reopenError"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestReevaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalDocId = customTestDocId.trim() || testDocId;
    if (!finalDocId) return;
    try {
      setActionLoading(true);
      setActionSuccess(null);
      await triggerGapReevaluation(gapId, finalDocId);
      setActionSuccess(t("dashboard.gapDetail.testSuccess"));
      fetchDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("dashboard.gapDetail.testError"));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardPage>
        <DashboardPageHeader eyebrow={t("dashboard.gaps.title")} title={t("dashboard.gapDetail.loadingTitle")} />
        <DashboardPanel>
          <div className="h-64 animate-pulse rounded-2xl bg-surface-container/50" />
        </DashboardPanel>
      </DashboardPage>
    );
  }

  if (error || !gap) {
    return (
      <DashboardPage>
        <DashboardPageHeader eyebrow={t("dashboard.gaps.title")} title={t("dashboard.gapDetail.errorTitle")} />
        <DashboardPanel>
          <div className="rounded-2xl border border-error/20 bg-error/5 p-6 text-center">
            <p className="text-sm font-semibold text-error">{error || t("dashboard.gapDetail.notFound")}</p>
            <Link
              href="/dashboard/knowledge-gaps"
              className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary"
            >
              {t("dashboard.gapDetail.back")}
            </Link>
          </div>
        </DashboardPanel>
      </DashboardPage>
    );
  }

  const assignedUser = users.find((u) => u.id === gap.assigneeId);

  return (
    <DashboardPage>
      <DashboardPageHeader
        eyebrow={
          <Link href="/dashboard/knowledge-gaps" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            <span className="material-symbols-outlined text-[16px] rtl:rotate-180">arrow_back</span>
            {t("dashboard.gapDetail.back")}
          </Link>
        }
        title={gap.topic}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="inline-flex items-center gap-1 rounded-xl border border-outline-variant/30 bg-surface px-2.5 py-1 text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
              title={t("dashboard.gapDetail.devInfoToggleTitle")}
            >
              <span className="material-symbols-outlined text-[14px]">code</span>
              {showTechnicalDetails
                ? t("dashboard.gapDetail.devInfoHide")
                : t("dashboard.gapDetail.devInfoShow")}
            </button>
            {(() => {
              const gapStatus = gap.status;
              return <GapStatusBadge status={gapStatus} />;
            })()}
            <GapSeverityBadge severity={gap.severity} />
          </div>
        }
      />

      {showTechnicalDetails && (
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-3 text-xs font-mono text-on-surface-variant">
          <p><strong>{t("dashboard.gapDetail.clusterKey")}</strong> {gap.clusterKey}</p>
          <p><strong>{t("dashboard.gapDetail.gapId")}</strong> {gap.id}</p>
        </div>
      )}

      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{actionSuccess}</span>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Main Details & Recommendations */}
        <div className="space-y-6 xl:col-span-2">
          {/* Question & Key Metrics Hero */}
          <DashboardPanel>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px] text-primary">help</span>
              <span>{t("dashboard.gapDetail.representativeQuestionLabel")}</span>
            </div>
            <div className="mt-2.5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-base font-semibold text-on-surface">
                &ldquo;{gap.representativeQuestion}&rdquo;
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-6 border-t border-outline-variant/20 pt-4">
              <div>
                <span className="text-on-surface-variant block font-medium">{t("dashboard.gaps.colDepartment")}</span>
                <span className="font-bold text-on-surface">{gap.department || t("dashboard.gaps.departmentGeneral")}</span>
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">{t("dashboard.gapDetail.issueCategory")}</span>
                <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400 capitalize">
                  {gap.sourceMetadata?.category
                    ? codeLabel(t, "dashboard.gapCategory", String(gap.sourceMetadata.category))
                    : occurrences.find((o) => o.category)?.category
                    ? codeLabel(t, "dashboard.gapCategory", String(occurrences.find((o) => o.category)?.category))
                    : t("dashboard.gapCategory.unspecified")}
                </span>
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">{t("dashboard.gaps.colOccurrences")}</span>
                <span className="inline-flex items-center gap-1 font-bold text-primary">
                  <span className="material-symbols-outlined text-[14px]">repeat</span>
                  {gap.occurrenceCount}
                </span>
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">{t("dashboard.gapDetail.firstSeen")}</span>
                <span className="font-bold text-on-surface">{new Date(gap.firstOccurrence).toLocaleDateString(intlLocale)}</span>
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">{t("dashboard.gapDetail.source")}</span>
                <span className="font-bold uppercase text-on-surface">{codeLabel(t, "dashboard.gapSource", gap.source)}</span>
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">{t("dashboard.gapDetail.assignee")}</span>
                <span className="font-bold text-on-surface">
                  {assignedUser
                    ? assignedUser.name
                    : gap.assigneeId
                    ? t("dashboard.gapDetail.assigneeFallback", { id: gap.assigneeId.slice(0, 8) })
                    : t("dashboard.gapDetail.unassigned")}
                </span>
              </div>
            </div>
          </DashboardPanel>

          {/* AI Recommendation Banner */}
          {gap.agentProposal && (
            <DashboardPanel tone="muted">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary">
                  <span className="material-symbols-outlined text-[22px]">auto_awesome</span>
                  <h3 className="text-sm font-bold text-on-surface">{t("dashboard.gapDetail.aiRecommendedAction")}</h3>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="material-symbols-outlined text-[14px]">verified</span>
                  {t("dashboard.gapDetail.confidenceBadge", {
                    percent: String(Math.round(gap.agentProposal.confidence * 100)),
                  })}
                </span>
              </div>

              <div className="mt-3.5 space-y-3 rounded-2xl border border-outline-variant/30 bg-surface p-4 text-xs">
                <div>
                  <span className="font-bold text-on-surface block text-[13px]">
                    {gap.agentProposal.suggestedAction}
                  </span>
                </div>
                {gap.agentProposal.requiredDocumentType && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-on-surface-variant">{t("dashboard.gapDetail.requiredContentType")}</span>
                    <span className="rounded-lg bg-surface-container px-2.5 py-0.5 font-semibold text-on-surface">
                      {gap.agentProposal.requiredDocumentType}
                    </span>
                  </div>
                )}
              </div>
            </DashboardPanel>
          )}

          {/* Resolution Verification History */}
          <DashboardPanel>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-tertiary">science</span>
                {tPlural("dashboard.gapDetail.verificationTests", reevaluations.length)}
              </h3>
            </div>
            {reevaluations.length === 0 ? (
              <p className="mt-2 text-xs text-on-surface-variant">
                {t("dashboard.gapDetail.noVerificationTests")}
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {reevaluations.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-outline-variant/30 bg-surface p-3.5 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold ${
                        r.result === "improved"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                      }`}>
                        <span className="material-symbols-outlined text-[14px]">
                          {r.result === "improved" ? "check_circle" : "cancel"}
                        </span>
                        {r.result === "improved"
                          ? t("dashboard.gapDetail.resultImproved")
                          : t("dashboard.gapDetail.resultNotImproved")}
                      </span>
                      <span className="text-[11px] text-on-surface-variant font-normal">
                        {new Date(r.createdAt).toLocaleDateString(intlLocale)}
                      </span>
                    </div>
                    {r.notes && <p className="mt-2 text-on-surface-variant">{r.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </DashboardPanel>

          {/* Recorded Occurrences Log */}
          <DashboardPanel>
            <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-secondary">forum</span>
              {tPlural("dashboard.gapDetail.recordedOccurrences", occurrences.length)}
            </h3>
            {occurrences.length === 0 ? (
              <p className="mt-2 text-xs text-on-surface-variant">{t("dashboard.gapDetail.noOccurrences")}</p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {occurrences.map((occ) => (
                  <div key={occ.id} className="rounded-2xl border border-outline-variant/30 bg-surface p-3 text-xs">
                    {occ.question ? (
                      <p className="font-semibold text-on-surface">&ldquo;{occ.question}&rdquo;</p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-on-surface-variant">
                      <span className="rounded-md bg-surface-container px-2 py-0.5 font-medium">
                        {t("dashboard.gapDetail.outcomeLabel")}{" "}
                        <strong>{codeLabel(t, "dashboard.gapOutcome", occ.outcome)}</strong>
                      </span>
                      {Boolean(occ.category || gap.sourceMetadata?.category) && (
                        <span className="rounded-md bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-600 dark:text-rose-400 capitalize">
                          {t("dashboard.gapDetail.categoryValue", {
                            value: codeLabel(
                              t,
                              "dashboard.gapCategory",
                              String(occ.category || gap.sourceMetadata?.category),
                            ),
                          })}
                        </span>
                      )}
                      <span>
                        {t("dashboard.gapDetail.confidenceValue", {
                          percent: String(Math.round(occ.confidence * 100)),
                        })}
                      </span>
                      <span>
                        {t("dashboard.gapDetail.dateValue", {
                          date: new Date(occ.createdAt).toLocaleDateString(intlLocale),
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DashboardPanel>
        </div>

        {/* Right Column: Tabbed Action Center */}
        <div className="space-y-6">
          <DashboardPanel>
            <h3 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">touch_app</span>
              {t("dashboard.gapDetail.actionCenter")}
            </h3>

            {/* Action Tabs Navigation */}
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-container-high p-1 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setActiveTab("resolve")}
                className={`rounded-lg py-1.5 transition-colors ${
                  activeTab === "resolve"
                    ? "bg-surface text-primary shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {t("dashboard.gapDetail.tabResolve")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("test")}
                className={`rounded-lg py-1.5 transition-colors ${
                  activeTab === "test"
                    ? "bg-surface text-tertiary shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {t("dashboard.gapDetail.tabVerify")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("assign")}
                className={`rounded-lg py-1.5 transition-colors ${
                  activeTab === "assign"
                    ? "bg-surface text-secondary shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {t("dashboard.gapDetail.tabAssign")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("dismiss")}
                className={`rounded-lg py-1.5 transition-colors ${
                  activeTab === "dismiss"
                    ? "bg-surface text-error shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {t("dashboard.gapDetail.tabDismiss")}
              </button>
            </div>

            {/* Tab 1: Resolve Form */}
            {activeTab === "resolve" && (
              <form onSubmit={handleResolve} className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-on-surface block mb-1" htmlFor="resolution-notes-input">
                    {t("dashboard.gapDetail.resolutionNotesLabel")} <span className="text-error">*</span>
                  </label>
                  <textarea
                    id="resolution-notes-input"
                    rows={3}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder={t("dashboard.gapDetail.resolutionNotesPlaceholder")}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface p-2.5 text-xs text-on-surface focus:border-primary focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="font-semibold text-on-surface block mb-1" htmlFor="doc-select">
                    {t("dashboard.gapDetail.linkDocumentLabel")}
                  </label>
                  <select
                    id="doc-select"
                    value={selectedDocId}
                    onChange={(e) => setSelectedDocId(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-xs text-on-surface focus:border-primary focus:outline-none"
                  >
                    <option value="">{t("dashboard.gapDetail.selectDocumentOption")}</option>
                    {documents.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.metadata?.title || doc.originalFileName || doc.fileName}
                      </option>
                    ))}
                  </select>

                  <details className="mt-1 text-[11px]">
                    <summary className="cursor-pointer text-on-surface-variant hover:underline">
                      {t("dashboard.gapDetail.customDocIdSummary")}
                    </summary>
                    <input
                      type="text"
                      value={customDocId}
                      onChange={(e) => setCustomDocId(e.target.value)}
                      placeholder={t("dashboard.gapDetail.customDocIdPlaceholder")}
                      className="mt-1 w-full rounded-xl border border-outline-variant/40 bg-surface px-2.5 py-1 text-xs focus:outline-none"
                    />
                  </details>
                </div>

                <button
                  type="submit"
                  disabled={actionLoading || gap.status === "resolved"}
                  className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actionLoading
                    ? t("dashboard.gapDetail.saving")
                    : gap.status === "resolved"
                    ? t("dashboard.gapDetail.gapResolved")
                    : t("dashboard.gapDetail.markResolved")}
                </button>
              </form>
            )}

            {/* Tab 2: Test Verification */}
            {activeTab === "test" && (
              <form onSubmit={handleTestReevaluation} className="mt-4 space-y-3 text-xs">
                <p className="text-on-surface-variant text-[11px]">
                  {t("dashboard.gapDetail.testIntro")}
                </p>
                <div>
                  <label className="font-semibold text-on-surface block mb-1" htmlFor="test-doc-select">
                    {t("dashboard.gapDetail.targetDocumentLabel")}
                  </label>
                  <select
                    id="test-doc-select"
                    value={testDocId}
                    onChange={(e) => setTestDocId(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-xs text-on-surface focus:border-tertiary focus:outline-none"
                  >
                    <option value="">{t("dashboard.gapDetail.selectTestDocumentOption")}</option>
                    {documents.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.metadata?.title || doc.originalFileName || doc.fileName}
                      </option>
                    ))}
                  </select>

                  <details className="mt-1 text-[11px]">
                    <summary className="cursor-pointer text-on-surface-variant hover:underline">
                      {t("dashboard.gapDetail.customDocIdSummary")}
                    </summary>
                    <input
                      type="text"
                      value={customTestDocId}
                      onChange={(e) => setCustomTestDocId(e.target.value)}
                      placeholder={t("dashboard.gapDetail.customTestDocIdPlaceholder")}
                      className="mt-1 w-full rounded-xl border border-outline-variant/40 bg-surface px-2.5 py-1 text-xs focus:outline-none"
                    />
                  </details>
                </div>

                <button
                  type="submit"
                  disabled={actionLoading || (!testDocId && !customTestDocId)}
                  className="w-full rounded-xl bg-tertiary px-4 py-2 text-xs font-semibold text-on-tertiary shadow-sm hover:bg-tertiary/90 disabled:opacity-50"
                >
                  {actionLoading
                    ? t("dashboard.gapDetail.runningTest")
                    : t("dashboard.gapDetail.runTest")}
                </button>
              </form>
            )}

            {/* Tab 3: Assign Form */}
            {activeTab === "assign" && (
              <form onSubmit={handleAssign} className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-on-surface block mb-1" htmlFor="user-select">
                    {t("dashboard.gapDetail.assigneeLabel")}
                  </label>
                  <select
                    id="user-select"
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-xs text-on-surface focus:border-secondary focus:outline-none"
                  >
                    <option value="">{t("dashboard.gapDetail.selectTeamMemberOption")}</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>

                  <details className="mt-1 text-[11px]">
                    <summary className="cursor-pointer text-on-surface-variant hover:underline">
                      {t("dashboard.gapDetail.customAssigneeSummary")}
                    </summary>
                    <input
                      type="text"
                      value={customAssigneeId}
                      onChange={(e) => setCustomAssigneeId(e.target.value)}
                      placeholder={t("dashboard.gapDetail.customAssigneePlaceholder")}
                      className="mt-1 w-full rounded-xl border border-outline-variant/40 bg-surface px-2.5 py-1 text-xs focus:outline-none"
                    />
                  </details>
                </div>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full rounded-xl bg-secondary px-4 py-2 text-xs font-semibold text-on-secondary shadow-sm hover:bg-secondary/90 disabled:opacity-50"
                >
                  {actionLoading
                    ? t("dashboard.gapDetail.saving")
                    : t("dashboard.gapDetail.saveAssignee")}
                </button>
              </form>
            )}

            {/* Tab 4: Dismiss / Reopen Form */}
            {activeTab === "dismiss" && (
              <div className="mt-4 space-y-3 text-xs">
                {gap.status !== "dismissed" && gap.status !== "resolved" ? (
                  <form onSubmit={handleDismiss} className="space-y-3">
                    <div>
                      <label className="font-semibold text-on-surface block mb-1" htmlFor="dismiss-reason-input">
                        {t("dashboard.gapDetail.dismissReasonLabel")} <span className="text-error">*</span>
                      </label>
                      <input
                        type="text"
                        id="dismiss-reason-input"
                        value={dismissReason}
                        onChange={(e) => setDismissReason(e.target.value)}
                        placeholder={t("dashboard.gapDetail.dismissReasonPlaceholder")}
                        className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-xs text-on-surface focus:outline-none"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/20 dark:text-rose-400 disabled:opacity-50"
                    >
                      {actionLoading
                        ? t("dashboard.gapDetail.dismissing")
                        : t("dashboard.gapDetail.dismissGap")}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-on-surface-variant">
                      {t("dashboard.gapDetail.reopenHint", {
                        status: codeLabel(t, "dashboard.gapStatus", gap.status),
                      })}
                    </p>
                    <button
                      type="button"
                      onClick={handleReopen}
                      disabled={actionLoading}
                      className="w-full rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50"
                    >
                      {actionLoading
                        ? t("dashboard.gapDetail.reopening")
                        : t("dashboard.gapDetail.reopenGap")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </DashboardPanel>

          {/* Audit History Timeline */}
          <DashboardPanel tone="muted">
            <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">history</span>
              {tPlural("dashboard.gapDetail.auditTrail", gap.auditHistory?.length || 0)}
            </h3>
            <div className="mt-3 space-y-2 text-[11px]">
              {gap.auditHistory?.map((audit, idx) => (
                <div key={idx} className="border-b border-outline-variant/20 pb-2">
                  <div className="flex justify-between font-semibold text-on-surface">
                    <span>{codeLabel(t, "audit.action", audit.action)}</span>
                    <span className="text-on-surface-variant font-normal">
                      {new Date(audit.timestamp).toLocaleDateString(intlLocale)}
                    </span>
                  </div>
                  <p className="text-on-surface-variant text-[10px] mt-0.5">
                    {t("dashboard.gapDetail.auditActor", { actor: String(audit.actorId) })}
                  </p>
                </div>
              ))}
            </div>
          </DashboardPanel>
        </div>
      </div>
    </DashboardPage>
  );
}
