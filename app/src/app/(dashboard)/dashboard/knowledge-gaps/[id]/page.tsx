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

type ActionTab = "resolve" | "test" | "assign" | "dismiss";

export default function KnowledgeGapDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const gapId = resolvedParams.id;
  const { can } = usePermissions();

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
      setError(err instanceof Error ? err.message : "Failed to load knowledge gap details");
    } finally {
      setLoading(false);
    }
  }, [gapId]);

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
      setActionSuccess("Assignee updated successfully!");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to assign gap");
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
      setActionSuccess("Knowledge gap resolved!");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resolve gap");
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
      setActionSuccess("Knowledge gap dismissed.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to dismiss gap");
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
      setActionSuccess("Knowledge gap reopened.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reopen gap");
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
      setActionSuccess("Resolution test completed!");
      fetchDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to run resolution test");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardPage>
        <DashboardPageHeader eyebrow="Knowledge Gaps" title="Loading gap details..." />
        <DashboardPanel>
          <div className="h-64 animate-pulse rounded-2xl bg-surface-container/50" />
        </DashboardPanel>
      </DashboardPage>
    );
  }

  if (error || !gap) {
    return (
      <DashboardPage>
        <DashboardPageHeader eyebrow="Knowledge Gaps" title="Gap Error" />
        <DashboardPanel>
          <div className="rounded-2xl border border-error/20 bg-error/5 p-6 text-center">
            <p className="text-sm font-semibold text-error">{error || "Gap not found"}</p>
            <Link
              href="/dashboard/knowledge-gaps"
              className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary"
            >
              Back to Knowledge Gaps
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
            Back to Knowledge Gaps
          </Link>
        }
        title={gap.topic}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
              className="inline-flex items-center gap-1 rounded-xl border border-outline-variant/30 bg-surface px-2.5 py-1 text-xs font-semibold text-on-surface-variant hover:bg-surface-container"
              title="Toggle internal technical details"
            >
              <span className="material-symbols-outlined text-[14px]">code</span>
              {showTechnicalDetails ? "Hide Dev Info" : "Dev Info"}
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
          <p><strong>Cluster Key:</strong> {gap.clusterKey}</p>
          <p><strong>Gap ID:</strong> {gap.id}</p>
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
              <span>Representative Question</span>
            </div>
            <div className="mt-2.5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-base font-semibold text-on-surface">
                &ldquo;{gap.representativeQuestion}&rdquo;
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-6 border-t border-outline-variant/20 pt-4">
              <div>
                <span className="text-on-surface-variant block font-medium">Department</span>
                <span className="font-bold text-on-surface">{gap.department || "General"}</span>
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">Issue Category</span>
                <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400 capitalize">
                  {gap.sourceMetadata?.category
                    ? String(gap.sourceMetadata.category).replace(/_/g, " ")
                    : occurrences.find((o) => o.category)?.category
                    ? String(occurrences.find((o) => o.category)?.category).replace(/_/g, " ")
                    : "Unspecified"}
                </span>
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">Occurrences</span>
                <span className="inline-flex items-center gap-1 font-bold text-primary">
                  <span className="material-symbols-outlined text-[14px]">repeat</span>
                  {gap.occurrenceCount}
                </span>
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">First Seen</span>
                <span className="font-bold text-on-surface">{new Date(gap.firstOccurrence).toLocaleDateString()}</span>
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">Source</span>
                <span className="font-bold uppercase text-on-surface">{gap.source.replace(/_/g, " ")}</span>
              </div>
              <div>
                <span className="text-on-surface-variant block font-medium">Assignee</span>
                <span className="font-bold text-on-surface">
                  {assignedUser ? assignedUser.name : gap.assigneeId ? `User (${gap.assigneeId.slice(0, 8)}...)` : "Unassigned"}
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
                  <h3 className="text-sm font-bold text-on-surface">AI Recommended Action</h3>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="material-symbols-outlined text-[14px]">verified</span>
                  {Math.round(gap.agentProposal.confidence * 100)}% Confidence
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
                    <span className="font-medium text-on-surface-variant">Required Content Type:</span>
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
                Resolution Verification Tests ({reevaluations.length})
              </h3>
            </div>
            {reevaluations.length === 0 ? (
              <p className="mt-2 text-xs text-on-surface-variant">
                No resolution tests performed yet. Select a document in the Action Center to verify if it answers this gap!
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
                        {r.result === "improved" ? "IMPROVED (Resolved)" : "NOT IMPROVED"}
                      </span>
                      <span className="text-[11px] text-on-surface-variant font-normal">
                        {new Date(r.createdAt).toLocaleDateString()}
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
              Recorded Occurrences ({occurrences.length})
            </h3>
            {occurrences.length === 0 ? (
              <p className="mt-2 text-xs text-on-surface-variant">No individual user questions logged for this gap.</p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {occurrences.map((occ) => (
                  <div key={occ.id} className="rounded-2xl border border-outline-variant/30 bg-surface p-3 text-xs">
                    <p className="font-semibold text-on-surface">&ldquo;{occ.question}&rdquo;</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-on-surface-variant">
                      <span className="rounded-md bg-surface-container px-2 py-0.5 font-medium">
                        Outcome: <strong>{occ.outcome.replace(/_/g, " ")}</strong>
                      </span>
                      {Boolean(occ.category || gap.sourceMetadata?.category) && (
                        <span className="rounded-md bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-600 dark:text-rose-400 capitalize">
                          Category: {String(occ.category || gap.sourceMetadata?.category).replace(/_/g, " ")}
                        </span>
                      )}
                      <span>Confidence: {Math.round(occ.confidence * 100)}%</span>
                      <span>Date: {new Date(occ.createdAt).toLocaleDateString()}</span>
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
              Action Center
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
                Resolve
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
                Verify
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
                Assign
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
                Dismiss
              </button>
            </div>

            {/* Tab 1: Resolve Form */}
            {activeTab === "resolve" && (
              <form onSubmit={handleResolve} className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-on-surface block mb-1" htmlFor="resolution-notes-input">
                    Resolution Notes <span className="text-error">*</span>
                  </label>
                  <textarea
                    id="resolution-notes-input"
                    rows={3}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Describe how this gap was answered or what document was added..."
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface p-2.5 text-xs text-on-surface focus:border-primary focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="font-semibold text-on-surface block mb-1" htmlFor="doc-select">
                    Link Answering Document
                  </label>
                  <select
                    id="doc-select"
                    value={selectedDocId}
                    onChange={(e) => setSelectedDocId(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-xs text-on-surface focus:border-primary focus:outline-none"
                  >
                    <option value="">Select document from library...</option>
                    {documents.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.metadata?.title || doc.originalFileName || doc.fileName}
                      </option>
                    ))}
                  </select>

                  <details className="mt-1 text-[11px]">
                    <summary className="cursor-pointer text-on-surface-variant hover:underline">
                      Or enter custom Document ID
                    </summary>
                    <input
                      type="text"
                      value={customDocId}
                      onChange={(e) => setCustomDocId(e.target.value)}
                      placeholder="Paste Document ID"
                      className="mt-1 w-full rounded-xl border border-outline-variant/40 bg-surface px-2.5 py-1 text-xs focus:outline-none"
                    />
                  </details>
                </div>

                <button
                  type="submit"
                  disabled={actionLoading || gap.status === "resolved"}
                  className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actionLoading ? "Saving..." : gap.status === "resolved" ? "Gap Resolved" : "Mark as Resolved"}
                </button>
              </form>
            )}

            {/* Tab 2: Test Verification */}
            {activeTab === "test" && (
              <form onSubmit={handleTestReevaluation} className="mt-4 space-y-3 text-xs">
                <p className="text-on-surface-variant text-[11px]">
                  Select a document to test if its contents successfully answer this gap&apos;s question.
                </p>
                <div>
                  <label className="font-semibold text-on-surface block mb-1" htmlFor="test-doc-select">
                    Target Document
                  </label>
                  <select
                    id="test-doc-select"
                    value={testDocId}
                    onChange={(e) => setTestDocId(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-xs text-on-surface focus:border-tertiary focus:outline-none"
                  >
                    <option value="">Select document to test...</option>
                    {documents.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.metadata?.title || doc.originalFileName || doc.fileName}
                      </option>
                    ))}
                  </select>

                  <details className="mt-1 text-[11px]">
                    <summary className="cursor-pointer text-on-surface-variant hover:underline">
                      Or enter custom Document ID
                    </summary>
                    <input
                      type="text"
                      value={customTestDocId}
                      onChange={(e) => setCustomTestDocId(e.target.value)}
                      placeholder="Paste Target Document ID"
                      className="mt-1 w-full rounded-xl border border-outline-variant/40 bg-surface px-2.5 py-1 text-xs focus:outline-none"
                    />
                  </details>
                </div>

                <button
                  type="submit"
                  disabled={actionLoading || (!testDocId && !customTestDocId)}
                  className="w-full rounded-xl bg-tertiary px-4 py-2 text-xs font-semibold text-on-tertiary shadow-sm hover:bg-tertiary/90 disabled:opacity-50"
                >
                  {actionLoading ? "Running Test..." : "Run Resolution Test"}
                </button>
              </form>
            )}

            {/* Tab 3: Assign Form */}
            {activeTab === "assign" && (
              <form onSubmit={handleAssign} className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-on-surface block mb-1" htmlFor="user-select">
                    Assignee Team Member
                  </label>
                  <select
                    id="user-select"
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-xs text-on-surface focus:border-secondary focus:outline-none"
                  >
                    <option value="">Select team member...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>

                  <details className="mt-1 text-[11px]">
                    <summary className="cursor-pointer text-on-surface-variant hover:underline">
                      Or enter custom User ID / Email
                    </summary>
                    <input
                      type="text"
                      value={customAssigneeId}
                      onChange={(e) => setCustomAssigneeId(e.target.value)}
                      placeholder="User ID or Email"
                      className="mt-1 w-full rounded-xl border border-outline-variant/40 bg-surface px-2.5 py-1 text-xs focus:outline-none"
                    />
                  </details>
                </div>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full rounded-xl bg-secondary px-4 py-2 text-xs font-semibold text-on-secondary shadow-sm hover:bg-secondary/90 disabled:opacity-50"
                >
                  {actionLoading ? "Saving..." : "Save Assignee"}
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
                        Reason for Dismissal <span className="text-error">*</span>
                      </label>
                      <input
                        type="text"
                        id="dismiss-reason-input"
                        value={dismissReason}
                        onChange={(e) => setDismissReason(e.target.value)}
                        placeholder="Why is this gap ignored/not relevant?"
                        className="w-full rounded-xl border border-outline-variant/40 bg-surface px-3 py-2 text-xs text-on-surface focus:outline-none"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/20 dark:text-rose-400 disabled:opacity-50"
                    >
                      {actionLoading ? "Dismissing..." : "Dismiss Gap"}
                    </button>
                  </form>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-on-surface-variant">
                      This gap is currently <strong>{gap.status}</strong>. You can reopen it if needed.
                    </p>
                    <button
                      type="button"
                      onClick={handleReopen}
                      disabled={actionLoading}
                      className="w-full rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-on-primary hover:bg-primary/90 disabled:opacity-50"
                    >
                      {actionLoading ? "Reopening..." : "Reopen Knowledge Gap"}
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
              Audit Trail ({gap.auditHistory?.length || 0})
            </h3>
            <div className="mt-3 space-y-2 text-[11px]">
              {gap.auditHistory?.map((audit, idx) => (
                <div key={idx} className="border-b border-outline-variant/20 pb-2">
                  <div className="flex justify-between font-semibold text-on-surface">
                    <span>{audit.action.replace(/_/g, " ")}</span>
                    <span className="text-on-surface-variant font-normal">
                      {new Date(audit.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-on-surface-variant text-[10px] mt-0.5">By: {String(audit.actorId)}</p>
                </div>
              ))}
            </div>
          </DashboardPanel>
        </div>
      </div>
    </DashboardPage>
  );
}
