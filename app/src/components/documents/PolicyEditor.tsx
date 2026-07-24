"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DOCUMENT_ACCESS_ACTIONS, type ActivePolicy, type PolicyDraft, type PolicyPreview, type PolicySubjectType, type PolicyTaxonomySelection, type PolicyTaxonomySummary } from "@/types/api/document-policy.types";
import * as policyApi from "@/services/document-policy.service";
import type { PolicyEditorSubject, PolicyEditorClassification } from "@/types/api/document-policy.types";
import { useAuth } from "@/providers/auth-provider";

function draftFrom(policy: ActivePolicy): PolicyDraft {
  return { rules: policy.rules.map((rule) => ({ ...rule, actions: [...rule.actions], subject: { ...rule.subject } })), inherits: policy.inherits ?? null, effectiveFrom: policy.effectiveFrom, effectiveUntil: policy.effectiveUntil ?? null, reason: policy.provenance.reason ?? null };
}
function ruleId() { const value = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; return `rule-${value}`.slice(0, 120); }

export function PolicyEditor({ documentId, active, taxonomy: currentTaxonomy, onApplied, onClose }: { documentId: string; active: ActivePolicy; taxonomy: PolicyTaxonomySummary; onApplied: () => Promise<void>; onClose: () => void }) {
  const auth = useAuth();
  const currentUserId = auth.status === "authenticated" ? auth.user.id : null;
  const [draft, setDraft] = useState<PolicyDraft>(() => draftFrom(active));
  const [taxonomy, setTaxonomy] = useState<PolicyTaxonomySelection>(() => ({ classificationId: currentTaxonomy.classificationId, categoryId: currentTaxonomy.categoryId, departmentId: currentTaxonomy.departmentId }));
  const [pointer, setPointer] = useState({ policyId: active.policyId, policyVersion: active.policyVersion });
  const [preview, setPreview] = useState<PolicyPreview | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [users, setUsers] = useState<PolicyEditorSubject[]>([]);
  const [roles, setRoles] = useState<PolicyEditorSubject[]>([]);
  const [departments, setDepartments] = useState<PolicyEditorSubject[]>([]);
  const [classifications, setClassifications] = useState<PolicyEditorClassification[]>([]);
  const [categories, setCategories] = useState<PolicyEditorSubject[]>([]);
  const [documentOwnerId, setDocumentOwnerId] = useState<string | null>(null);
  const [taxonomyEditable, setTaxonomyEditable] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(false);
  const [optionsReload, setOptionsReload] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setOptionsLoading(true);
    setOptionsError(false);
    void policyApi.getPolicyEditorOptions(documentId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setUsers(result.data.users);
      setRoles(result.data.roles);
      setClassifications(result.data.classifications);
      setCategories(result.data.categories);
      setDepartments(result.data.departments);
      setDocumentOwnerId(result.data.documentOwnerId);
      setTaxonomyEditable(result.data.taxonomyEditable);
    }).catch(() => { if (!controller.signal.aborted) setOptionsError(true); })
      .finally(() => { if (!controller.signal.aborted) setOptionsLoading(false); });
    return () => controller.abort();
  }, [documentId, optionsReload]);

  const isOwner = currentUserId != null && documentOwnerId != null && currentUserId === documentOwnerId;
  const OWNER_MINIMUM_ACTIONS = useMemo(() => new Set(["discover", "read", "download"]), []);

  const invalid = useMemo(() => {
    if (!taxonomy.classificationId || optionsLoading || optionsError || draft.rules.length > 200 || draft.reason && draft.reason.length > 500) return true;
    if (draft.effectiveFrom && draft.effectiveUntil && Date.parse(draft.effectiveUntil) <= Date.parse(draft.effectiveFrom)) return true;
    const semantics = new Set<string>();
    for (const rule of draft.rules) {
      if (!rule.actions.length || new Set(rule.actions).size !== rule.actions.length) return true;
      if (["user", "custom_role", "department"].includes(rule.subject.type) && !rule.subject.id) return true;
      const semantic = JSON.stringify([rule.effect, rule.subject.type, rule.subject.id ?? null, [...rule.actions].sort()]);
      if (semantics.has(semantic)) return true; semantics.add(semantic);
    }
    return false;
  }, [draft, taxonomy.classificationId, optionsError, optionsLoading]);

  function edit(next: PolicyDraft) { setDraft(next); setPreview(null); setIdempotencyKey(null); setError(null); setAcknowledged(false); }
  function editTaxonomy(next: PolicyTaxonomySelection) { setTaxonomy(next); setPreview(null); setIdempotencyKey(null); setError(null); setAcknowledged(false); }
  function updateRule(index: number, update: Partial<PolicyDraft["rules"][number]>) { const rules = [...draft.rules]; const current = rules[index]; if (!current) return; rules[index] = { ...current, ...update }; edit({ ...draft, rules }); }
  function subjectOptions(type: PolicySubjectType) {
    if (type === "user") return users;
    if (type === "custom_role") return roles;
    if (type === "department") return departments;
    return [];
  }
  async function doPreview() {
    if (invalid) return; setBusy("preview"); setError(null);
    try { const result = await policyApi.previewPolicy(documentId, pointer.policyId, pointer.policyVersion, draft, taxonomy); setPreview(result.data); setIdempotencyKey(policyApi.createIdempotencyKey()); }
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
      const result = await policyApi.applyPolicy(documentId, preview.previewToken, draft, idempotencyKey, confirmSensitive, taxonomy);
      setConfirmOpen(false);
      if (result.data.status === "applied" || result.data.status === "idempotent_replay" || result.data.status === "no_change") await onApplied();
    } catch (cause) {
      const kind = policyApi.classifyPolicyError(cause); setError(kind);
      if (["version_conflict", "preview_mismatch", "preview_expired", "preview_invalid", "owner_rule_protected", "taxonomy_protected"].includes(kind)) setPreview(null);
      if (kind === "sensitive_confirmation") setConfirmOpen(true);
    } finally { setBusy(null); }
  }
  function requestApply() { if (!preview) return; if (preview.sensitiveConfirmationRequired) { setAcknowledged(false); setConfirmOpen(true); } else void doApply(false); }

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="policy-editor-title" onKeyDown={(event) => event.key === "Escape" && !busy && onClose()}>
    <div className="flex max-h-[calc(100vh-1rem)] w-full max-w-5xl flex-col rounded-2xl bg-surface shadow-2xl sm:max-h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between border-b border-outline-variant/30 p-4"><div><h2 id="policy-editor-title" className="text-title-lg font-bold">Edit access policy</h2><p className="text-sm text-on-surface-variant">Current version {active.policyVersion}. Preview is required before apply.</p></div><button ref={closeRef} aria-label="Close policy editor" onClick={onClose} className="rounded-full p-2 hover:bg-surface-container"><span className="material-symbols-outlined">close</span></button></div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        {optionsError && <div role="alert" className="rounded-xl bg-error-container p-3 text-sm text-on-error-container"><p>Policy editor options could not be loaded.</p><Button className="mt-2" size="sm" variant="outline" onClick={() => setOptionsReload((value) => value + 1)}>Retry loading options</Button></div>}
        {optionsLoading && <p role="status" className="rounded-lg bg-surface-container-low p-3 text-sm">Loading policy editor options…</p>}
        <fieldset className={`rounded-xl border p-4 ${!taxonomyEditable ? "border-outline-variant/40 bg-surface-container-low" : "border-outline-variant/40"}`}>
          <legend className="px-2 font-semibold">Document taxonomy</legend>
          <p className="mb-3 text-sm text-on-surface-variant">Taxonomy and access rules are previewed and applied as one versioned policy change.</p>
          {!taxonomyEditable && <p className="mb-3 text-sm text-on-surface-variant">Document taxonomy can only be changed by the document owner or a Company Admin.</p>}
          {optionsLoading && <p role="status" className="rounded-lg bg-surface-container-low p-3 text-sm">Loading active taxonomy options…</p>}
          {optionsError && <div role="alert" className="rounded-lg bg-error-container p-3 text-sm"><p>Taxonomy options could not be loaded.</p><Button className="mt-2" size="sm" variant="outline" onClick={() => setOptionsReload((value) => value + 1)}>Retry taxonomy</Button></div>}
          {!optionsLoading && !optionsError && classifications.length === 0 && <p role="alert" className="rounded-lg bg-warning-container p-3 text-sm">No active classifications are available. Create or restore one before changing this policy.</p>}
          {!optionsLoading && !optionsError && classifications.length > 0 && <div className="grid gap-3 sm:grid-cols-3">
            <label><span className="text-sm font-semibold">Classification / sensitivity</span><select aria-label="Classification / sensitivity" value={taxonomy.classificationId} disabled={!taxonomyEditable} onChange={(event) => editTaxonomy({ ...taxonomy, classificationId: event.target.value })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2">{classifications.map((item) => <option key={item.id} value={item.id}>{item.name}{item.level ? ` (${item.level.replaceAll("_", " ")})` : ""}</option>)}</select></label>
            <label><span className="text-sm font-semibold">Category</span><select aria-label="Category" value={taxonomy.categoryId ?? ""} disabled={!taxonomyEditable} onChange={(event) => editTaxonomy({ ...taxonomy, categoryId: event.target.value || null })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2"><option value="">Not assigned</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{categories.length === 0 && <span className="mt-1 block text-xs text-on-surface-variant">No active categories; the assignment may remain empty.</span>}</label>
            <label><span className="text-sm font-semibold">Department</span><select aria-label="Department" value={taxonomy.departmentId ?? ""} disabled={!taxonomyEditable} onChange={(event) => editTaxonomy({ ...taxonomy, departmentId: event.target.value || null })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2"><option value="">Not assigned</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{departments.length === 0 && <span className="mt-1 block text-xs text-on-surface-variant">No active departments; the assignment may remain empty.</span>}</label>
          </div>}
        </fieldset>
        {draft.rules.length === 0 && <p className="rounded-xl border border-warning/30 bg-warning-container p-3 text-sm">This draft denies access unless inherited rules grant it. The backend also protects the last management path.</p>}
        <div className="space-y-4">
          {draft.rules.map((rule, index) => { const ownerReadOnly = !isOwner && rule.subject.type === "owner"; const isOwnerRule = rule.subject.type === "owner"; return <fieldset key={rule.ruleId} className={`rounded-xl border p-4 ${ownerReadOnly ? "border-primary/30 bg-primary/5" : "border-outline-variant/40"}`}><legend className="px-2 font-semibold">Rule {index + 1}{ownerReadOnly ? " (Protected owner rule)" : ""}</legend>
            <div className="grid gap-3 sm:grid-cols-3"><label><span className="text-xs font-semibold">Effect</span><select value={rule.effect} disabled={ownerReadOnly} onChange={(event) => updateRule(index, { effect: event.target.value as "allow" | "deny" })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2">{ownerReadOnly && <option>{rule.effect === "allow" ? "Allow" : "Deny"}</option>}{!ownerReadOnly && <><option value="allow">Allow</option><option value="deny">Deny</option></>}</select></label><label><span className="text-xs font-semibold">Subject</span><select value={rule.subject.type} disabled={ownerReadOnly || isOwnerRule} onChange={(event) => { const type = event.target.value as PolicySubjectType; updateRule(index, { subject: { type } }); }} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2">{(ownerReadOnly || isOwnerRule) && <option>{rule.subject.type === "owner" ? "Owner" : rule.subject.type.replaceAll("_", " ")}</option>}{!(ownerReadOnly || isOwnerRule) && (["user", "custom_role", "department", "owner", "tenant_member"] as const).map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>{ownerReadOnly ? <div className="text-sm text-on-surface-variant">Protected owner rule — only the document owner can modify it.</div> : ["user", "custom_role", "department"].includes(rule.subject.type) ? <label><span className="text-xs font-semibold">Subject record</span><select value={rule.subject.id ?? ""} onChange={(event) => updateRule(index, { subject: { ...rule.subject, id: event.target.value || undefined } })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2"><option value="">Select…</option>{subjectOptions(rule.subject.type).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label> : <div className="text-sm text-on-surface-variant">No subject ID required.</div>}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{DOCUMENT_ACCESS_ACTIONS.map((action) => { const isMinimumOwnerAction = isOwnerRule && OWNER_MINIMUM_ACTIONS.has(action); const disabled = ownerReadOnly || isMinimumOwnerAction; return <label key={action} className={`flex items-center gap-2 rounded-lg p-2 text-sm ${disabled ? "bg-surface-container-low text-on-surface-variant" : "bg-surface-container-low"}`}><input type="checkbox" checked={rule.actions.includes(action)} disabled={disabled} onChange={(event) => updateRule(index, { actions: event.target.checked ? [...rule.actions, action] : rule.actions.filter((item) => item !== action) })} />{action.replaceAll("_", " ")}{ownerReadOnly ? "" : isMinimumOwnerAction ? " (required)" : ""}</label>; })}</div>
            {ownerReadOnly ? <p className="mt-2 text-xs text-on-surface-variant">Protected owner rule — only the document owner can modify it.</p> : isOwnerRule ? <p className="mt-2 text-xs text-on-surface-variant">Owner rule: minimum actions (discover, read, download) are required. Subject type cannot be changed.</p> : <Button className="mt-3" size="sm" variant="danger" onClick={() => edit({ ...draft, rules: draft.rules.filter((_, itemIndex) => itemIndex !== index) })}>Remove rule</Button>}
          </fieldset>})}
        </div>
        <Button variant="outline" disabled={draft.rules.length >= 200} onClick={() => edit({ ...draft, rules: [...draft.rules, { ruleId: ruleId(), effect: "allow", subject: { type: "owner" }, actions: ["read"] }] })}>Add rule</Button>
        <div className="grid gap-3 sm:grid-cols-3"><label><span className="text-sm font-semibold">Effective from</span><input type="datetime-local" value={draft.effectiveFrom?.slice(0, 16) ?? ""} onChange={(event) => edit({ ...draft, effectiveFrom: event.target.value ? new Date(event.target.value).toISOString() : null })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label><label><span className="text-sm font-semibold">Effective until</span><input type="datetime-local" value={draft.effectiveUntil?.slice(0, 16) ?? ""} onChange={(event) => edit({ ...draft, effectiveUntil: event.target.value ? new Date(event.target.value).toISOString() : null })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label><label><span className="text-sm font-semibold">Change reason</span><input maxLength={500} value={draft.reason ?? ""} onChange={(event) => edit({ ...draft, reason: event.target.value || null })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label></div>
        {invalid && <p role="alert" className="text-sm text-error">Correct incomplete or duplicate rules and the date interval before previewing.</p>}
        {error && <PolicyEditorError kind={error} onPreview={() => void doPreview()} onReload={() => void reloadPointer()} />}
        {preview && <ImpactSummary preview={preview} />}
      </div>
      <div className="flex flex-wrap justify-end gap-3 border-t border-outline-variant/30 p-4"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="outline" disabled={invalid || Boolean(busy)} isLoading={busy === "preview"} onClick={() => void doPreview()}>Preview changes</Button><Button disabled={!preview || preview.impact.direction === "no_change" && !preview.taxonomyChanged || Boolean(busy)} isLoading={busy === "apply"} onClick={requestApply}>{preview?.impact.direction === "no_change" && !preview.taxonomyChanged ? "No effective change" : "Apply preview"}</Button></div>
    </div>
    {confirmOpen && preview && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" role="alertdialog" aria-modal="true" aria-labelledby="sensitive-title"><div className="w-full max-w-md rounded-2xl bg-surface p-6"><h3 id="sensitive-title" className="text-title-lg font-bold">Confirm sensitive access broadening</h3><p className="mt-2 text-sm text-on-surface-variant">Sensitivity: {preview.taxonomy.classificationLevel.replaceAll("_", " ")}. The backend reports a {preview.impact.direction} change with {preview.impact.usersGainingAny} user(s) gaining access.</p><p className="mt-2 text-sm">Actions gaining access: {DOCUMENT_ACCESS_ACTIONS.filter((action) => preview.impact.byAction[action].gained > 0).map((action) => action.replaceAll("_", " ")).join(", ") || "none"}.</p><p className="mt-2 text-xs text-on-surface-variant">Document content is never included here.</p><label className="mt-4 flex items-start gap-2"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I understand this broadens access to a sensitive document.</span></label><div className="mt-6 flex justify-end gap-3"><Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button><Button disabled={!acknowledged} isLoading={busy === "apply"} onClick={() => void doApply(true)}>Confirm and apply</Button></div></div></div>}
  </div>;
}

function ImpactSummary({ preview }: { preview: PolicyPreview }) {
  const changed = DOCUMENT_ACCESS_ACTIONS.filter((action) => preview.impact.byAction[action].gained || preview.impact.byAction[action].lost);
  return <section aria-live="polite" className="rounded-xl border border-primary/20 bg-primary/5 p-4"><h3 className="font-bold">Backend impact: {preview.impact.direction.replaceAll("_", " ")}</h3><p className="mt-1 text-sm">Version {preview.currentPolicyVersion} → {preview.proposedPolicyVersion}; {preview.impact.usersGainingAny} gaining, {preview.impact.usersLosingAny} losing any access.</p><p className="text-sm">Taxonomy: {preview.taxonomy.classificationName}; {preview.taxonomy.categoryName ?? "no category"}; {preview.taxonomy.departmentName ?? "no department"}{preview.taxonomyChanged ? " (changed)" : ""}.</p><p className="text-sm">Rules: +{preview.impact.ruleDelta.added} / −{preview.impact.ruleDelta.removed}. Expires {new Date(preview.previewExpiresAt).toLocaleString()}.</p>{changed.length > 0 && <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{changed.map((action) => <li key={action}>{action.replaceAll("_", " ")}: +{preview.impact.byAction[action].gained} / −{preview.impact.byAction[action].lost}</li>)}</ul>}</section>;
}
function PolicyEditorError({ kind, onPreview, onReload }: { kind: string; onPreview: () => void; onReload: () => void }) {
  const message: Record<string, string> = { version_conflict: "The active policy changed. Your draft is preserved; close, reload the policy, and preview it again.", preview_expired: "The preview expired. Preview the unchanged draft again.", preview_invalid: "The preview artifact is invalid. Create a new preview.", preview_mismatch: "The preview no longer matches this draft. Create a new preview.", invalid_reference: "A selected subject is stale or unavailable. Correct the draft.", invalid_inheritance: "The inheritance reference is no longer valid.", idempotency_conflict: "This operation identity was used for another request. Re-preview before applying.", invalid_draft: "The backend rejected this draft. Review its rules and dates.", owner_rule_protected: "Only the document owner may modify the owner rule.", taxonomy_protected: "Only the document owner or a Company Admin may change document taxonomy.", network: "The response was lost. Retry apply without editing to reuse the same operation identity." };
  return <div role="alert" className="rounded-xl bg-error-container p-3 text-sm text-on-error-container"><p>{message[kind] ?? "The policy request could not be completed safely."}</p>{["preview_expired", "preview_invalid", "preview_mismatch"].includes(kind) && <Button className="mt-2" size="sm" variant="outline" onClick={onPreview}>Preview again</Button>}{kind === "version_conflict" && <Button className="mt-2" size="sm" variant="outline" onClick={onReload}>Reload pointer and preserve draft</Button>}</div>;
}
