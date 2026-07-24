"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { DOCUMENT_ACCESS_ACTIONS, type ActivePolicy, type PolicyDraft, type PolicyPreview, type PolicySubjectType, type PolicyTaxonomySelection, type PolicyTaxonomySummary } from "@/types/api/document-policy.types";
import * as policyApi from "@/services/document-policy.service";
import type { PolicyEditorSubject, PolicyEditorClassification } from "@/types/api/document-policy.types";
import { useAuth } from "@/providers/auth-provider";

function draftFrom(policy: ActivePolicy): PolicyDraft {
  return { rules: policy.rules.map((rule) => ({ ...rule, actions: [...rule.actions], subject: { ...rule.subject } })), inherits: policy.inherits ?? null, effectiveFrom: policy.effectiveFrom, effectiveUntil: policy.effectiveUntil ?? null, reason: policy.provenance.reason ?? null };
}
function ruleId() { const value = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; return `rule-${value}`.slice(0, 120); }

const ACTION_GROUPS = [
  { label: "Visibility & consumption", actions: ["discover", "read", "download", "use_in_ai"] as const },
  { label: "Content lifecycle", actions: ["update", "replace", "reprocess"] as const },
  { label: "Document state", actions: ["archive", "restore", "delete"] as const },
  { label: "Administration", actions: ["manage_access"] as const },
] as const;

