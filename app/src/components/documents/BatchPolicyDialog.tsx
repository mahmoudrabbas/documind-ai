"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { DocumentView } from "@/types/api/documents.types";
import type { BatchApplyResponse, BatchExpectedPolicy, BatchPreviewResponse, PolicyDraft } from "@/types/api/document-policy.types";
import * as policyApi from "@/services/document-policy.service";

export function BatchPolicyDialog({ documents, onClose, onComplete }: { documents: DocumentView[]; onClose: () => void; onComplete: () => void }) {
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
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-3" role="dialog" aria-modal="true" aria-labelledby="batch-title"><div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col rounded-2xl bg-surface shadow-xl"><div className="flex items-center justify-between border-b border-outline-variant/30 p-4"><div><h2 id="batch-title" className="text-title-lg font-bold">Batch policy update</h2><p className="text-sm text-on-surface-variant">{documents.length} authorized list document(s), maximum 50</p></div><button aria-label="Close batch editor" onClick={onClose}><span className="material-symbols-outlined">close</span></button></div><div className="flex-1 space-y-4 overflow-y-auto p-4">
    <ul className="grid gap-2 sm:grid-cols-2">{documents.map((document) => <li key={document.id} className="truncate rounded-lg bg-surface-container-low p-2 text-sm">{document.metadata.title || document.fileName}</li>)}</ul>
    {busy && !draft && <p role="status">Loading active policy pointers…</p>}
    {draft && <><label className="block"><span className="font-semibold">Shared change reason</span><input maxLength={500} value={draft.reason ?? ""} onChange={(event) => edit({ ...draft, reason: event.target.value || null })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label><p className="rounded-lg bg-primary/5 p-3 text-sm">The shared template uses the first selected policy’s structured rules. Review the single-document editor first if subject changes are needed; the backend validates every reference for every document.</p></>}
    {error && <p role="alert" className="rounded-lg bg-error-container p-3">{error === "version_conflict" ? "One or more documents changed. Reload and re-preview; no automatic retry was made." : "The batch request could not be completed safely. Edit or re-preview."}</p>}
    {preview && <section className="rounded-xl border border-primary/20 p-4"><h3 className="font-bold">Authoritative batch impact</h3><div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><span>Broadening: {preview.aggregate.broadeningCount}</span><span>Tightening: {preview.aggregate.tighteningCount}</span><span>Mixed: {preview.aggregate.mixedCount}</span><span>No change: {preview.aggregate.noChangeCount}</span><span>Users gaining: {preview.aggregate.usersGainingAccess}</span><span>Users losing: {preview.aggregate.usersLosingAccess}</span><span>Sensitive: {sensitiveCount}</span></div><ul className="mt-3 space-y-1 text-sm">{preview.results.map((item) => <li key={item.documentId}>{documents.find((document) => document.id === item.documentId)?.metadata.title ?? `${item.documentId.slice(0, 8)}…`}: {item.direction}, +{item.usersGainingAny}/−{item.usersLosingAny}</li>)}</ul></section>}
    {result && <section aria-live="polite" className={`rounded-xl p-4 ${result.status === "partial" ? "bg-warning-container" : "bg-tertiary-container"}`}><h3 className="font-bold">{result.status === "partial" ? "Partial batch result" : result.status === "idempotent_replay" ? "Original batch result replayed" : "Batch complete"}</h3><p className="mt-1 text-sm">Applied {result.results.filter((item) => item.status === "applied").length}; no change {result.results.filter((item) => item.status === "no_change").length}; conflicts {result.results.filter((item) => item.status === "version_conflict").length}; failed {result.results.filter((item) => item.status === "failed").length}.</p>{result.status === "partial" && <p className="mt-1 text-sm">Successful entries remain complete. Reload and create a new preview only for conflicted or failed documents.</p>}</section>}
  </div><div className="flex flex-wrap justify-end gap-3 border-t border-outline-variant/30 p-4"><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="outline" disabled={!draft || busy} isLoading={busy && !preview} onClick={() => void previewBatch()}>Preview batch</Button><Button disabled={!preview || Boolean(result) || busy} isLoading={busy && Boolean(preview)} onClick={() => sensitiveCount ? setConfirm(true) : void apply(false)}>Apply preview</Button></div></div>
  {confirm && preview && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" role="alertdialog" aria-modal="true" aria-labelledby="batch-sensitive-title"><div className="w-full max-w-md rounded-2xl bg-surface p-6"><h3 id="batch-sensitive-title" className="text-title-lg font-bold">Confirm sensitive batch broadening</h3><p className="mt-2 text-sm">{sensitiveCount} of {preview.documentCount} documents require explicit confirmation. The backend impact includes broadening or mixed changes.</p><label className="mt-4 flex gap-2"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I understand this can broaden sensitive access.</label><div className="mt-6 flex justify-end gap-3"><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button><Button disabled={!acknowledged} onClick={() => void apply(true)}>Confirm and apply</Button></div></div></div>}
  </div>;
}
