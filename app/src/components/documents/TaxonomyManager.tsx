"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ClassificationBadge } from "@/components/documents/ClassificationBadge";
import { useI18n } from "@/providers/i18n-provider";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import type { ClassificationLevel, TaxonomyKind, TaxonomyView } from "@/types/api/document-policy.types";
import * as policyApi from "@/services/document-policy.service";

const KINDS: TaxonomyKind[] = ["categories", "departments", "classifications"];
const LEVELS: ClassificationLevel[] = ["internal", "restricted", "confidential", "highly_confidential"];

type FormState = { record: TaxonomyView | null; name: string; description: string; level: ClassificationLevel };

export function TaxonomyManager() {
  const { t } = useI18n();
  const permissions = usePermissions();
  const canMutate = permissions.can(Permission.COMPANY_SETTINGS_UPDATE);
  const [kind, setKind] = useState<TaxonomyKind>("categories");
  const [records, setRecords] = useState<TaxonomyView[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "archived" | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [confirm, setConfirm] = useState<{ record: TaxonomyView; action: "archive" | "restore" } | null>(null);
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const response = await policyApi.listTaxonomy(kind, { page, pageSize: 20, status, search }, signal);
      setRecords(response.data[kind] ?? []);
      setTotalPages(response.data.pagination.totalPages);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(policyApi.classifyPolicyError(cause));
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [kind, page, search, status]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => { setPage(1); }, [kind, search, status]);

  function closeDialog() { setForm(null); setConfirm(null); window.setTimeout(() => triggerRef.current?.focus(), 0); }
  async function submit() {
    if (!form || !form.name.trim() || form.name.trim().length > 200) return;
    setSaving(true); setError(null);
    try {
      const input = { name: form.name.trim(), description: form.description.trim() || null, ...(kind === "classifications" ? { level: form.level } : {}) };
      if (form.record) await policyApi.updateTaxonomy(kind, form.record.id, { ...input, version: form.record.version });
      else await policyApi.createTaxonomy(kind, input);
      closeDialog(); await load();
    } catch (cause) { const kind = policyApi.classifyPolicyError(cause); setError(kind === "taxonomy_duplicate" || kind === "taxonomy_archived" ? "taxonomy.duplicateError" : kind); }
    finally { setSaving(false); }
  }
  async function applyStatus() {
    if (!confirm) return;
    setSaving(true);
    try { await policyApi.changeTaxonomyStatus(kind, confirm.record.id, confirm.record.version, confirm.action); closeDialog(); await load(); }
    catch (cause) { setError(policyApi.classifyPolicyError(cause)); closeDialog(); }
    finally { setSaving(false); }
  }

  return (
    <section aria-labelledby="taxonomy-heading" className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
      <div className="border-b border-outline-variant/30 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="taxonomy-heading" className="text-title-lg font-bold text-primary">{t("taxonomy.title")}</h2><p className="mt-1 text-sm text-on-surface-variant">{t("taxonomy.authorityNote")}</p></div>
          {canMutate && <Button onClick={(event) => { triggerRef.current = event.currentTarget; setForm({ record: null, name: "", description: "", level: "internal" }); }}>{t("taxonomy.create")}</Button>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label={t("taxonomy.title")}>
          {KINDS.map((item) => <button key={item} role="tab" aria-selected={kind === item} onClick={() => setKind(item)} className={`rounded-full px-4 py-2 text-sm font-semibold ${kind === item ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"}`}>{t(`taxonomy.${item}`)}</button>)}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="flex-1"><span className="sr-only">{t("common.search")}</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("taxonomy.search")} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label>
          <label><span className="sr-only">{t("taxonomy.status")}</span><select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2"><option value="all">{t("taxonomy.all")}</option><option value="active">{t("taxonomy.active")}</option><option value="archived">{t("taxonomy.archived")}</option></select></label>
        </div>
      </div>

      {loading && <div className="p-8 text-center" role="status">{t("common.loading")}</div>}
      {!loading && error && <div className="p-8 text-center" role="alert"><p className="text-error">{t(error === "denied" ? "permissions.deniedMessage" : error === "taxonomy.duplicateError" ? error : "taxonomy.loadError")}</p><Button className="mt-3" variant="outline" onClick={() => void load()}>{t("common.retry")}</Button></div>}
      {!loading && !error && records.length === 0 && <div className="p-10 text-center text-on-surface-variant">{t("taxonomy.empty")}</div>}
      {!loading && !error && records.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b border-outline-variant/30"><th className="p-4 text-start">{t("taxonomy.name")}</th><th className="p-4 text-start">{t("taxonomy.status")}</th><th className="p-4 text-start">{t("taxonomy.version")}</th><th className="p-4 text-start">{t("taxonomy.updated")}</th><th className="p-4 text-end">{t("documents.tableActions")}</th></tr></thead><tbody>{records.map((record) => <tr key={record.id} className="border-b border-outline-variant/20"><td className="p-4"><span className="font-semibold">{record.name}</span>{record.level && <div className="mt-1"><ClassificationBadge level={record.level} /></div>}</td><td className="p-4">{t(`taxonomy.${record.status}`)}</td><td className="p-4">{record.version}</td><td className="p-4">{new Date(record.updatedAt).toLocaleDateString()}</td><td className="p-4 text-end">{canMutate ? <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={(event) => { triggerRef.current = event.currentTarget; setForm({ record, name: record.name, description: record.description ?? "", level: record.level ?? "internal" }); }}>{t("taxonomy.edit")}</Button><Button size="sm" variant={record.status === "active" ? "danger" : "outline"} onClick={(event) => { triggerRef.current = event.currentTarget; setConfirm({ record, action: record.status === "active" ? "archive" : "restore" }); }}>{t(`taxonomy.${record.status === "active" ? "archive" : "restore"}`)}</Button></div> : <span>{t("taxonomy.readOnly")}</span>}</td></tr>)}</tbody></table></div>}
      {totalPages > 1 && <div className="flex items-center justify-between p-4"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("common.back")}</Button><span>{page} / {totalPages}</span><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</Button></div>}

      {form && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="taxonomy-form-title" onKeyDown={(e) => e.key === "Escape" && closeDialog()}><div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl"><h3 id="taxonomy-form-title" className="text-title-lg font-bold">{form.record ? t("taxonomy.edit") : t("taxonomy.create")}</h3><label className="mt-4 block"><span className="text-sm font-semibold">{t("taxonomy.name")}</span><input autoFocus maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" aria-invalid={!form.name.trim()} /></label><label className="mt-4 block"><span className="text-sm font-semibold">{t("taxonomy.description")}</span><textarea maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label>{kind === "classifications" && <label className="mt-4 block"><span className="text-sm font-semibold">{t("taxonomy.level")}</span><select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as ClassificationLevel })} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2">{LEVELS.map((level) => <option key={level} value={level}>{t(`classification.${level}`)}</option>)}</select></label>}<div className="mt-6 flex justify-end gap-3"><Button variant="ghost" onClick={closeDialog}>{t("common.cancel")}</Button><Button disabled={!form.name.trim()} isLoading={saving} onClick={() => void submit()}>{t("common.save")}</Button></div></div></div>}
      {confirm && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" role="alertdialog" aria-modal="true" aria-labelledby="taxonomy-confirm-title"><div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl"><h3 id="taxonomy-confirm-title" className="text-title-lg font-bold">{t(`taxonomy.${confirm.action}Confirm`)}</h3><p className="mt-2 text-on-surface-variant">{confirm.record.name}</p><div className="mt-6 flex justify-end gap-3"><Button variant="ghost" onClick={closeDialog}>{t("common.cancel")}</Button><Button variant={confirm.action === "archive" ? "danger" : "primary"} isLoading={saving} onClick={() => void applyStatus()}>{t("common.confirm")}</Button></div></div></div>}
    </section>
  );
}
