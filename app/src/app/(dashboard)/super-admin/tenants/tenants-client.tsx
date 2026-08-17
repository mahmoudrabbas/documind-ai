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
  TENANT_STATUSES,
  type PlatformTenant,
  type TenantListQuery,
} from "@/types/api/platform.types";
import {
  type PlatformPackage,
  type PlatformSubscription,
  type SubscriptionStatus,
} from "@/types/api/super-admin.types";
import { listPackages, listSubscriptions } from "@/services/super-admin.service";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { AdminPagination } from "@/components/ui";
import { codeLabel } from "@/lib/i18n/code-label";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import { Badge, type BadgeStatus } from "@/components/ui";

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

/** Map API/domain subscription statuses to semantic design-system statuses. */
const SUBSCRIPTION_STATUS_BADGE_MAP: Record<
  SubscriptionStatus,
  BadgeStatus
> = {
  trialing: "info",
  incomplete: "warning",
  active: "success",
  past_due: "warning",
  paused: "neutral",
  cancel_at_period_end: "warning",
  canceled: "error",
  expired: "neutral",
  unpaid: "error",
};

function SubscriptionBadge({
  subscriptionStatus,
}: {
  subscriptionStatus: SubscriptionStatus;
}) {
  const { t } = useI18n();

  const badgeStatus = SUBSCRIPTION_STATUS_BADGE_MAP[subscriptionStatus];
  const label = codeLabel(
    t,
    "superAdmin.subsStatus",
    subscriptionStatus,
  );

  return <Badge status={badgeStatus} label={label} />;
}

export type TenantsView = "companies" | "tenants";
export interface TenantsClientProps {
  /** Page-scoped column/terminology variant. Defaults to the legacy
   * tenant view so the shared component stays byte-for-byte equivalent for
   * the platform tenants page; the Super Admin Companies page opts in. */
  view?: TenantsView;
}

