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
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import { createEditablePolicyRule, draftFromPolicy, EDITABLE_POLICY_SUBJECT_TYPES, IDENTIFIED_POLICY_SUBJECT_TYPES, immutableOwnerRuleId, OWNER_MINIMUM_ACTIONS, policyRulesInvalid } from "@/lib/document-policy-editor";

function ruleId() { const value = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; return `rule-${value}`.slice(0, 120); }

const ACTION_GROUPS = [
  { groupKey: "visibilityAndConsumption", actions: ["discover", "read", "download", "use_in_ai"] as const },
  { groupKey: "contentLifecycle", actions: ["update", "replace", "reprocess"] as const },
  { groupKey: "documentState", actions: ["archive", "restore", "delete"] as const },
  { groupKey: "administration", actions: ["manage_access"] as const },
] as const;

export function PolicyEditor({ documentId, active, taxonomy: currentTaxonomy, onApplied, onClose }: { documentId: string; active: ActivePolicy; taxonomy: PolicyTaxonomySummary; onApplied: () => Promise<void>; onClose: () => void }) {
  const { t, tPlural } = useI18n();
  const intlLocale = useIntlLocale();
  const auth = useAuth();
  const currentUserId = auth.status === "authenticated" ? auth.user.id : null;
  const [draft, setDraft] = useState<PolicyDraft>(() => draftFromPolicy(active));
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
  const ownerRuleId = useMemo(() => immutableOwnerRuleId(active), [active]);

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
  const invalid = useMemo(() => {
    if (!taxonomy.classificationId || optionsLoading || optionsError || draft.rules.length > 200 || draft.reason && draft.reason.length > 500) return true;
    if (draft.effectiveFrom && draft.effectiveUntil && Date.parse(draft.effectiveUntil) <= Date.parse(draft.effectiveFrom)) return true;
    return policyRulesInvalid(draft, ownerRuleId);
  }, [draft, ownerRuleId, taxonomy.classificationId, optionsError, optionsLoading]);

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
            <h2 id="policy-editor-title" className="text-title-lg font-bold text-on-surface">{t("documents.editAccessPolicy")}</h2>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">{t("documents.currentVersionDesc", { version: String(active.policyVersion) })}</p>
          </div>
          <button ref={closeRef} aria-label={t("documents.closePolicyEditor")} onClick={onClose} className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">

          {optionsError && <Alert variant="error" title={t("documents.failedToLoadOptions")}><p>{t("documents.policyEditorOptionsError")}</p><Button className="mt-3" size="sm" variant="secondary" onClick={() => setOptionsReload((value) => value + 1)}>{t("documents.retryLoadingOptions")}</Button></Alert>}
          {optionsLoading && <div role="status" className="flex items-center gap-2 rounded-lg bg-surface-container-low px-4 py-3 text-body-sm text-on-surface-variant"><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />{t("documents.loadingPolicyEditorOptions")}</div>}

          {/* Document taxonomy section */}
          <fieldset className={`rounded-xl border p-4 sm:p-5 ${!taxonomyEditable ? "border-outline-variant/40 bg-surface-container-low" : "border-outline-variant/40"}`}>
            <legend className="px-2 text-label-md font-semibold text-on-surface">{t("documents.documentTaxonomyTitle")}</legend>
            <p className="mb-3 text-body-sm text-on-surface-variant">{t("documents.taxonomyNote")}</p>
            {!taxonomyEditable && (
              <div className="mb-3 flex items-start gap-2 rounded-lg bg-surface-container px-3 py-2">
                <span className="material-symbols-outlined mt-0.5 text-[18px] text-on-surface-variant" aria-hidden="true">lock</span>
                <p className="text-body-sm text-on-surface-variant">{t("documents.taxonomyOwnerOnly")}</p>
              </div>
            )}
            {optionsLoading && <div role="status" className="rounded-lg bg-surface-container-low px-3 py-2 text-body-sm text-on-surface-variant">{t("documents.loadingActiveTaxonomyOptions")}</div>}
            {optionsError && <Alert variant="error"><p>{t("documents.taxonomyOptionsError")}</p><Button className="mt-2" size="sm" variant="secondary" onClick={() => setOptionsReload((value) => value + 1)}>{t("documents.retryTaxonomy")}</Button></Alert>}
            {!optionsLoading && !optionsError && classifications.length === 0 && <Alert variant="warning">{t("documents.noActiveClassifications")}</Alert>}
            {!optionsLoading && !optionsError && classifications.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Select label={t("documents.classificationSensitivity")} aria-label={t("documents.classificationSensitivity")} value={taxonomy.classificationId} disabled={!taxonomyEditable} onChange={(event) => editTaxonomy({ ...taxonomy, classificationId: event.target.value })} options={classifications.map((item) => ({ value: item.id, label: `${item.name}${item.level ? ` (${item.level.replaceAll("_", " ")})` : ""}` }))} />
                <Select label={t("documents.categoryLabel")} aria-label={t("documents.categoryLabel")} value={taxonomy.categoryId ?? ""} disabled={!taxonomyEditable} onChange={(event) => editTaxonomy({ ...taxonomy, categoryId: event.target.value || null })} options={[{ value: "", label: t("documents.notAssigned") }, ...categories.map((item) => ({ value: item.id, label: item.name }))]} helperText={categories.length === 0 ? t("documents.noActiveCategories") : undefined} />
                <Select label={t("documents.departmentLabel")} aria-label={t("documents.departmentLabel")} value={taxonomy.departmentId ?? ""} disabled={!taxonomyEditable} onChange={(event) => editTaxonomy({ ...taxonomy, departmentId: event.target.value || null })} options={[{ value: "", label: t("documents.notAssigned") }, ...departments.map((item) => ({ value: item.id, label: item.name }))]} helperText={departments.length === 0 ? t("documents.noActiveDepartments") : undefined} />
              </div>
            )}
          </fieldset>

          {draft.rules.length === 0 && (
            <Alert variant="warning">{t("documents.draftDeniesWarning")}</Alert>
          )}

          {/* Access rules */}
          <div className="space-y-4">
            <h3 className="text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">{t("documents.accessRulesTitle")}</h3>
            {draft.rules.map((rule, index) => {
              const isOwnerRule = rule.ruleId === ownerRuleId;
              const ownerReadOnly = !isOwner && isOwnerRule;
              return (
                <fieldset key={rule.ruleId} className={`rounded-xl border p-4 sm:p-5 ${ownerReadOnly ? "border-primary/20 bg-primary/[0.03]" : "border-outline-variant/40"}`}>
                  <legend className="px-2 text-label-md font-semibold text-on-surface">
                    {t("documents.ruleNumber", { number: String(index + 1) })}{ownerReadOnly ? <span className="ms-2 text-on-surface-variant">({t("documents.protectedOwnerRule")})</span> : ""}
                  </legend>

                  {ownerReadOnly ? (
                    <div className="mb-3 flex items-start gap-2 rounded-lg bg-surface-container px-3 py-2.5">
                      <span className="material-symbols-outlined mt-0.5 text-[18px] text-primary" aria-hidden="true">lock</span>
                      <div>
                        <p className="text-body-sm font-medium text-on-surface">{t("documents.protectedOwnerRule")}</p>
                        <p className="text-body-sm text-on-surface-variant">{t("documents.protectedOwnerRuleNote")}</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Select label={t("documents.effect")} value={rule.effect} disabled={ownerReadOnly} onChange={(event) => updateRule(index, { effect: event.target.value as "allow" | "deny" })} options={ownerReadOnly ? [{ value: rule.effect, label: rule.effect === "allow" ? t("documents.allow") : t("documents.deny") }] : [{ value: "allow", label: t("documents.allow") }, { value: "deny", label: t("documents.deny") }]} />
                    <Select label={t("documents.subject")} value={rule.subject.type} disabled={isOwnerRule} onChange={(event) => { const type = event.target.value as PolicySubjectType; updateRule(index, { subject: { type } }); }} options={isOwnerRule ? [{ value: "owner", label: t("documents.subjectLabel.owner") }] : EDITABLE_POLICY_SUBJECT_TYPES.map((type) => ({ value: type, label: t(`documents.subjectLabel.${type}`) }))} />
                    {ownerReadOnly ? (
                      <div className="flex items-center text-body-sm text-on-surface-variant">{t("documents.protectedOwnerRuleDesc")}</div>
                    ) : IDENTIFIED_POLICY_SUBJECT_TYPES.has(rule.subject.type) ? (
                      <SearchableSubjectSelect ruleId={rule.ruleId} type={rule.subject.type} value={rule.subject.id ?? ""} options={subjectOptions(rule.subject.type)} onChange={(id) => updateRule(index, { subject: { ...rule.subject, id: id || undefined } })} />
                    ) : (
                      <div className="flex items-center text-body-sm text-on-surface-variant">{t("documents.noSubjectIdRequired")}</div>
                    )}
                  </div>

                  {/* Action permissions grid — grouped */}
                  <div className="mt-4 space-y-3">
                    {ACTION_GROUPS.map((group) => (
                      <div key={group.groupKey}>
                        <p className="mb-1.5 text-label-sm font-medium text-on-surface-variant">{t(`documents.${group.groupKey}`)}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
                          {group.actions.map((action) => {
                            const isMinimumOwnerAction = isOwnerRule && OWNER_MINIMUM_ACTIONS.has(action);
                            const disabled = ownerReadOnly || isMinimumOwnerAction;
                            const actionText = t(`documents.actionLabel.${action}`);
                            return (
                              <Checkbox
                                key={action}
                                label={`${actionText}${ownerReadOnly ? "" : isMinimumOwnerAction ? ` ${t("documents.requiredAction")}` : ""}`}
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
                    <p className="mt-2 text-body-sm text-on-surface-variant">{t("documents.protectedOwnerRuleDesc")}</p>
                  ) : isOwnerRule ? (
                    <p className="mt-2 text-body-sm text-on-surface-variant">{t("documents.ownerRuleRequirementNote")}</p>
                  ) : (
                    <div className="mt-3 flex justify-end">
                      <Button className="mt-3" size="sm" variant="ghost" onClick={() => edit({ ...draft, rules: draft.rules.filter((_, itemIndex) => itemIndex !== index) })}>
                        <span className="material-symbols-outlined me-1 text-[16px]" aria-hidden="true">remove_circle_outline</span>
                        {t("documents.removeRule")}
                      </Button>
                    </div>
                  )}
                </fieldset>
              );
            })}
          </div>

          <Button variant="outline" disabled={draft.rules.length >= 200} onClick={() => edit({ ...draft, rules: [...draft.rules, createEditablePolicyRule(ruleId())] })}>
            <span className="material-symbols-outlined me-1 text-[16px]" aria-hidden="true">add_circle_outline</span>
            {t("documents.addRule")}
          </Button>

          {/* Effective dates & reason */}
          <fieldset className="rounded-xl border border-outline-variant/40 p-4 sm:p-5">
            <legend className="px-2 text-label-md font-semibold text-on-surface">{t("documents.scheduleAndReason")}</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-label-md text-on-surface-variant">{t("documents.effectiveFrom")}</span>
                <input type="datetime-local" value={draft.effectiveFrom?.slice(0, 16) ?? ""} onChange={(event) => edit({ ...draft, effectiveFrom: event.target.value ? new Date(event.target.value).toISOString() : null })} className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface placeholder:text-outline disabled:bg-surface-container disabled:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-label-md text-on-surface-variant">{t("documents.effectiveUntil")}</span>
                <input type="datetime-local" value={draft.effectiveUntil?.slice(0, 16) ?? ""} onChange={(event) => edit({ ...draft, effectiveUntil: event.target.value ? new Date(event.target.value).toISOString() : null })} className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface placeholder:text-outline disabled:bg-surface-container disabled:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-label-md text-on-surface-variant">{t("documents.changeReason")}</span>
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
            {tPlural("documents.rulesInDraft", draft.rules.length, { count: String(draft.rules.length) })}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="secondary" disabled={invalid || Boolean(busy)} isLoading={busy === "preview"} onClick={() => void doPreview()}>{t("documents.previewChanges")}</Button>
            <Button disabled={!preview || preview.impact.direction === "no_change" && !preview.taxonomyChanged || Boolean(busy)} isLoading={busy === "apply"} onClick={requestApply}>{preview?.impact.direction === "no_change" && !preview.taxonomyChanged ? t("documents.noEffectiveChange") : t("documents.applyPreview")}</Button>
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
                <h3 id="sensitive-title" className="text-title-lg font-bold text-on-surface">{t("documents.confirmSensitiveBroadening")}</h3>
                <div className="mt-2 flex items-center gap-2">
                  <Badge status="error" icon="shield_lock">{preview.taxonomy.classificationLevel.replaceAll("_", " ")}</Badge>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-body-sm text-on-surface-variant">
              <p>{t("documents.sensitiveBroadeningSummary", { direction: preview.impact.direction, users: String(preview.impact.usersGainingAny) })}</p>
              <p>{t("documents.actionsGainingAccess", { actions: DOCUMENT_ACCESS_ACTIONS.filter((action) => preview.impact.byAction[action].gained > 0).map((action) => t(`documents.actionLabel.${action}`)).join(", ") || t("documents.none") })}</p>
              <p className="text-body-sm text-on-surface-variant">{t("documents.documentContentNeverIncluded")}</p>
            </div>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant/40 bg-surface-container-low px-4 py-3 transition-colors hover:bg-surface-container">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-outline-variant text-primary focus:ring-2 focus:ring-primary/30" />
              <span className="text-body-sm text-on-surface">{t("documents.understandBroadening")}</span>
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>{t("common.cancel")}</Button>
              <Button variant="warning" disabled={!acknowledged} isLoading={busy === "apply"} onClick={() => void doApply(true)}>{t("documents.confirmAndApply")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchableSubjectSelect({ ruleId: id, type, value, options, onChange }: { ruleId: string; type: PolicySubjectType; value: string; options: PolicyEditorSubject[]; onChange: (value: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const label = t(`documents.subjectLabel.${type}`).toLowerCase();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = normalizedQuery ? options.filter((option) => option.name.toLocaleLowerCase().includes(normalizedQuery)) : options;

  return (
    <div className="space-y-2">
      <label className="flex flex-col gap-1.5" htmlFor={`${id}-subject-search`}>
        <span className="text-label-md text-on-surface-variant">{t("documents.searchSubjectLabel", { subject: label })}</span>
        <input id={`${id}-subject-search`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("documents.searchTenantSubjectsPlaceholder", { subject: label })} className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </label>
      <Select label={t("documents.selectedSubjectLabel", { subject: label })} value={value} errorMessage={!value ? t("documents.selectSubjectError", { subject: label }) : undefined} onChange={(event) => onChange(event.target.value)} options={[{ value: "", label: t("common.loading") }, ...filtered.map((option) => ({ value: option.id, label: option.name }))]} />
    </div>
  );
}

function ImpactSummary({ preview }: { preview: PolicyPreview }) {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();

  const directionLabel = codeLabel(t, "documents.propagationStatus", preview.impact.direction);
  const directionColor = preview.impact.direction === "broadening" || preview.impact.direction === "mixed" ? "warning" : preview.impact.direction === "tightening" ? "info" : "success";
  const changed = DOCUMENT_ACCESS_ACTIONS.filter((action) => preview.impact.byAction[action].gained || preview.impact.byAction[action].lost);

  return (
    <section aria-live="polite" className={`rounded-xl border p-4 ${directionColor === "warning" ? "border-warning/20 bg-warning-container/40" : directionColor === "info" ? "border-info/20 bg-info-container/40" : "border-success/20 bg-success-container/40"}`}>
      <div className="flex items-center gap-2">
        <span className={`material-symbols-outlined text-[18px] ${directionColor === "warning" ? "text-warning" : directionColor === "info" ? "text-info" : "text-success"}`} aria-hidden="true">
          {directionColor === "warning" ? "trending_up" : directionColor === "info" ? "trending_down" : "check_circle"}
        </span>
        <h3 className="text-label-md font-semibold uppercase tracking-wide text-on-surface">{t("documents.backendImpact", { direction: directionLabel })}</h3>
      </div>
      <div className="mt-3 grid gap-2 text-body-sm sm:grid-cols-3">
        <div className="rounded-lg bg-surface-container-low px-3 py-2">
          <p className="text-label-sm text-on-surface-variant">{t("documents.versionTransition")}</p>
          <p className="font-medium text-on-surface">{preview.currentPolicyVersion} → {preview.proposedPolicyVersion}</p>
        </div>
        <div className="rounded-lg bg-surface-container-low px-3 py-2">
          <p className="text-label-sm text-on-surface-variant">{t("documents.usersGainingAccess")}</p>
          <p className="font-medium text-on-surface">{preview.impact.usersGainingAny}</p>
        </div>
        <div className="rounded-lg bg-surface-container-low px-3 py-2">
          <p className="text-label-sm text-on-surface-variant">{t("documents.usersLosingAccess")}</p>
          <p className="font-medium text-on-surface">{preview.impact.usersLosingAny}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-body-sm sm:grid-cols-3">
        <div className="rounded-lg bg-surface-container-low px-3 py-2">
          <p className="text-label-sm text-on-surface-variant">{t("taxonomy.title")}</p>
          <p className="font-medium text-on-surface">{preview.taxonomy.classificationName}; {preview.taxonomy.categoryName ?? t("documents.notAssigned")}; {preview.taxonomy.departmentName ?? t("documents.notAssigned")}{preview.taxonomyChanged ? ` (${t("taxonomy.updated")})` : ""}</p>
        </div>
        <div className="rounded-lg bg-surface-container-low px-3 py-2">
          <p className="text-label-sm text-on-surface-variant">{t("documents.ruleDelta")}</p>
          <p className="font-medium text-on-surface">+{preview.impact.ruleDelta.added} / −{preview.impact.ruleDelta.removed}</p>
        </div>
        <div className="rounded-lg bg-surface-container-low px-3 py-2">
          <p className="text-label-sm text-on-surface-variant">{t("documents.previewExpires")}</p>
          <p className="font-medium text-on-surface">{new Date(preview.previewExpiresAt).toLocaleString(intlLocale)}</p>
        </div>
      </div>
      {changed.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-label-sm font-medium text-on-surface-variant">{t("documents.perActionChanges")}</p>
          <ul className="grid gap-1 text-body-sm sm:grid-cols-2">
            {changed.map((action) => (
              <li key={action} className="flex items-center gap-2">
                <span className="text-on-surface">{t(`documents.actionLabel.${action}`)}</span>
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
  const { t } = useI18n();
  const message: Record<string, string> = { version_conflict: "The active policy changed. Your draft is preserved; close, reload the policy, and preview it again.", preview_expired: "The preview expired. Preview the unchanged draft again.", preview_invalid: "The preview artifact is invalid. Create a new preview.", preview_mismatch: "The preview no longer matches this draft. Create a new preview.", invalid_reference: "A selected subject is stale or unavailable. Correct the draft.", invalid_inheritance: "The inheritance reference is no longer valid.", idempotency_conflict: "This operation identity was used for another request. Re-preview before applying.", invalid_draft: "The backend rejected this draft. Review its rules and dates.", owner_rule_protected: "Only the document owner may modify the owner rule.", taxonomy_protected: "Only the document owner or a Company Admin may change document taxonomy.", network: "The response was lost. Retry apply without editing to reuse the same operation identity." };
  return (
    <Alert variant="error" title={t("documents.policyError")}>
      <p>{message[kind] ?? "The policy request could not be completed safely."}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {["preview_expired", "preview_invalid", "preview_mismatch"].includes(kind) && <Button size="sm" variant="secondary" onClick={onPreview}>{t("documents.previewAgain")}</Button>}
        {kind === "version_conflict" && <Button size="sm" variant="secondary" onClick={onReload}>{t("documents.reloadPointerAndPreserveDraft")}</Button>}
      </div>
    </Alert>
  );
}
