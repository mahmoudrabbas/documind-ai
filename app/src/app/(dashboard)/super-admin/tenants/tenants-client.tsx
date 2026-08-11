"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ApiError } from "@/lib/api-client";
import {
  buildTenantListSearch,
  listTenants,
  parseTenantListQuery,
  updateTenant,
} from "@/services/platform.service";
import {
  PAGE_SIZES,
  TENANT_STATUSES,
  type PlatformTenant,
  type TenantListQuery,
} from "@/types/api/platform.types";
import {
  type PlatformSubscription,
  type SubscriptionStatus,
  SUBSCRIPTION_STATUS_COLORS,
} from "@/types/api/super-admin.types";
import { listSubscriptions } from "@/services/super-admin.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";

/** Translation keys for the tenant table headers, in column order. */
const TABLE_HEADER_KEYS = [
  "superAdmin.tableTenant",
  "superAdmin.tableStatus",
  "superAdmin.companies.subscription",
  "superAdmin.tenants.colEffectivePlan",
  "superAdmin.tenants.colPeriodStart",
  "superAdmin.tenants.colPeriodEnd",
  "superAdmin.tenants.planLegacy",
  "superAdmin.companies.users",
  "superAdmin.documents",
  "superAdmin.platformTenants.questions",
  "superAdmin.tableCreated",
  "superAdmin.tableActions",
];

const formatDate = (value: string, locale?: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    new Date(value),
  );

/** Map subscription statuses to their Tailwind badge classes. */
function SubscriptionBadge({ status }: { status: SubscriptionStatus }) {
  const { t } = useI18n();
  const colorClass = SUBSCRIPTION_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-800";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${colorClass}`}
    >
      {codeLabel(t, "superAdmin.subsStatus", status)}
    </span>
  );
}

