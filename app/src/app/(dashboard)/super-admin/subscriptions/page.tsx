"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui/DashboardPage";
import { PlatformState, PlatformTable, StatusPill, cell, usePlatformData } from "@/components/super-admin/platform-ui";
import { SubscriptionOperationDialog } from "@/components/super-admin/subscription-operation-dialog";
import { getSubscriptionDetail, listPackages, listSubscriptions } from "@/services/super-admin.service";
import { listTenants } from "@/services/platform.service";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { syncSubscriptionFromStripe } from "@/services/billing.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import type { PlatformSubscription, PlatformSubscriptionDetail, SubscriptionOperationAction } from "@/types/api/super-admin.types";

const loadData = async (signal?: AbortSignal) => {
  const [subscriptions, packages, tenants] = await Promise.all([
    listSubscriptions(signal), listPackages(signal),
    listTenants({ page: 1, pageSize: 100, search: "", status: "", plan: "" }, signal),
  ]);
  return { data: { subscriptions: subscriptions.data, packages: packages.data, tenants: tenants.data.tenants } };
};

export default function SubscriptionsPage() {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
  const permissions = usePermissions();
  const canRead = permissions.can(Permission.BILLING_READ);
  const canManage = permissions.can(Permission.BILLING_MANAGE);
  const state = usePlatformData(loadData);
  const [tenantId, setTenantId] = useState("");
  const [detail, setDetail] = useState<PlatformSubscriptionDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [packageId, setPackageId] = useState("");
  const [targetStatus, setTargetStatus] = useState("");
  const [operation, setOperation] = useState<SubscriptionOperationAction | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [syncingProvider, setSyncingProvider] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");
  const [page, setPage] = useState(1);
  const existing = detail?.subscription ?? null;

  useEffect(() => {
    if (!tenantId) { setDetail(null); setDetailError(""); return; }
    const controller = new AbortController();
    setDetail(null); setDetailError(""); setPackageId(""); setTargetStatus("");
    void getSubscriptionDetail(tenantId, controller.signal).then((response) => setDetail(response.data)).catch((caught) => {
      if (!controller.signal.aborted) setDetailError(caught instanceof Error ? caught.message : t("superAdmin.subsLoadDetailError"));
    });
    return () => controller.abort();
  }, [tenantId, state.data]);

  const subscriptionByTenant = useMemo(() => new Map(state.data?.subscriptions.map((item) => [item.tenantId._id, item]) ?? []), [state.data]);
  const activePackages = state.data?.packages.filter((pkg) => pkg.active) ?? [];
  const selectedPackage = activePackages.find((pkg) => pkg._id === packageId);
  const filteredSubscriptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (state.data?.subscriptions ?? []).filter((item) =>
      (!query || item.tenantId.name.toLowerCase().includes(query) || item.tenantId.slug.toLowerCase().includes(query)) &&
      (!statusFilter || item.status === statusFilter),
    );
  }, [search, state.data, statusFilter]);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredSubscriptions.length / pageSize));
  const visibleSubscriptions = filteredSubscriptions.slice((page - 1) * pageSize, page * pageSize);
  const reload = async () => { await state.reload(); if (tenantId) setDetail((await getSubscriptionDetail(tenantId)).data); };
  const syncFromStripe = async () => {
    if (!tenantId || !existing?.providerManaged) return;
    setSyncingProvider(true); setSyncNotice("");
    try {
      await syncSubscriptionFromStripe(tenantId);
      await reload();
      setSyncNotice(t("superAdmin.subsSyncSuccess"));
    } catch (caught) {
      setSyncNotice(caught instanceof Error ? caught.message : t("superAdmin.subsSyncFailed"));
    } finally {
      setSyncingProvider(false);
    }
  };

  if (permissions.status === "ready" && !canRead) return <DashboardPage><DashboardPageHeader title={t("superAdmin.subsTitle")} description={t("superAdmin.subsShortDesc")} /><DashboardPanel><p role="alert">{t("superAdmin.subsNoPermission")}</p></DashboardPanel></DashboardPage>;

  return <DashboardPage>
    <DashboardPageHeader title={t("superAdmin.subsTitle")} description={t("superAdmin.subsDesc")} />
    <PlatformState loading={state.loading} error={state.error} onRetry={state.reload} />
    {canManage && state.data ? <DashboardPanel className="mb-5">
      <h2 className="text-title-lg font-bold">{t("superAdmin.subsOperation")}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-bold">{t("superAdmin.tableCompany")}
          <select value={tenantId} onChange={(event) => setTenantId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3">
            <option value="">{t("superAdmin.subsSelectCompany")}</option>
            {state.data.tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{t("superAdmin.subsTenantOption", { name: tenant.name, state: subscriptionByTenant.has(tenant.id) ? t("superAdmin.subsSubscriptionExists") : t("superAdmin.subsNoSubscriptionShort") })}</option>)}
          </select>
        </label>
        <label className="text-sm font-bold">{t("superAdmin.subsActivePackage")}
          <select value={packageId} onChange={(event) => setPackageId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3">
            <option value="">{t("superAdmin.subsSelectPackage")}</option>
            {activePackages.map((pkg) => <option key={pkg._id} value={pkg._id}>{pkg.name} v{pkg.version}</option>)}
          </select>
        </label>
      </div>
      {detailError ? <p role="alert" className="mt-3 text-error">{detailError}</p> : null}
      {tenantId && detail ? <div className="mt-4 rounded-lg bg-surface-container p-4">
        {existing ? <>
          <p><strong>{t("superAdmin.subsCurrentLabel")}</strong> {t("superAdmin.subsCurrentSummary", { package: existing.packageId.name, version: String(existing.packageVersion), status: codeLabel(t, "superAdmin.subsStatus", existing.status), revision: String(existing.version) })}</p>
          <p><strong>{t("superAdmin.subsProviderOwnershipLabel")}</strong> {existing.providerManaged ? t("superAdmin.subsProviderManagedNote") : t("superAdmin.subsManualLocal")}</p>
          <p><strong>{t("superAdmin.subsPeriodLabel")}</strong> {t("superAdmin.subsPeriodRange", { start: existing.periodStart ? new Date(existing.periodStart).toLocaleDateString(intlLocale) : "—", end: existing.periodEnd ? new Date(existing.periodEnd).toLocaleDateString(intlLocale) : "—" })}</p>
          <p><strong>{t("superAdmin.subsTrialEndLabel")}</strong> {existing.trialEnd ? new Date(existing.trialEnd).toLocaleDateString(intlLocale) : "—"} · <strong>{t("superAdmin.subsCancellationLabel")}</strong> {existing.cancelledAt ? new Date(existing.cancelledAt).toLocaleDateString(intlLocale) : "—"}</p>
          <label className="mt-3 block text-sm font-bold">{t("superAdmin.subsLegalTargetStatus")}
            <select value={targetStatus} onChange={(event) => setTargetStatus(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3">
              <option value="">{t("superAdmin.subsDoNotChangeStatus")}</option>
              {detail.legalTransitions.map((status) => <option key={status} value={status.toLowerCase()}>{codeLabel(t, "superAdmin.subsStatus", status)}</option>)}
            </select>
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            {existing.providerManaged ? <button type="button" disabled={syncingProvider} onClick={() => void syncFromStripe()} className="rounded-lg border border-primary px-4 py-2 font-bold text-primary disabled:opacity-50">{syncingProvider ? t("superAdmin.subsSynchronizing") : t("superAdmin.subsSyncFromStripe")}</button> : null}
            <button type="button" disabled={!packageId || packageId === existing.packageId._id} onClick={() => { setTargetStatus(""); setOperation("update"); }} className="rounded-lg bg-primary px-4 py-2 font-bold text-on-primary disabled:opacity-50">{t("superAdmin.subsChangePackage")}</button>
            <button type="button" disabled={!targetStatus} onClick={() => { setPackageId(""); setOperation("update"); }} className="rounded-lg bg-secondary px-4 py-2 font-bold text-on-secondary disabled:opacity-50">{t("superAdmin.subsChangeStatus")}</button>
          </div>
          {syncNotice ? <p className="mt-3 text-sm" aria-live="polite">{syncNotice}</p> : null}
        </> : <>
          <p>{t("superAdmin.subsNoSubscriptionForCompany")}</p>
          <button type="button" disabled={!packageId} onClick={() => { setTargetStatus((selectedPackage?.trialDays ?? 0) > 0 ? "trialing" : "active"); setOperation("provision"); }} className="mt-3 rounded-lg bg-primary px-4 py-2 font-bold text-on-primary disabled:opacity-50">{t("superAdmin.subsProvision")}</button>
        </>}
      </div> : null}
    </DashboardPanel> : null}
    {state.data ? <DashboardPanel className="mb-4"><div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-bold">{t("superAdmin.subsSearchCompanies")}<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3" /></label>
      <label className="text-sm font-bold">{t("superAdmin.tableStatus")}<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-lg border border-outline-variant bg-surface px-3"><option value="">{t("superAdmin.subsAllStatuses")}</option>{["trialing", "incomplete", "active", "past_due", "paused", "cancel_at_period_end", "canceled", "expired", "unpaid"].map((value) => <option key={value} value={value}>{codeLabel(t, "superAdmin.subsStatus", value)}</option>)}</select></label>
    </div></DashboardPanel> : null}
    {state.data?.subscriptions.length === 0 ? <DashboardPanel><p>{t("superAdmin.subsNone")}</p></DashboardPanel> : state.data && filteredSubscriptions.length === 0 ? <DashboardPanel><p>{t("superAdmin.subsNoMatch")}</p></DashboardPanel> : state.data ? <><PlatformTable headers={[t("superAdmin.tableCompany"), t("superAdmin.subsTablePackage"), t("superAdmin.subsTableVersion"), t("superAdmin.tableStatus"), t("superAdmin.subsTableOwnership"), t("superAdmin.subsTableRevision"), t("superAdmin.tableUpdated")]}>
      {visibleSubscriptions.map((item: PlatformSubscription) => <tr key={item._id}>
        <td className={cell}><strong>{item.tenantId.name}</strong><p className="text-xs">{item.tenantId.slug}</p></td>
        <td className={cell}>{item.packageId.name}</td><td className={cell}>v{item.packageVersion}</td>
        <td className={cell}><StatusPill value={item.status} label={codeLabel(t, "superAdmin.subsStatus", item.status)} /></td><td className={cell}>{item.providerManaged ? t("superAdmin.subsOwnershipProvider") : t("superAdmin.subsOwnershipLocal")}</td>
        <td className={cell}>{item.version}</td><td className={cell}>{new Date(item.updatedAt).toLocaleDateString(intlLocale)}</td>
      </tr>)}
    </PlatformTable><div className="mt-4 flex items-center justify-end gap-3"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded border px-3 py-2 disabled:opacity-50">{t("superAdmin.subsPrevious")}</button><span>{t("superAdmin.subsPageOf", { page: String(page), total: String(totalPages) })}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded border px-3 py-2 disabled:opacity-50">{t("superAdmin.subsNext")}</button></div></> : null}
    {operation && tenantId ? <SubscriptionOperationDialog tenantId={tenantId} existing={existing} action={operation} packageId={packageId || undefined} targetStatus={targetStatus || undefined} onClose={() => setOperation(null)} onSuccess={reload} /> : null}
  </DashboardPage>;
}
