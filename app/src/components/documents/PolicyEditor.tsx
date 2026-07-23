"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DOCUMENT_ACCESS_ACTIONS, type ActivePolicy, type PolicyDraft, type PolicyPreview, type PolicySubjectType } from "@/types/api/document-policy.types";
import * as policyApi from "@/services/document-policy.service";
import { listUsers } from "@/services/users.service";
import { listRoles } from "@/services/roles.service";
import type { RoleView, UserView } from "@/types/api/users.types";

function draftFrom(policy: ActivePolicy): PolicyDraft {
  return { rules: policy.rules.map((rule) => ({ ...rule, actions: [...rule.actions], subject: { ...rule.subject } })), inherits: policy.inherits ?? null, effectiveFrom: policy.effectiveFrom, effectiveUntil: policy.effectiveUntil ?? null, reason: policy.provenance.reason ?? null };
}
function ruleId() { const value = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; return `rule-${value}`.slice(0, 120); }

export function PolicyEditor({ documentId, active, sensitivity, onApplied, onClose }: { documentId: string; active: ActivePolicy; sensitivity: string; onApplied: () => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState<PolicyDraft>(() => draftFrom(active));
  const [pointer, setPointer] = useState({ policyId: active.policyId, policyVersion: active.policyVersion });
  const [preview, setPreview] = useState<PolicyPreview | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [users, setUsers] = useState<UserView[]>([]);
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [optionsDenied, setOptionsDenied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([listUsers(1, 100, controller.signal), listRoles(controller.signal), policyApi.listTaxonomy("departments", { pageSize: 100, status: "active" }, controller.signal)]).then((results) => {
      if (controller.signal.aborted) return;
      const [userResult, roleResult, departmentResult] = results;
      if (userResult.status === "fulfilled") setUsers(userResult.value.data.users.filter((user) => user.status === "active")); else setOptionsDenied(true);
      if (roleResult.status === "fulfilled") setRoles(roleResult.value.data.roles.filter((role) => role.status === "active"));
      if (departmentResult.status === "fulfilled") setDepartments((departmentResult.value.data.departments ?? []).map(({ id, name }) => ({ id, name })));
    });
    return () => controller.abort();
  }, []);

  const invalid = useMemo(() => {
    if (draft.rules.length > 200 || draft.reason && draft.reason.length > 500) return true;
    if (draft.effectiveFrom && draft.effectiveUntil && Date.parse(draft.effectiveUntil) <= Date.parse(draft.effectiveFrom)) return true;
    const semantics = new Set<string>();
    for (const rule of draft.rules) {
      if (!rule.actions.length || new Set(rule.actions).size !== rule.actions.length) return true;
      if (["user", "custom_role", "department"].includes(rule.subject.type) && !rule.subject.id) return true;
      const semantic = JSON.stringify([rule.effect, rule.subject.type, rule.subject.id ?? null, [...rule.actions].sort()]);
      if (semantics.has(semantic)) return true; semantics.add(semantic);
    }
    return false;
  }, [draft]);

  function edit(next: PolicyDraft) { setDraft(next); setPreview(null); setIdempotencyKey(null); setError(null); setAcknowledged(false); }
  function updateRule(index: number, update: Partial<PolicyDraft["rules"][number]>) { const rules = [...draft.rules]; const current = rules[index]; if (!current) return; rules[index] = { ...current, ...update }; edit({ ...draft, rules }); }
  function subjectOptions(type: PolicySubjectType) {
    if (type === "user") return users.map((user) => ({ id: user.id, name: user.name }));
    if (type === "custom_role") return roles.map((role) => ({ id: role.id, name: role.name }));
    if (type === "department") return departments;
    return [];
  }
  async function doPreview() {
    if (invalid) return; setBusy("preview"); setError(null);
    try { const result = await policyApi.previewPolicy(documentId, pointer.policyId, pointer.policyVersion, draft); setPreview(result.data); setIdempotencyKey(policyApi.createIdempotencyKey()); }
    catch (cause) { setError(policyApi.classifyPolicyError(cause)); }
    finally { setBusy(null); }
  }
  async function reloadPointer() {
    setBusy("preview");
    try { const result = await policyApi.getActivePolicy(documentId); setPointer({ policyId: result.data.policy.policyId, policyVersion: result.data.policy.policyVersion }); setError(null); setPreview(null); setIdempotencyKey(null); }
    catch (cause) { setError(policyApi.classifyPolicyError(cause)); }
    finally { setBusy(null); }
  }
  async function doApply(confirmSensitive: boolean) {
    if (!preview || !idempotencyKey || Date.parse(preview.previewExpiresAt) <= Date.now()) { setPreview(null); setError("preview_expired"); return; }
    setBusy("apply"); setError(null);
    try {
      const result = await policyApi.applyPolicy(documentId, preview.previewToken, draft, idempotencyKey, confirmSensitive);
      setConfirmOpen(false);
      if (result.data.status === "applied" || result.data.status === "idempotent_replay" || result.data.status === "no_change") await onApplied();
    } catch (cause) {
      const kind = policyApi.classifyPolicyError(cause); setError(kind);
      if (["version_conflict", "preview_mismatch", "preview_expired", "preview_invalid"].includes(kind)) setPreview(null);
      if (kind === "sensitive_confirmation") setConfirmOpen(true);
    } finally { setBusy(null); }
  }
  function requestApply() { if (!preview) return; if (preview.sensitiveConfirmationRequired) { setAcknowledged(false); setConfirmOpen(true); } else void doApply(false); }

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="policy-editor-title" onKeyDown={(event) => event.key === "Escape" && !busy && onClose()}>
    <div className="flex max-h-[calc(100vh-1rem)] w-full max-w-5xl flex-col rounded-2xl bg-surface shadow-2xl sm:max-h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between border-b border-outline-variant/30 p-4"><div><h2 id="policy-editor-title" className="text-title-lg font-bold">Edit access policy</h2><p className="text-sm text-on-surface-variant">Current version {active.policyVersion}. Preview is required before apply.</p></div><button ref={closeRef} aria-label="Close policy editor" onClick={onClose} className="rounded-full p-2 hover:bg-surface-container"><span className="material-symbols-outlined">close</span></button></div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        {optionsDenied && <p className="rounded-xl bg-warning-container p-3 text-sm">Some subject directories are unavailable. Owner and tenant-member rules remain available.</p>}
        {draft.rules.length === 0 && <p className="rounded-xl border border-warning/30 bg-warning-container p-3 text-sm">This draft denies access unless inherited rules grant it. The backend also protects the last management path.</p>}
        <div className="space-y-4">
          {draft.rules.map((rule, index) => <fieldset key={rule.ruleId} className="rounded-xl border border-outline-variant/40 p-4"><legend className="px-2 font-semibold">Rule {index + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-3"><label><span className="text-xs font-semibold">Effect</span><select value={rule.effect} onChange={(event) => updateRule(index, { effect: event.target.value as "allow" | "deny" })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2"><option value="allow">Allow</option><option value="deny">Deny</option></select></label><label><span className="text-xs font-semibold">Subject</span><select value={rule.subject.type} onChange={(event) => { const type = event.target.value as PolicySubjectType; updateRule(index, { subject: { type } }); }} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2">{(["user", "custom_role", "department", "owner", "tenant_member"] as const).map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>{["user", "custom_role", "department"].includes(rule.subject.type) ? <label><span className="text-xs font-semibold">Subject record</span><select value={rule.subject.id ?? ""} onChange={(event) => updateRule(index, { subject: { ...rule.subject, id: event.target.value || undefined } })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2"><option value="">Select…</option>{subjectOptions(rule.subject.type).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label> : <div className="text-sm text-on-surface-variant">No subject ID required.</div>}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{DOCUMENT_ACCESS_ACTIONS.map((action) => <label key={action} className="flex items-center gap-2 rounded-lg bg-surface-container-low p-2 text-sm"><input type="checkbox" checked={rule.actions.includes(action)} onChange={(event) => updateRule(index, { actions: event.target.checked ? [...rule.actions, action] : rule.actions.filter((item) => item !== action) })} />{action.replaceAll("_", " ")}</label>)}</div>
            <Button className="mt-3" size="sm" variant="danger" onClick={() => edit({ ...draft, rules: draft.rules.filter((_, itemIndex) => itemIndex !== index) })}>Remove rule</Button>
          </fieldset>)}
        </div>
        <Button variant="outline" disabled={draft.rules.length >= 200} onClick={() => edit({ ...draft, rules: [...draft.rules, { ruleId: ruleId(), effect: "allow", subject: { type: "owner" }, actions: ["read"] }] })}>Add rule</Button>
        <div className="grid gap-3 sm:grid-cols-3"><label><span className="text-sm font-semibold">Effective from</span><input type="datetime-local" value={draft.effectiveFrom?.slice(0, 16) ?? ""} onChange={(event) => edit({ ...draft, effectiveFrom: event.target.value ? new Date(event.target.value).toISOString() : null })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label><label><span className="text-sm font-semibold">Effective until</span><input type="datetime-local" value={draft.effectiveUntil?.slice(0, 16) ?? ""} onChange={(event) => edit({ ...draft, effectiveUntil: event.target.value ? new Date(event.target.value).toISOString() : null })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label><label><span className="text-sm font-semibold">Change reason</span><input maxLength={500} value={draft.reason ?? ""} onChange={(event) => edit({ ...draft, reason: event.target.value || null })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label></div>
        {invalid && <p role="alert" className="text-sm text-error">Correct incomplete or duplicate rules and the date interval before previewing.</p>}
        {error && <PolicyEditorError kind={error} onPreview={() => void doPreview()} onReload={() => void reloadPointer()} />}
        {preview && <ImpactSummary preview={preview} />}
      </div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-outline-variant/30 p-4"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="outline" disabled={invalid || Boolean(busy)} isLoading={busy === "preview"} onClick={() => void doPreview()}>Preview changes</Button><Button disabled={!preview || preview.impact.direction === "no_change" || Boolean(busy)} isLoading={busy === "apply"} onClick={requestApply}>{preview?.impact.direction === "no_change" ? "No effective change" : "Apply preview"}</Button></div>
    </div>
    {confirmOpen && preview && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" role="alertdialog" aria-modal="true" aria-labelledby="sensitive-title"><div className="w-full max-w-md rounded-2xl bg-surface p-6"><h3 id="sensitive-title" className="text-title-lg font-bold">Confirm sensitive access broadening</h3><p className="mt-2 text-sm text-on-surface-variant">Sensitivity: {sensitivity.replaceAll("_", " ")}. The backend reports a {preview.impact.direction} change with {preview.impact.usersGainingAny} user(s) gaining access.</p><p className="mt-2 text-sm">Actions gaining access: {DOCUMENT_ACCESS_ACTIONS.filter((action) => preview.impact.byAction[action].gained > 0).map((action) => action.replaceAll("_", " ")).join(", ") || "none"}.</p><p className="mt-2 text-xs text-on-surface-variant">Document content is never included here.</p><label className="mt-4 flex items-start gap-2"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I understand this broadens access to a sensitive document.</span></label><div className="mt-6 flex justify-end gap-3"><Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button><Button disabled={!acknowledged} isLoading={busy === "apply"} onClick={() => void doApply(true)}>Confirm and apply</Button></div></div></div>}
  </div>;
}

function ImpactSummary({ preview }: { preview: PolicyPreview }) {
  const changed = DOCUMENT_ACCESS_ACTIONS.filter((action) => preview.impact.byAction[action].gained || preview.impact.byAction[action].lost);
  return <section aria-live="polite" className="rounded-xl border border-primary/20 bg-primary/5 p-4"><h3 className="font-bold">Backend impact: {preview.impact.direction.replaceAll("_", " ")}</h3><p className="mt-1 text-sm">Version {preview.currentPolicyVersion} → {preview.proposedPolicyVersion}; {preview.impact.usersGainingAny} gaining, {preview.impact.usersLosingAny} losing any access.</p><p className="text-sm">Rules: +{preview.impact.ruleDelta.added} / −{preview.impact.ruleDelta.removed}. Expires {new Date(preview.previewExpiresAt).toLocaleString()}.</p>{changed.length > 0 && <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{changed.map((action) => <li key={action}>{action.replaceAll("_", " ")}: +{preview.impact.byAction[action].gained} / −{preview.impact.byAction[action].lost}</li>)}</ul>}</section>;
}
function PolicyEditorError({ kind, onPreview, onReload }: { kind: string; onPreview: () => void; onReload: () => void }) {
  const message: Record<string, string> = { version_conflict: "The active policy changed. Your draft is preserved; close, reload the policy, and preview it again.", preview_expired: "The preview expired. Preview the unchanged draft again.", preview_invalid: "The preview artifact is invalid. Create a new preview.", preview_mismatch: "The preview no longer matches this draft. Create a new preview.", invalid_reference: "A selected subject is stale or unavailable. Correct the draft.", invalid_inheritance: "The inheritance reference is no longer valid.", idempotency_conflict: "This operation identity was used for another request. Re-preview before applying.", invalid_draft: "The backend rejected this draft. Review its rules and dates.", network: "The response was lost. Retry apply without editing to reuse the same operation identity." };
  return <div role="alert" className="rounded-xl bg-error-container p-3 text-sm text-on-error-container"><p>{message[kind] ?? "The policy request could not be completed safely."}</p>{["preview_expired", "preview_invalid", "preview_mismatch"].includes(kind) && <Button className="mt-2" size="sm" variant="outline" onClick={onPreview}>Preview again</Button>}{kind === "version_conflict" && <Button className="mt-2" size="sm" variant="outline" onClick={onReload}>Reload pointer and preserve draft</Button>}</div>;
}