const ACTION_LABELS: Record<string, string> = {
  discover: "Discover",
  read: "Read",
  download: "Download",
  use_in_ai: "Use in AI",
  update: "Update",
  replace: "Replace",
  reprocess: "Reprocess",
  archive: "Archive",
  restore: "Restore",
  delete: "Delete",
  manage_access: "Manage access",
};

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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="policy-editor-title" onKeyDown={(event) => event.key === "Escape" && !busy && onClose()}>
      <div className="flex max-h-[calc(100vh-1rem)] w-full max-w-5xl flex-col rounded-2xl bg-surface-container-lowest shadow-modal sm:max-h-[calc(100vh-2rem)]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
          <div>
            <h2 id="policy-editor-title" className="text-title-lg font-bold text-on-surface">Edit access policy</h2>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">Current version {active.policyVersion}. Preview is required before apply.</p>
          </div>
          <button ref={closeRef} aria-label="Close policy editor" onClick={onClose} className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">

          {optionsError && <Alert variant="error" title="Failed to load options"><p>Policy editor options could not be loaded.</p><Button className="mt-3" size="sm" variant="secondary" onClick={() => setOptionsReload((value) => value + 1)}>Retry loading options</Button></Alert>}
          {optionsLoading && <div role="status" className="flex items-center gap-2 rounded-lg bg-surface-container-low px-4 py-3 text-body-sm text-on-surface-variant"><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />Loading policy editor options…</div>}

          {/* Document taxonomy section */}
          <fieldset className={`rounded-xl border p-4 sm:p-5 ${!taxonomyEditable ? "border-outline-variant/40 bg-surface-container-low" : "border-outline-variant/40"}`}>
            <legend className="px-2 text-label-md font-semibold text-on-surface">Document taxonomy</legend>
            <p className="mb-3 text-body-sm text-on-surface-variant">Taxonomy and access rules are previewed and applied as one versioned policy change.</p>
            {!taxonomyEditable && (
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-surface-container px-3 py-2">
                <span className="material-symbols-outlined mt-0.5 text-[18px] text-on-surface-variant" aria-hidden="true">lock</span>
                <p className="text-body-sm text-on-surface-variant">Document taxonomy can only be changed by the document owner or a Company Admin.</p>
              </div>
            )}
            {optionsLoading && <div role="status" className="rounded-lg bg-surface-container-low px-3 py-2 text-body-sm text-on-surface-variant">Loading active taxonomy options…</div>}
            {optionsError && <Alert variant="error"><p>Taxonomy options could not be loaded.</p><Button className="mt-2" size="sm" variant="secondary" onClick={() => setOptionsReload((value) => value + 1)}>Retry taxonomy</Button></Alert>}
            {!optionsLoading && !optionsError && classifications.length === 0 && <Alert variant="warning">No active classifications are available. Create or restore one before changing this policy.</Alert>}
            {!optionsLoading && !optionsError && classifications.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Select label="Classification / sensitivity" aria-label="Classification / sensitivity" value={taxonomy.classificationId} disabled={!taxonomyEditable} onChange={(event) => editTaxonomy({ ...taxonomy, classificationId: event.target.value })} options={classifications.map((item) => ({ value: item.id, label: `${item.name}${item.level ? ` (${item.level.replaceAll("_", " ")})` : ""}` }))} />
                <Select label="Category" aria-label="Category" value={taxonomy.categoryId ?? ""} disabled={!taxonomyEditable} onChange={(event) => editTaxonomy({ ...taxonomy, categoryId: event.target.value || null })} options={[{ value: "", label: "Not assigned" }, ...categories.map((item) => ({ value: item.id, label: item.name }))]} helperText={categories.length === 0 ? "No active categories; the assignment may remain empty." : undefined} />
                <Select label="Department" aria-label="Department" value={taxonomy.departmentId ?? ""} disabled={!taxonomyEditable} onChange={(event) => editTaxonomy({ ...taxonomy, departmentId: event.target.value || null })} options={[{ value: "", label: "Not assigned" }, ...departments.map((item) => ({ value: item.id, label: item.name }))]} helperText={departments.length === 0 ? "No active departments; the assignment may remain empty." : undefined} />
              </div>
            )}
          </fieldset>

          {draft.rules.length === 0 && (
            <Alert variant="warning">This draft denies access unless inherited rules grant it. The backend also protects the last management path.</Alert>
          )}

          {/* Access rules */}
          <div className="space-y-4">
            <h3 className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">Access rules</h3>
            {draft.rules.map((rule, index) => {
              const ownerReadOnly = !isOwner && rule.subject.type === "owner";
              const isOwnerRule = rule.subject.type === "owner";
              return (
                <fieldset key={rule.ruleId} className={`rounded-xl border p-4 sm:p-5 ${ownerReadOnly ? "border-primary/20 bg-primary/[0.03]" : "border-outline-variant/40"}`}>
                  <legend className="px-2 text-label-md font-semibold text-on-surface">
                    Rule {index + 1}{ownerReadOnly ? <span className="ms-2 text-on-surface-variant">(Protected owner rule)</span> : ""}
                  </legend>

                  {ownerReadOnly ? (
                    <div className="mb-3 flex items-start gap-2 rounded-lg bg-surface-container px-3 py-2.5">
                      <span className="material-symbols-outlined mt-0.5 text-[18px] text-primary" aria-hidden="true">lock</span>
                      <div>
                        <p className="text-body-sm font-medium text-on-surface">Protected owner rule</p>
                        <p className="text-body-sm text-on-surface-variant">Only the document owner can modify optional owner permissions.</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Select label="Effect" value={rule.effect} disabled={ownerReadOnly} onChange={(event) => updateRule(index, { effect: event.target.value as "allow" | "deny" })} options={ownerReadOnly ? [{ value: rule.effect, label: rule.effect === "allow" ? "Allow" : "Deny" }] : [{ value: "allow", label: "Allow" }, { value: "deny", label: "Deny" }]} />
                    <Select label="Subject" value={rule.subject.type} disabled={ownerReadOnly || isOwnerRule} onChange={(event) => { const type = event.target.value as PolicySubjectType; updateRule(index, { subject: { type } }); }} options={(ownerReadOnly || isOwnerRule) ? [{ value: rule.subject.type, label: rule.subject.type === "owner" ? "Owner" : rule.subject.type.replaceAll("_", " ") }] : (["user", "custom_role", "department", "owner", "tenant_member"] as const).map((type) => ({ value: type, label: type.replaceAll("_", " ") }))} />
                    {ownerReadOnly ? (
                      <div className="flex items-center text-body-sm text-on-surface-variant">Protected owner rule — only the document owner can modify it.</div>
                    ) : ["user", "custom_role", "department"].includes(rule.subject.type) ? (
                      <Select label="Subject record" value={rule.subject.id ?? ""} onChange={(event) => updateRule(index, { subject: { ...rule.subject, id: event.target.value || undefined } })} options={[{ value: "", label: "Select…" }, ...subjectOptions(rule.subject.type).map((option) => ({ value: option.id, label: option.name }))]} />
                    ) : (
                      <div className="flex items-center text-body-sm text-on-surface-variant">No subject ID required.</div>
                    )}
                  </div>

                  {/* Action permissions grid — grouped */}
                  <div className="mt-4 space-y-3">
                    {ACTION_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className="mb-1.5 text-label-sm font-medium text-on-surface-variant">{group.label}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
                          {group.actions.map((action) => {
                            const isMinimumOwnerAction = isOwnerRule && OWNER_MINIMUM_ACTIONS.has(action);
                            const disabled = ownerReadOnly || isMinimumOwnerAction;
                            return (
                              <Checkbox
                                key={action}
                                label={`${ACTION_LABELS[action] ?? action}${ownerReadOnly ? "" : isMinimumOwnerAction ? " (required)" : ""}`}
                                checked={rule.actions.includes(action)}
                                disabled={disabled}
                                onChange={(event) => updateRule(index, { actions: event.target.checked ? [...rule.actions, action] : rule.actions.filter((item) => item !== action) })}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {ownerReadOnly ? (
                    <p className="mt-2 text-body-sm text-on-surface-variant">Protected owner rule — only the document owner can modify it.</p>
                  ) : isOwnerRule ? (
                    <p className="mt-2 text-body-sm text-on-surface-variant">Owner rule: minimum actions (discover, read, download) are required. Subject type cannot be changed.</p>
                  ) : (
                    <div className="mt-3 flex justify-end">
                      <Button className="mt-3" size="sm" variant="ghost" onClick={() => edit({ ...draft, rules: draft.rules.filter((_, itemIndex) => itemIndex !== index) })}>
                        <span className="material-symbols-outlined me-1 text-[16px]" aria-hidden="true">remove_circle_outline</span>
                        Remove rule
                      </Button>
                    </div>
                  )}
                </fieldset>
              );
            })}
          </div>

          <Button variant="outline" disabled={draft.rules.length >= 200} onClick={() => edit({ ...draft, rules: [...draft.rules, { ruleId: ruleId(), effect: "allow", subject: { type: "owner" }, actions: ["read"] }] })}>
            <span className="material-symbols-outlined me-1 text-[16px]" aria-hidden="true">add_circle_outline</span>
            Add rule
          </Button>

          {/* Effective dates & reason */}
          <fieldset className="rounded-xl border border-outline-variant/40 p-4 sm:p-5">
            <legend className="px-2 text-label-md font-semibold text-on-surface">Schedule &amp; reason</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-label-md text-on-surface-variant">Effective from</span>
                <input type="datetime-local" value={draft.effectiveFrom?.slice(0, 16) ?? ""} onChange={(event) => edit({ ...draft, effectiveFrom: event.target.value ? new Date(event.target.value).toISOString() : null })} className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface placeholder:text-outline disabled:bg-surface-container disabled:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-label-md text-on-surface-variant">Effective until</span>
                <input type="datetime-local" value={draft.effectiveUntil?.slice(0, 16) ?? ""} onChange={(event) => edit({ ...draft, effectiveUntil: event.target.value ? new Date(event.target.value).toISOString() : null })} className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface placeholder:text-outline disabled:bg-surface-container disabled:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-label-md text-on-surface-variant">Change reason</span>
                <input maxLength={500} value={draft.reason ?? ""} onChange={(event) => edit({ ...draft, reason: event.target.value || null })} className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface placeholder:text-outline disabled:bg-surface-container disabled:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              </label>
            </div>
          </fieldset>

          {invalid && <Alert variant="error">Correct incomplete or duplicate rules and the date interval before previewing.</Alert>}
          {error && <PolicyEditorError kind={error} onPreview={() => void doPreview()} onReload={() => void reloadPointer()} />}
          {preview && <ImpactSummary preview={preview} />}
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/30 bg-surface-container-lowest px-6 py-4">
          <div className="text-body-sm text-on-surface-variant">
            {draft.rules.length} rule{draft.rules.length !== 1 ? "s" : ""} in draft
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="secondary" disabled={invalid || Boolean(busy)} isLoading={busy === "preview"} onClick={() => void doPreview()}>Preview changes</Button>
            <Button disabled={!preview || preview.impact.direction === "no_change" && !preview.taxonomyChanged || Boolean(busy)} isLoading={busy === "apply"} onClick={requestApply}>{preview?.impact.direction === "no_change" && !preview.taxonomyChanged ? "No effective change" : "Apply preview"}</Button>
          </div>
        </div>
      </div>

      {/* Sensitive broadening confirmation dialog */}
      {confirmOpen && preview && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" role="alertdialog" aria-modal="true" aria-labelledby="sensitive-title">
          <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-modal">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined mt-0.5 text-[24px] text-warning" aria-hidden="true">warning</span>
              <div>
                <h3 id="sensitive-title" className="text-title-lg font-bold text-on-surface">Confirm sensitive access broadening</h3>
                <div className="mt-2 flex items-center gap-2">
                  <Badge status="error" icon="shield_lock">{preview.taxonomy.classificationLevel.replaceAll("_", " ")}</Badge>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-body-sm text-on-surface-variant">
              <p>The backend reports a <strong>{preview.impact.direction}</strong> change with <strong>{preview.impact.usersGainingAny}</strong> user(s) gaining access.</p>
              <p>Actions gaining access: <strong>{DOCUMENT_ACCESS_ACTIONS.filter((action) => preview.impact.byAction[action].gained > 0).map((action) => ACTION_LABELS[action] ?? action.replaceAll("_", " ")).join(", ") || "none"}</strong>.</p>
              <p className="text-body-sm text-on-surface-variant">Document content is never included here.</p>
            </div>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant/40 bg-surface-container-low px-4 py-3 transition-colors hover:bg-surface-container">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-outline-variant text-primary focus:ring-2 focus:ring-primary/30" />
              <span className="text-body-sm text-on-surface">I understand this broadens access to a sensitive document.</span>
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button variant="warning" disabled={!acknowledged} isLoading={busy === "apply"} onClick={() => void doApply(true)}>Confirm and apply</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImpactSummary({ preview }: { preview: PolicyPreview }) {
  const directionLabel = preview.impact.direction.replaceAll("_", " ");
  const directionColor = preview.impact.direction === "broadening" || preview.impact.direction === "mixed" ? "warning" : preview.impact.direction === "tightening" ? "info" : "success";
  const changed = DOCUMENT_ACCESS_ACTIONS.filter((action) => preview.impact.byAction[action].gained || preview.impact.byAction[action].lost);

  return (
    <section aria-live="polite" className={`rounded-xl border p-4 ${directionColor === "warning" ? "border-warning/20 bg-warning-container/40" : directionColor === "info" ? "border-info/20 bg-info-container/40" : "border-success/20 bg-success-container/40"}`}>
      <div className="flex items-center gap-2">
        <span className={`material-symbols-outlined text-[18px] ${directionColor === "warning" ? "text-warning" : directionColor === "info" ? "text-info" : "text-success"}`} aria-hidden="true">
          {directionColor === "warning" ? "trending_up" : directionColor === "info" ? "trending_down" : "check_circle"}
        </span>
        <h3 className="text-label-md font-semibold uppercase tracking-wide text-on-surface">Backend impact: {directionLabel}</h3>
      </div>
      <div className="mt-3 grid gap-2 text-body-sm sm:grid-cols-3">
        <div className="rounded-lg bg-surface-container-low px-3 py-2">
          <p className="text-label-sm text-on-surface-variant">Version transition</p>
          <p className="font-medium text-on-surface">{preview.currentPolicyVersion} → {preview.proposedPolicyVersion}</p>
        </div>
        <div className="rounded-lg bg-surface-container-low px-3 py-2">
          <p className="text-label-sm text-on-surface-variant">Users gaining access</p>
          <p className="font-medium text-on-surface">{preview.impact.usersGainingAny}</p>
        </div>
        <div className="rounded-lg bg-surface-container-low px-3 py-2">
          <p className="text-label-sm text-on-surface-variant">Users losing access</p>
          <p className="font-medium text-on-surface">{preview.impact.usersLosingAny}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-body-sm sm:grid-cols-3">
        <div className="rounded-lg bg-surface-container-low px-3 py-2">
          <p className="text-label-sm text-on-surface-variant">Taxonomy</p>
          <p className="font-medium text-on-surface">{preview.taxonomy.classificationName}; {preview.taxonomy.categoryName ?? "no category"}; {preview.taxonomy.departmentName ?? "no department"}{preview.taxonomyChanged ? " (changed)" : ""}</p>
        </div>
        <div className="rounded-lg bg-surface-container-low px-3 py-2">
          <p className="text-label-sm text-on-surface-variant">Rule delta</p>
          <p className="font-medium text-on-surface">+{preview.impact.ruleDelta.added} / −{preview.impact.ruleDelta.removed}</p>
        </div>
        <div className="rounded-lg bg-surface-container-low px-3 py-2">
          <p className="text-label-sm text-on-surface-variant">Preview expires</p>
          <p className="font-medium text-on-surface">{new Date(preview.previewExpiresAt).toLocaleString()}</p>
        </div>
      </div>
      {changed.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-label-sm font-medium text-on-surface-variant">Per-action changes</p>
          <ul className="grid gap-1 text-body-sm sm:grid-cols-2">
            {changed.map((action) => (
              <li key={action} className="flex items-center gap-2">
                <span className="text-on-surface">{ACTION_LABELS[action] ?? action.replaceAll("_", " ")}</span>
                <span className="text-on-surface-variant">+{preview.impact.byAction[action].gained} / −{preview.impact.byAction[action].lost}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function PolicyEditorError({ kind, onPreview, onReload }: { kind: string; onPreview: () => void; onReload: () => void }) {
  const message: Record<string, string> = { version_conflict: "The active policy changed. Your draft is preserved; close, reload the policy, and preview it again.", preview_expired: "The preview expired. Preview the unchanged draft again.", preview_invalid: "The preview artifact is invalid. Create a new preview.", preview_mismatch: "The preview no longer matches this draft. Create a new preview.", invalid_reference: "A selected subject is stale or unavailable. Correct the draft.", invalid_inheritance: "The inheritance reference is no longer valid.", idempotency_conflict: "This operation identity was used for another request. Re-preview before applying.", invalid_draft: "The backend rejected this draft. Review its rules and dates.", owner_rule_protected: "Only the document owner may modify the owner rule.", taxonomy_protected: "Only the document owner or a Company Admin may change document taxonomy.", network: "The response was lost. Retry apply without editing to reuse the same operation identity." };
  return (
    <Alert variant="error" title="Policy error">
      <p>{message[kind] ?? "The policy request could not be completed safely."}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {["preview_expired", "preview_invalid", "preview_mismatch"].includes(kind) && <Button size="sm" variant="secondary" onClick={onPreview}>Preview again</Button>}
        {kind === "version_conflict" && <Button size="sm" variant="secondary" onClick={onReload}>Reload pointer and preserve draft</Button>}
      </div>
    </Alert>
  );
}