export function TenantsClient({ view = "tenants" }: TenantsClientProps) {
  const isCompaniesView = view === "companies";
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
            ? isCompaniesView
              ? "superAdmin.companies.noPermission"
              : "superAdmin.tenants.noPermission"
            : isCompaniesView
              ? "superAdmin.companies.loadError"
              : "superAdmin.tenants.loadError",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [query, isCompaniesView],
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

  const [packages, setPackages] = useState<PlatformPackage[] | undefined>(
    undefined,
  );
  const [packagesError, setPackagesError] = useState("");

  useEffect(() => {
    if (!canReadBilling) {
      setPackages(undefined);
      setPackagesError("");
      return;
    }
    listPackages()
      .then((res) => {
        setPackages(res.data);
        setPackagesError("");
      })
      .catch(() => {
        setPackages([]);
        setPackagesError("superAdmin.companies.loadingError");
      });
  }, [canReadBilling]);

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

  async function save(update: { status?: "active" | "trial" | "suspended" }) {
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

  const filtered = Boolean(query.search || query.status || query.plan || query.packageId);
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
      <p className="mt-6 font-semibold text-on-surface" aria-live="polite">
        {loading
          ? isCompaniesView
            ? t("superAdmin.companies.loadingCount")
            : t("superAdmin.tenants.loadingCount")
          : isCompaniesView
            ? tPlural("superAdmin.companies.count", pagination.totalRecords)
            : tPlural("superAdmin.tenants.count", pagination.totalRecords)}
      </p>
      <section
        aria-label={
          isCompaniesView
            ? t("superAdmin.companies.filtersLabel")
            : t("superAdmin.tenants.filtersLabel")
        }
        className="mt-4 grid gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 sm:gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end"
      >
        <label className="text-sm font-medium text-on-surface-variant">
          {isCompaniesView
            ? t("superAdmin.companies.searchLabel")
            : t("superAdmin.tenants.searchLabel")}
          <input
            aria-label={
              isCompaniesView
                ? t("superAdmin.companies.searchLabel")
                : t("superAdmin.tenants.searchLabel")
            }
            value={searchDraft}
            maxLength={120}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder={t("superAdmin.tenants.searchPlaceholder")}
            className="mt-1 block h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="text-sm font-medium text-on-surface-variant">
          {t("superAdmin.tableStatus")}
          <select
            value={query.status}
            onChange={(e) =>
              navigate(
                { status: e.target.value as TenantListQuery["status"] },
                true,
              )
            }
            className="mt-1 block h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 focus:ring-2 focus:ring-primary"
          >
            <option value="">{t("superAdmin.tenants.allStatuses")}</option>
            {TENANT_STATUSES.map((v) => (
              <option key={v} value={v}>
                {codeLabel(t, "superAdmin.tenantStatus", v)}
              </option>
            ))}
          </select>
        </label>
        {isCompaniesView ? (
          <label className="text-sm font-medium text-on-surface-variant">
            {t("superAdmin.companies.plan")}
            <select
              value={query.packageId ?? ""}
              onChange={(e) =>
                navigate(
                  {
                    packageId:
                      e.target.value === ""
                        ? ""
                        : (e.target.value as string),
                  },
                  true,
                )
              }
              className="mt-1 block h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 focus:ring-2 focus:ring-primary"
            >
              <option value="">{t("superAdmin.companies.allPlans")}</option>
              {packages?.map((pkg) => (
                <option key={pkg._id} value={pkg._id}>
                  {pkg.name}
                </option>
              ))}
              {packagesError ? (
                <option value="" disabled>
                  {t(packagesError)}
                </option>
              ) : null}
            </select>
          </label>
        ) : (
          <label className="text-sm font-medium text-on-surface-variant">
            {t("superAdmin.tenants.planLegacy")}
            <select
              value={query.plan}
              onChange={(e) =>
                navigate(
                  { plan: e.target.value as TenantListQuery["plan"] },
                  true,
                )
              }
              className="mt-1 block h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 focus:ring-2 focus:ring-primary"
            >
              <option value="">{t("superAdmin.tenants.allPlans")}</option>
              {(["free", "trial", "pro"] as const).map((v) => (
                <option key={v} value={v}>
                  {codeLabel(t, "superAdmin.tenantPlan", v)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
onClick={() => {
              setSearchDraft("");
              navigate({ search: "", status: "", plan: "", packageId: "" }, true);
            }}
          disabled={!filtered}
          className="h-11 rounded-xl border border-outline-variant bg-surface px-4 font-semibold disabled:opacity-50"
        >
          {t("superAdmin.tenants.clearFilters")}
        </button>
      </section>
      <div aria-live="polite" className="mt-4 min-h-6 text-sm text-on-surface-variant">
        {notice ? t(notice) : null}
      </div>
      {loading ? (
        <div role="status" className="mt-4 space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-20 animate-pulse rounded-xl bg-surface-container"
            />
          ))}
          <span className="sr-only">
            {isCompaniesView
              ? t("superAdmin.companies.loading")
              : t("superAdmin.tenants.loading")}
          </span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-error/20 bg-error-container/10 p-6"
        >
          <p className="text-on-error-container">{t(error)}</p>
          <button
            onClick={() => void load()}
            className="mt-3 rounded-lg bg-error px-4 py-2 font-semibold text-white"
          >
            {t("common.retry")}
          </button>
        </div>
      ) : tenants.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-outline-variant/40 p-10 text-center">
          <h2 className="font-semibold text-on-surface">
            {filtered
              ? isCompaniesView
                ? t("superAdmin.companies.noMatch")
                : t("superAdmin.tenants.noMatch")
              : isCompaniesView
                ? t("superAdmin.companies.noneYet")
                : t("superAdmin.tenants.noneYet")}
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {filtered
              ? isCompaniesView
                ? t("superAdmin.companies.noMatchHint")
                : t("superAdmin.tenants.noMatchHint")
              : isCompaniesView
                ? t("superAdmin.companies.noneYetHint")
                : t("superAdmin.tenants.noneYetHint")}
          </p>
        </div>
      ) : isCompaniesView ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-outline-variant/40">
          <table className="w-full min-w-[960px] border-collapse text-start text-sm">
            <thead className="bg-surface-container-low text-on-surface">
              <tr>
                <th
                  scope="col"
                  className="sticky start-0 z-20 bg-surface-container-low px-4 py-3 font-semibold whitespace-nowrap border-e border-outline-variant/40"
                >
                  {t("superAdmin.tableCompany")}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 font-semibold whitespace-nowrap"
                >
                  {t("superAdmin.tableStatus")}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 font-semibold whitespace-nowrap"
                >
                  {t("superAdmin.companies.plan")}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 font-semibold whitespace-nowrap"
                >
                  {t("superAdmin.companies.subscription")}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 font-semibold text-end whitespace-nowrap"
                >
                  {t("superAdmin.companies.users")}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 font-semibold text-end whitespace-nowrap"
                >
                  {t("superAdmin.documents")}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 font-semibold text-end whitespace-nowrap"
                >
                  {t("superAdmin.platformTenants.questions")}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 font-semibold whitespace-nowrap"
                >
                  {t("superAdmin.tableCreated")}
                </th>
                <th
                  scope="col"
                  className="sticky end-0 z-20 bg-surface-container-low px-4 py-3 font-semibold whitespace-nowrap text-center border-s border-outline-variant/40"
                >
                  {t("superAdmin.tableActions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const sub = subscriptionByTenant.get(tenant.id);
                return (
                  <tr key={tenant.id} className="border-t border-outline-variant/40">
                    <td className="max-w-56 sticky start-0 z-10 bg-surface-container-lowest px-4 py-4 border-e border-outline-variant/40">
                      <p className="truncate font-semibold text-on-surface">
                        {tenant.name}
                      </p>
                      <p className="truncate text-on-surface-variant">{tenant.slug}</p>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="rounded-full bg-tertiary-container/20 px-2.5 py-1 font-medium text-on-tertiary-container">
                        {codeLabel(t, "superAdmin.tenantStatus", tenant.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {tenant.effectivePackageName ?? "—"}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {sub ? (
                        <SubscriptionBadge subscriptionStatus={sub.status} />
                      ) : (
                        <span className="text-outline">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-end">{tenant.stats.users}</td>
                    <td className="px-4 py-4 text-end">
                      {tenant.stats.documents}
                    </td>
                    <td className="px-4 py-4 text-end">
                      {tenant.stats.questions}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {formatDate(tenant.createdAt, intlLocale)}
                    </td>
                    <td className="sticky end-0 z-10 bg-surface-container-lowest px-4 py-4 border-s border-outline-variant/40">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/super-admin/companies/${tenant.id}`}
                          className="inline-flex items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-sm font-medium text-on-surface hover:bg-surface-container-low"
                        >
                          {t("superAdmin.companies.viewAction")}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-outline-variant/40">
          <table className="w-full min-w-[1200px] border-collapse text-start text-sm">
            <thead className="bg-surface-container-low text-on-surface">
              <tr>
                {TABLE_HEADER_KEYS.map((headerKey) => (
                  <th
                    key={headerKey}
                    scope="col"
                    className="px-4 py-3 font-semibold whitespace-nowrap"
                  >
                    {t(headerKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const sub = subscriptionByTenant.get(tenant.id);
                return (
                  <tr key={tenant.id} className="border-t border-outline-variant/40">
                    <td className="max-w-56 px-4 py-4">
                      <p className="truncate font-semibold text-on-surface">
                        {tenant.name}
                      </p>
                      <p className="truncate text-on-surface-variant">{tenant.slug}</p>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="rounded-full bg-tertiary-container/20 px-2.5 py-1 font-medium text-on-tertiary-container">
                        {codeLabel(t, "superAdmin.tenantStatus", tenant.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {sub ? (
                        (() => {
                          const subStatus = sub.status;
                          return (
                            <SubscriptionBadge
                              subscriptionStatus={subStatus}
                            />
                          );
                        })()
                      ) : (
                        <span className="text-outline">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {sub ? (
                        <span className="font-medium text-on-surface">
                          {sub.packageId?.name ?? "—"}
                        </span>
                      ) : (
                        <span className="text-outline">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-on-surface-variant">
                      {sub?.currentPeriodStart
                        ? formatDate(sub.currentPeriodStart, intlLocale)
                        : sub?.periodStart
                          ? formatDate(sub.periodStart, intlLocale)
                          : "—"}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-on-surface-variant">
                      {sub?.currentPeriodEnd
                        ? formatDate(sub.currentPeriodEnd, intlLocale)
                        : sub?.periodEnd
                          ? formatDate(sub.periodEnd, intlLocale)
                          : "—"}
                    </td>
                    <td className="px-4 py-4 text-on-surface-variant">
                      {codeLabel(t, "superAdmin.tenantPlan", tenant.plan)}
                      <span
                        className="ms-1 text-[10px] text-outline"
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
                          className="cursor-pointer rounded-lg bg-primary px-3 py-2 font-semibold text-on-primary hover:opacity-90 active:scale-95 transition-all duration-150"
                        >
                          Open
                        </Link>
                        {canManageTenant ? (
                        <button
                          type="button"
                          onClick={() => {
                            setNotice("");
                            setEditing(tenant);
                          }}
                          aria-label={t("superAdmin.tenants.manageTenant", { name: tenant.name })}
                          className="cursor-pointer rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 font-semibold text-on-surface hover:bg-surface-container-low hover:border-outline active:scale-95 transition-all duration-150"
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
        <div className="sticky bottom-0 z-10">
          <AdminPagination
            currentPage={query.page}
            totalPages={Math.max(1, pagination.totalPages)}
            onPageChange={(p) => navigate({ page: p })}
          />
        </div>
      ) : null}
      {editing && canManageTenant ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/30 p-4"
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
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-4 shadow-xl outline-none sm:p-6"
          >
            <h2 id="tenant-dialog-title" className="text-xl font-bold">
              {t("superAdmin.tenants.manageTenant", { name: editing.name })}
            </h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              {t("superAdmin.tenants.statusChangeNote")}
            </p>
            <div className="mt-5 grid gap-3">
              {subscriptionByTenant.has(editing.id) ? (
                <div className="rounded-lg bg-tertiary-container/20 p-3 text-sm text-on-tertiary-container">
                  <strong className="font-semibold">
                    {t("superAdmin.companies.subscriptionLabel")}
                  </strong>{" "}
                  {subscriptionByTenant.get(editing.id)!.packageId?.name ?? "—"}{" "}
                  &middot;{" "}
                  {(() => {
                    const editingSubStatus = subscriptionByTenant.get(
                      editing.id,
                    )!.status;
                    return (
                      <SubscriptionBadge
                        subscriptionStatus={editingSubStatus}
                      />
                    );
                  })()}
                  <p className="mt-1 text-on-tertiary-container">
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
                <p className="text-sm text-on-surface-variant">
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
                  className="rounded-lg bg-error px-4 py-2 font-semibold text-white disabled:opacity-40"
                >
                  {t("superAdmin.tenants.confirmSuspend")}
                </button>
                <button
                  disabled={pending || editing.status === "active"}
                  onClick={() => void save({ status: "active" })}
                  className="rounded-lg bg-success px-4 py-2 font-semibold text-white disabled:opacity-40"
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
