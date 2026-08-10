"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { codeLabel } from "@/lib/i18n/code-label";
import { useI18n } from "@/providers/i18n-provider";
import type { DocumentView } from "@/types/api/documents.types";
import type { BatchApplyResponse, BatchExpectedPolicy, BatchPreviewResponse, PolicyDraft } from "@/types/api/document-policy.types";
import * as policyApi from "@/services/document-policy.service";

export function BatchPolicyDialog({ documents, onClose, onComplete }: { documents: DocumentView[]; onClose: () => void; onComplete: () => void }) {
  const { t } = useI18n();

  const [expected, setExpected] = useState<BatchExpectedPolicy[]>([]);
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const [preview, setPreview] = useState<BatchPreviewResponse["data"] | null>(null);
  const [result, setResult] = useState<BatchApplyResponse["data"] | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    const controller = new AbortController(); setBusy(true);
    void Promise.all(documents.map((document) => policyApi.getActivePolicy(document.id, controller.signal))).then((responses) => {
      if (controller.signal.aborted || !responses[0]) return;
      setExpected(responses.map(({ data }) => ({ documentId: data.policy.documentId, policyId: data.policy.policyId, policyVersion: data.policy.policyVersion })));
      const policy = responses[0].data.policy;
      setDraft({ rules: policy.rules.map((rule) => ({ ...rule, subject: { ...rule.subject }, actions: [...rule.actions] })), inherits: null, effectiveFrom: null, effectiveUntil: policy.effectiveUntil ?? null, reason: "Batch access policy update" });
    }).catch((cause) => setError(policyApi.classifyPolicyError(cause))).finally(() => setBusy(false));
    return () => controller.abort();
  }, [documents]);

  function edit(next: PolicyDraft) { setDraft(next); setPreview(null); setResult(null); setKey(null); setError(null); }
  async function previewBatch() { if (!draft) return; setBusy(true); setError(null); try { const response = await policyApi.previewBatch(documents.map(({ id }) => id).sort(), expected, draft); setPreview(response.data); setKey(policyApi.createIdempotencyKey()); } catch (cause) { setError(policyApi.classifyPolicyError(cause)); } finally { setBusy(false); } }
  async function apply(confirmSensitive = false) { if (!draft || !preview || !key) return; setBusy(true); setError(null); try { const response = await policyApi.applyBatch(preview.previewToken, draft, key, confirmSensitive); setResult(response.data); setConfirm(false); onComplete(); } catch (cause) { const kind = policyApi.classifyPolicyError(cause); setError(kind); if (["version_conflict", "preview_mismatch", "preview_expired"].includes(kind)) setPreview(null); if (kind === "sensitive_confirmation") setConfirm(true); } finally { setBusy(false); } }

  const sensitiveCount = preview?.aggregate.sensitiveConfirmationRequiredCount ?? 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-3" role="dialog" aria-modal="true" aria-labelledby="batch-title">
      <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col rounded-2xl bg-surface-container-lowest shadow-modal">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
          <div>
            <h2 id="batch-title" className="text-title-lg font-bold text-on-surface">{t("documents.batchPolicyUpdate")}</h2>
            <p className="text-body-sm text-on-surface-variant">{t("documents.batchAuthorizedDocsCount", { count: String(documents.length) })}</p>
          </div>
          <button aria-label={t("documents.closeBatchEditor")} onClick={onClose} className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <ul className="grid gap-2 sm:grid-cols-2">{documents.map((document) => <li key={document.id} className="flex items-center gap-2 truncate rounded-lg bg-surface-container-low px-3 py-2 text-body-sm"><span className="material-symbols-outlined text-[16px] text-on-surface-variant" aria-hidden="true">description</span>{document.metadata.title || document.fileName}</li>)}</ul>

          {busy && !draft && <div role="status" className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-body-sm text-on-surface-variant"><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />{t("documents.loadingActivePolicyPointers")}</div>}

          {draft && <>
            <label className="block">
              <span className="text-label-md text-on-surface-variant">{t("documents.sharedChangeReason")}</span>
              <input maxLength={500} value={draft.reason ?? ""} onChange={(event) => edit({ ...draft, reason: event.target.value || null })} className="mt-1.5 h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </label>
            <div className="flex items-start gap-2 rounded-lg bg-primary/[0.04] p-3 text-body-sm text-on-surface-variant">
              <span className="material-symbols-outlined mt-0.5 text-[16px] text-primary" aria-hidden="true">info</span>
              {t("documents.sharedTemplateNote")}
            </div>
          </>}

          {error && (
            <Alert variant="error" title={t("documents.batchErrorTitle")}>
              <p>{error === "version_conflict" ? t("documents.batchErrorVersionConflict") : t("documents.batchErrorGeneric")}</p>
            </Alert>
          )}

          {preview && (
            <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
              <h3 className="text-label-md font-semibold uppercase tracking-wide text-on-surface">{t("documents.authoritativeBatchImpact")}</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-body-sm sm:grid-cols-4">
                <div className="rounded-lg bg-surface px-2 py-1">
                  <span className="text-label-sm text-on-surface-variant">{t("documents.broadening")}</span>
                  <p className="font-medium">{preview.aggregate.broadeningCount}</p>
                </div>
                <div className="rounded-lg bg-surface px-2 py-1">
                  <span className="text-label-sm text-on-surface-variant">{t("documents.tightening")}</span>
                  <p className="font-medium">{preview.aggregate.tighteningCount}</p>
                </div>
                <div className="rounded-lg bg-surface px-2 py-1">
                  <span className="text-label-sm text-on-surface-variant">{t("documents.mixed")}</span>
                  <p className="font-medium">{preview.aggregate.mixedCount}</p>
                </div>
                <div className="rounded-lg bg-surface px-2 py-1">
                  <span className="text-label-sm text-on-surface-variant">{t("documents.noChangeLabel")}</span>
                  <p className="font-medium">{preview.aggregate.noChangeCount}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-body-sm">
                <div className="rounded-lg bg-surface px-2 py-1">
                  <span className="text-label-sm text-on-surface-variant">{t("documents.usersGaining")}</span>
                  <p className="font-medium">{preview.aggregate.usersGainingAccess}</p>
                </div>
                <div className="rounded-lg bg-surface px-2 py-1">
                  <span className="text-label-sm text-on-surface-variant">{t("documents.usersLosing")}</span>
                  <p className="font-medium">{preview.aggregate.usersLosingAccess}</p>
                </div>
                <div className="rounded-lg bg-surface px-2 py-1">
                  <span className="text-label-sm text-on-surface-variant">{t("documents.sensitive")}</span>
                  <p className="font-medium">{sensitiveCount}</p>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-body-sm text-on-surface-variant">
                {preview.results.map((item) => (
                  <li key={item.documentId} className="flex items-center gap-2">
                    <Badge status={item.direction === "broadening" ? "warning" : item.direction === "tightening" ? "info" : item.direction === "mixed" ? "warning" : "success"} label={codeLabel(t, "documents.propagationStatus", item.direction)} />
                    <span className="truncate">{documents.find((document) => document.id === item.documentId)?.metadata.title ?? `${item.documentId.slice(0, 8)}…`}</span>
                    <span className="text-on-surface-variant">+{item.usersGainingAny}/−{item.usersLosingAny}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result && (
            <section aria-live="polite" className={`rounded-xl border p-4 ${result.status === "partial" ? "border-warning/20 bg-warning-container/40" : "border-success/20 bg-success-container/40"}`}>
              <h3 className="text-label-md font-semibold uppercase tracking-wide text-on-surface">{result.status === "partial" ? t("documents.partialBatchResult") : result.status === "idempotent_replay" ? t("documents.originalBatchResultReplayed") : t("documents.batchComplete")}</h3>
              <p className="mt-2 text-body-sm text-on-surface-variant">
                {t("documents.batchResultsSummary", {
                  applied: String(result.results.filter((item) => item.status === "applied").length),
                  noChange: String(result.results.filter((item) => item.status === "no_change").length),
                  conflicts: String(result.results.filter((item) => item.status === "version_conflict").length),
                  failed: String(result.results.filter((item) => item.status === "failed").length),
                })}
              </p>
              {result.status === "partial" && <p className="mt-1 text-body-sm text-on-surface-variant">{t("documents.partialBatchNote")}</p>}
            </section>
          )}
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-outline-variant/30 bg-surface-container-lowest px-6 py-4">
          <Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>
          <Button variant="secondary" disabled={!draft || busy} isLoading={busy && !preview} onClick={() => void previewBatch()}>{t("documents.previewBatch")}</Button>
          <Button disabled={!preview || Boolean(result) || busy} isLoading={busy && Boolean(preview)} onClick={() => sensitiveCount ? setConfirm(true) : void apply(false)}>{t("documents.applyPreview")}</Button>
        </div>
      </div>

      {confirm && preview && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" role="alertdialog" aria-modal="true" aria-labelledby="batch-sensitive-title">
          <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-modal">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 text-[24px] text-warning" aria-hidden="true">warning</span>
              <div>
                <h3 id="batch-sensitive-title" className="text-title-lg font-bold text-on-surface">{t("documents.confirmSensitiveBatchBroadening")}</h3>
              </div>
            </div>
            <p className="mt-3 text-body-sm text-on-surface-variant">{t("documents.batchSensitiveConfirmationNote", { sensitiveCount: String(sensitiveCount), totalCount: String(preview.documentCount) })}</p>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant/40 bg-surface-container-low px-4 py-3 transition-colors hover:bg-surface-container">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-outline-variant text-primary focus:ring-2 focus:ring-primary/30" />
              <span className="text-body-sm text-on-surface">{t("documents.understandSensitiveBatchBroadening")}</span>
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setConfirm(false)}>{t("common.cancel")}</Button>
              <Button variant="warning" disabled={!acknowledged} onClick={() => void apply(true)}>{t("documents.confirmAndApply")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