export function TenantsClient() {
  const { t, tPlural } = useI18n();
  const intlLocale = useIntlLocale();
  const permissions = usePermissions();
  const canReadBilling = permissions.can(Permission.BILLING_READ);
  const canManageTenant =
    permissions.can(Permission.COMPANY_SETTINGS_UPDATE) &&
    permissions.can(Permission.BILLING_MANAGE);
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useMemo(
    () => parseTenantListQuery(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const [searchDraft, setSearchDraft] = useState(query.search);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [subscriptions, setSubscriptions] = useState<PlatformSubscription[]>(
    [],
  );
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalPages: 0,
    totalRecords: 0,
  });
  const [loading, setLoading] = useState(true);
  /* `error` and `notice` hold translation keys, not sentences — they are
     rendered through `t()` so the message follows the active locale. */
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PlatformTenant | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  const navigate = useCallback(
    (changes: Partial<TenantListQuery>, resetPage = false) => {
      const next = {
        ...query,
        ...changes,
        page: resetPage ? 1 : (changes.page ?? query.page),
      };
      const target = `/super-admin/companies?${buildTenantListSearch(next)}`;
      if (target !== `/super-admin/companies?${searchParams.toString()}`)
        router.replace(target, { scroll: false });
    },
    [query, router, searchParams],
  );

  useEffect(() => {
    // Browser history changes are an external source and must restore the draft.
    setSearchDraft(query.search);
  }, [query.search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchDraft.trim().slice(0, 120) !== query.search)
        navigate({ search: searchDraft.trim().slice(0, 120) }, true);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft, query.search, navigate]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const tenantsRes = await listTenants(query, signal);
        setTenants(tenantsRes.data.tenants);
        setPagination(tenantsRes.data.pagination);
      } catch (caught) {
        if (signal?.aborted) return;
        setError(
          caught instanceof ApiError && caught.status === 403
            ? "superAdmin.tenants.noPermission"
            : "superAdmin.tenants.loadError",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    const controller = new AbortController();
    // The request owns subsequent state updates and is cancelled on URL changes.
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    // Subscriptions feed only the per-row badge (decorative), so they are
    // fetched once per BILLING_READ change instead of on every tenant
    // page/filter change (P-6).
    if (!canReadBilling) {
      setSubscriptions([]);
      return;
    }
    const controller = new AbortController();
    listSubscriptions({ page: 1, pageSize: 100 }, controller.signal)
      .then((subsRes) => {
        if (controller.signal.aborted) return;
        setSubscriptions(subsRes.data.subscriptions);
      })
      .catch(() => {
        // Badges degrade gracefully: on failure leave the list empty (the
        // badge renderer already handles missing entries with "—"). Never
        // surface this in the tenants error state — tenants still loaded fine.
        if (!controller.signal.aborted) setSubscriptions([]);
      });
    return () => controller.abort();
  }, [canReadBilling]);
  useEffect(() => {
    if (editing) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialogRef.current?.focus();
      const close = (event: KeyboardEvent) => {
        if (event.key === "Escape" && !pending) setEditing(null);
      };
      window.addEventListener("keydown", close);
      return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener("keydown", close);
      };
    }
  }, [editing, pending]);

  /** Derive current subscription for a tenant (latest by updatedAt). */
  const subscriptionByTenant = useMemo(() => {
    const map = new Map<string, PlatformSubscription>();
    for (const sub of subscriptions) {
      // Legacy rows may carry a null/dangling tenantId; such orphans must not
      // be attached to a tenant — the badge renderer shows "—" instead.
      if (!sub.tenantId) continue;
      const tid =
        typeof sub.tenantId === "string" ? sub.tenantId : sub.tenantId._id;
      const existing = map.get(tid);
      if (!existing || new Date(sub.updatedAt) > new Date(existing.updatedAt)) {
        map.set(tid, sub);
      }
    }
    return map;
  }, [subscriptions]);

  async function save(update: {
    status?: "active" | "trial" | "suspended";
  }) {
    if (!canManageTenant || !editing || pending) return;
    setPending(true);
    setNotice("");
    try {
      await updateTenant(editing.id, update);
      setEditing(null);
      setNotice("superAdmin.tenants.updateSuccess");
      await load();
    } catch {
      setNotice("superAdmin.tenants.updateError");
    } finally {
      setPending(false);
    }
  }

  const filtered = Boolean(query.search || query.status || query.plan);
  return (
    <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-4 py-6 sm:px-5 lg:px-8 lg:py-8 2xl:px-10">
      <header>
        <p className="text-sm font-semibold text-secondary">
          {t("superAdmin.tenants.eyebrow")}
        </p>
        <h1 className="mt-1 text-headline-lg-mobile font-bold text-primary sm:text-headline-lg">
          {t("superAdmin.tenants.title")}
        </h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          {t("superAdmin.tenants.description")}
        </p>
      </header>
      <p className="mt-6 font-semibold text-slate-800" aria-live="polite">
        {loading
          ? t("superAdmin.tenants.loadingCount")
          : tPlural("superAdmin.tenants.count", pagination.totalRecords)}
      </p>
      <section
        aria-label={t("superAdmin.tenants.filtersLabel")}
        className="mt-4 grid gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 sm:gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end"
      >
        <label className="text-sm font-medium text-slate-700">
          {t("superAdmin.tenants.searchLabel")}
          <input
            aria-label={t("superAdmin.tenants.searchLabel")}
            value={searchDraft}
            maxLength={120}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder={t("superAdmin.tenants.searchPlaceholder")}
            className="mt-1 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          {t("superAdmin.tableStatus")}
          <select
            value={query.status}
            onChange={(e) =>
              navigate(
                { status: e.target.value as TenantListQuery["status"] },
                true,
              )
            }
            className="mt-1 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t("superAdmin.tenants.allStatuses")}</option>
            {TENANT_STATUSES.map((v) => (
              <option key={v} value={v}>
                {codeLabel(t, "superAdmin.tenantStatus", v)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          {/* @deprecated tenant.plan — kept for backward compatibility */}
          {t("superAdmin.tenants.planLegacy")}
          <select
            value={query.plan}
            onChange={(e) =>
              navigate(
                { plan: e.target.value as TenantListQuery["plan"] },
                true,
              )
            }
            className="mt-1 block h-11 w-full rounded-xl border border-slate-300 bg-white px-3 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t("superAdmin.tenants.allPlans")}</option>
            {(["free", "trial", "pro"] as const).map((v) => (
              <option key={v} value={v}>
                {codeLabel(t, "superAdmin.tenantPlan", v)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setSearchDraft("");
            navigate({ search: "", status: "", plan: "" }, true);
          }}
          disabled={!filtered}
          className="h-11 rounded-xl border border-slate-300 bg-white px-4 font-semibold disabled:opacity-50"
        >
          {t("superAdmin.tenants.clearFilters")}
        </button>
      </section>
      <div aria-live="polite" className="mt-4 min-h-6 text-sm text-slate-700">
        {notice ? t(notice) : null}
      </div>
      {loading ? (
        <div role="status" className="mt-4 space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-20 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
          <span className="sr-only">{t("superAdmin.tenants.loading")}</span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-6"
        >
          <p className="text-red-800">{t(error)}</p>
          <button
            onClick={() => void load()}
            className="mt-3 rounded-lg bg-red-700 px-4 py-2 font-semibold text-white"
          >
            {t("common.retry")}
          </button>
        </div>
      ) : tenants.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <h2 className="font-semibold text-slate-900">
            {filtered
              ? t("superAdmin.tenants.noMatch")
              : t("superAdmin.tenants.noneYet")}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {filtered
              ? t("superAdmin.tenants.noMatchHint")
              : t("superAdmin.tenants.noneYetHint")}
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1200px] border-collapse text-start text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                {TABLE_HEADER_KEYS.map((headerKey) => (
                  <th key={headerKey} scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">
                    {t(headerKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const sub = subscriptionByTenant.get(tenant.id);
                return (
                  <tr key={tenant.id} className="border-t border-slate-200">
                    <td className="max-w-56 px-4 py-4">
                      <p className="truncate font-semibold text-slate-950">
                        {tenant.name}
                      </p>
                      <p className="truncate text-slate-500">{tenant.slug}</p>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-800">
                        {codeLabel(t, "superAdmin.tenantStatus", tenant.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {sub ? (
                        (() => {
                          const subStatus = sub.status;
                          return <SubscriptionBadge status={subStatus} />;
                        })()
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {sub ? (
                        <span className="font-medium text-slate-900">
                          {sub.packageId?.name ?? "—"}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-slate-600">
                      {sub?.currentPeriodStart
                        ? formatDate(sub.currentPeriodStart, intlLocale)
                        : sub?.periodStart
                          ? formatDate(sub.periodStart, intlLocale)
                          : "—"}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-slate-600">
                      {sub?.currentPeriodEnd
                        ? formatDate(sub.currentPeriodEnd, intlLocale)
                        : sub?.periodEnd
                          ? formatDate(sub.periodEnd, intlLocale)
                          : "—"}
                    </td>
                    <td className="px-4 py-4 text-slate-500">
                      {codeLabel(t, "superAdmin.tenantPlan", tenant.plan)}
                      <span
                        className="ms-1 text-[10px] text-slate-400"
                        title={t("superAdmin.tenants.deprecated")}
                      >
                        {t("superAdmin.tenants.legacySuffix")}
                      </span>
                    </td>
                    <td className="px-4 py-4">{tenant.stats.users}</td>
                    <td className="px-4 py-4">{tenant.stats.documents}</td>
                    <td className="px-4 py-4">{tenant.stats.questions}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {formatDate(tenant.createdAt, intlLocale)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <Link
                          href={`/super-admin/companies/${tenant.id}`}
                          className="rounded-lg bg-blue-700 px-3 py-2 font-semibold text-white"
                        >
                          Open
                        </Link>
                        {canManageTenant ? (
                        <button
                          onClick={() => {
                            setNotice("");
                            setEditing(tenant);
                          }}
                          aria-label={t("superAdmin.tenants.manageTenant", { name: tenant.name })}
                          className="rounded-lg border border-slate-300 px-3 py-2 font-semibold hover:bg-slate-50"
                        >
                          {t("superAdmin.packages.manage")}
                        </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && pagination.totalRecords > 0 ? (
        <nav
          aria-label={t("superAdmin.tenants.paginationLabel")}
          className="mt-5 flex flex-wrap items-center justify-between gap-4"
        >
          <label className="text-sm">
            {t("superAdmin.tenants.rowsPerPage")}{" "}
            <select
              value={query.pageSize}
              onChange={(e) =>
                navigate(
                  {
                    pageSize: Number(
                      e.target.value,
                    ) as TenantListQuery["pageSize"],
                  },
                  true,
                )
              }
              className="ms-2 rounded-lg border p-2"
            >
              {PAGE_SIZES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <button
              disabled={query.page <= 1}
              onClick={() => navigate({ page: query.page - 1 })}
              className="rounded-lg border px-3 py-2 disabled:opacity-40"
            >
              {t("common.previous")}
            </button>
            <span className="text-sm">
              {t("common.pageOf", {
                page: String(pagination.page),
                totalPages: String(Math.max(1, pagination.totalPages)),
              })}
            </span>
            <button
              disabled={query.page >= pagination.totalPages}
              onClick={() => navigate({ page: query.page + 1 })}
              className="rounded-lg border px-3 py-2 disabled:opacity-40"
            >
              {t("common.next")}
            </button>
          </div>
        </nav>
      ) : null}
      {editing && canManageTenant ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !pending) setEditing(null);
          }}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-dialog-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl outline-none sm:p-6"
          >
            <h2 id="tenant-dialog-title" className="text-xl font-bold">
              {t("superAdmin.tenants.manageTenant", { name: editing.name })}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {t("superAdmin.tenants.statusChangeNote")}
            </p>
            <div className="mt-5 grid gap-3">
              {subscriptionByTenant.has(editing.id) ? (
                <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
                  <strong className="font-semibold">
                    {t("superAdmin.companies.subscriptionLabel")}
                  </strong>{" "}
                  {subscriptionByTenant.get(editing.id)!.packageId?.name ??
                    "—"}{" "}
                  &middot;{" "}
                  {(() => {
                    const editingSubStatus = subscriptionByTenant.get(editing.id)!.status;
                    return <SubscriptionBadge status={editingSubStatus} />;
                  })()}
                  <p className="mt-1 text-blue-700">
                    Subscription managed via{" "}
                    <Link
                      href="/super-admin/subscriptions"
                      className="underline font-semibold"
                    >
                      Subscriptions page
                    </Link>
                    .
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No active subscription. Assign one via the{" "}
                  <Link
                    href="/super-admin/subscriptions"
                    className="underline font-semibold"
                  >
                    Subscriptions page
                  </Link>
                  .
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  disabled={pending || editing.status === "suspended"}
                  onClick={() => void save({ status: "suspended" })}
                  className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-40"
                >
                  {t("superAdmin.tenants.confirmSuspend")}
                </button>
                <button
                  disabled={pending || editing.status === "active"}
                  onClick={() => void save({ status: "active" })}
                  className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-40"
                >
                  {t("superAdmin.tenants.confirmActivate")}
                </button>
                <button
                  disabled={pending}
                  onClick={() => setEditing(null)}
                  className="rounded-lg border px-4 py-2 font-semibold"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
