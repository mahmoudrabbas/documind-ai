"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import { Button, ConfirmDialog, Input, Select } from "@/components/ui";
import { cell, PlatformTable } from "@/components/super-admin/platform-ui";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { ApiError } from "@/lib/api-client";
import {
  getTenantById,
  listTenants,
} from "@/services/platform.service";
import type { PlatformTenant } from "@/types/api/platform.types";
import {
  listOverrides,
  removeOverride,
  runReconciliation,
  setOverride,
} from "@/services/entitlement.service";
import type {
  QuotaOverride,
  ReconciliationRunReport,
} from "@/types/api/entitlement.types";

const DIMENSIONS = [
  "employees",
  "admins",
  "documents",
  "storageMb",
  "fileSizeMb",
  "queriesPerMonth",
  "tokensPerMonth",
  "ocrPagesPerMonth",
] as const;

const PAGE_SIZE = 20;

function CompanySearchSelect({
  label,
  value,
  onChange,
  allowAll = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (tenantId: string) => void;
  allowAll?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<PlatformTenant[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [lookupError, setLookupError] = useState("");

  /*
   * Resolve an existing tenant id back to its display name.
   * This matters when editing an already-created override.
   */
  useEffect(() => {
    if (!value) {
      if (!open) setQuery("");
      return;
    }

    const known = companies.find((company) => company.id === value);
    if (known) {
      if (!open) setQuery(known.name);
      return;
    }

    const controller = new AbortController();

    getTenantById(value, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;

        setCompanies((current) => {
          if (current.some((company) => company.id === response.data.id)) {
            return current;
          }
          return [response.data, ...current];
        });

        if (!open) setQuery(response.data.name);
      })
      .catch(() => {
        if (!controller.signal.aborted && !open) {
          setQuery(value);
        }
      });

    return () => controller.abort();
  }, [value, open, companies]);

  /*
   * Server-side company search with a short debounce.
   */
  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      setLoadingCompanies(true);
      setLookupError("");

      void listTenants(
        {
          page: 1,
          pageSize: 20,
          search: query.trim().slice(0, 120),
          status: "",
          plan: "",
        },
        controller.signal,
      )
        .then((response) => {
          if (!controller.signal.aborted) {
            setCompanies(response.data.tenants);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setLookupError("Unable to load companies.");
            setCompanies([]);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoadingCompanies(false);
          }
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const handleSelect = (company: PlatformTenant) => {
    onChange(company.id);
    setQuery(company.name);
    setOpen(false);
    setLookupError("");
  };

  return (
    <div className="relative">
      <label className="mb-1.5 block text-label-md font-medium text-on-surface">
        {label}
      </label>

      <div className="relative">
        <span
          aria-hidden="true"
          className="material-symbols-outlined pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[19px] text-on-surface-variant"
        >
          search
        </span>

        <input
          type="text"
          value={query}
          disabled={disabled}
          autoComplete="off"
          aria-expanded={open}
          aria-haspopup="listbox"
          placeholder={t("superAdmin.tenants.searchPlaceholder")}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 150);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange("");
            setOpen(true);
          }}
          className="min-h-11 w-full rounded-xl border border-outline-variant bg-surface px-10 py-2.5 text-body-md text-on-surface outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <span
          aria-hidden="true"
          className="material-symbols-outlined pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[19px] text-on-surface-variant"
        >
          expand_more
        </span>
      </div>

      {open ? (
        <div
          role="listbox"
          className="absolute z-50 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-1.5 shadow-xl"
        >
          {allowAll ? (
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange("");
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-[19px] text-on-surface-variant">
                domain
              </span>
              <div className="min-w-0">
                <p className="text-body-sm font-semibold text-on-surface">
                  All companies
                </p>
                <p className="text-label-sm text-on-surface-variant">
                  Run across every tenant
                </p>
              </div>
            </button>
          ) : null}

          {loadingCompanies ? (
            <div className="flex items-center gap-2 px-3 py-3 text-body-sm text-on-surface-variant">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Loading companies...
            </div>
          ) : null}

          {!loadingCompanies &&
          !lookupError &&
          companies.length === 0 ? (
            <p className="px-3 py-3 text-body-sm text-on-surface-variant">
              No companies found.
            </p>
          ) : null}

          {lookupError ? (
            <p className="px-3 py-3 text-body-sm text-error">
              {lookupError}
            </p>
          ) : null}

          {!loadingCompanies
            ? companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  role="option"
                  aria-selected={company.id === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(company)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-start transition hover:bg-surface-container"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-semibold text-on-surface">
                      {company.name}
                    </p>
                    <p className="truncate text-label-sm text-on-surface-variant">
                      {company.slug}
                    </p>
                  </div>

                  {company.id === value ? (
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined shrink-0 text-[19px] text-primary"
                    >
                      check
                    </span>
                  ) : null}
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

function humanizeDimension(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

export default function SuperAdminEntitlementPage() {
  const { dir, t } = useI18n();
  const intlLocale = useIntlLocale();

  /* ── Overrides list state ───────────────────────────────────────── */
  const [overrides, setOverrides] = useState<QuotaOverride[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 0,
    totalRecords: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  /* ── Create / update form state ─────────────────────────────────── */
  const [editing, setEditing] = useState<QuotaOverride | null>(null);
  const [form, setForm] = useState<{
    tenantId: string;
    dimension: string;
    limit: string;
    reason: string;
  }>({
    tenantId: "",
    dimension: DIMENSIONS[0],
    limit: "",
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  /* ── Delete confirm state ───────────────────────────────────────── */
  const [deleteTarget, setDeleteTarget] = useState<{
    tenantId: string;
    dimension: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* ── Reconciliation state ───────────────────────────────────────── */
  const [reconcileMode, setReconcileMode] = useState<"dry-run" | "execute">(
    "dry-run",
  );
  const [reconcileTenant, setReconcileTenant] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState("");
  const [reconcileResult, setReconcileResult] =
    useState<ReconciliationRunReport | null>(null);

  const load = useCallback(
    async (page: number, signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const response = await listOverrides(page, PAGE_SIZE, undefined, signal);
        setOverrides(response.data.overrides);
        setPagination(response.data.pagination);
      } catch (err) {
        if (signal?.aborted) return;
        setError(
          err instanceof ApiError && err.status === 403
            ? "You do not have permission to manage quota overrides."
            : t("entitlement.overridesFetchError"),
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(pagination.page, controller.signal);
    return () => controller.abort();
  }, [load, pagination.page]);

  /* ── Form handlers ──────────────────────────────────────────────── */

  const startEdit = (override: QuotaOverride) => {
    setEditing(override);
    setForm({
      tenantId: override.tenantId,
      dimension: override.dimension,
      limit: String(override.limit),
      reason: override.reason,
    });
    setFormError("");
    setNotice("");
  };

  const resetForm = () => {
    setEditing(null);
    setForm({ tenantId: "", dimension: DIMENSIONS[0], limit: "", reason: "" });
    setFormError("");
  };

  const handleSubmit = async () => {
    const tenantId = form.tenantId.trim();
    const limit = Number(form.limit);
    const reason = form.reason.trim();
    if (!tenantId) {
      setFormError(t("entitlement.formTenantRequired"));
      return;
    }
    if (!Number.isFinite(limit) || limit < 0) {
      setFormError(t("entitlement.formLimitInvalid"));
      return;
    }
    if (!reason) {
      setFormError(t("entitlement.formReasonRequired"));
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      await setOverride(tenantId, { dimension: form.dimension, limit, reason });
      setNotice(t("entitlement.overrideSaved"));
      resetForm();
      await load(pagination.page);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : t("entitlement.formError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removeOverride(deleteTarget.tenantId, deleteTarget.dimension);
      setNotice(t("entitlement.overrideDeleted"));
      setDeleteTarget(null);
      await load(pagination.page);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : t("entitlement.deleteError"),
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleReconcile = async () => {
    setReconciling(true);
    setReconcileError("");
    try {
      const response = await runReconciliation(
        reconcileMode,
        reconcileTenant.trim() || undefined,
      );
      setReconcileResult(response.data);
    } catch (err) {
      setReconcileResult(null);
      setReconcileError(
        err instanceof ApiError ? err.message : t("entitlement.reconcileError"),
      );
    } finally {
      setReconciling(false);
    }
  };

  return (
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        title={t("entitlement.pageTitle")}
        description={t("entitlement.pageDescription")}
      />

      {notice ? (
        <div
          role="status"
          className="mb-4 rounded-lg border border-success/20 bg-success-container p-3 text-sm text-on-success-container"
        >
          {notice}
        </div>
      ) : null}

      {/* ── Overrides table ─────────────────────────────────────────── */}
      <DashboardPanel className="p-4 sm:p-5">
        <h2 className="text-title-lg font-bold text-primary">
          {t("entitlement.overridesTitle")}
        </h2>

        {loading ? (
          <div className="mt-4 space-y-3" role="status">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-14 animate-pulse rounded-xl bg-surface-container"
              />
            ))}
            <span className="sr-only">{t("entitlement.loading")}</span>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-error/20 bg-error-container p-4 text-on-error-container"
          >
            <p>{error}</p>
            <Button
              variant="danger"
              size="sm"
              className="mt-3"
              onClick={() => void load(pagination.page)}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : overrides.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-outline-variant/40 p-10 text-center">
            <h3 className="text-title-lg font-bold text-on-surface">
              {t("entitlement.overridesEmpty")}
            </h3>
          </div>
        ) : (
          <>
            <div className="mt-4">
              <PlatformTable
                headers={[
                  t("entitlement.tenantId"),
                  t("entitlement.dimension"),
                  t("entitlement.limit"),
                  t("entitlement.reason"),
                  t("entitlement.enabled"),
                  t("entitlement.createdBy"),
                  t("entitlement.createdAt"),
                  t("entitlement.actions"),
                ]}
              >
                {overrides.map((override) => (
                  <tr key={`${override.tenantId}:${override.dimension}`}>
                    <td className={cell}>
                      <strong className="break-all text-on-surface">
                        {override.tenantId}
                      </strong>
                    </td>
                    <td className={cell}>
                      {humanizeDimension(override.dimension)}
                    </td>
                    <td className={cell}>
                      {override.limit.toLocaleString(intlLocale)}
                    </td>
                    <td className={cell}>{override.reason}</td>
                    <td className={cell}>
                      {override.enabled
                        ? t("entitlement.reconcileYes")
                        : t("entitlement.reconcileNo")}
                    </td>
                    <td className={cell}>{override.createdBy}</td>
                    <td className={cell}>
                      {new Date(override.createdAt).toLocaleDateString(
                        intlLocale,
                      )}
                    </td>
                    <td className={cell}>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => startEdit(override)}
                        >
                          {t("entitlement.edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          className="min-w-20 rounded-xl px-3 font-bold text-white shadow-sm"
                          onClick={() =>
                            setDeleteTarget({
                              tenantId: override.tenantId,
                              dimension: override.dimension,
                            })
                          }
                        >
                          {t("entitlement.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </PlatformTable>
            </div>

            {pagination.totalRecords > PAGE_SIZE ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                <span className="text-body-sm text-on-surface-variant">
                  {t("entitlement.page", {
                    page: String(pagination.page),
                    total: String(Math.max(1, pagination.totalPages)),
                  })}
                </span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                  >
                    {t("entitlement.previous")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                  >
                    {t("entitlement.next")}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </DashboardPanel>

      {/* ── Create / update override form ────────────────────────────── */}
      <DashboardPanel className="mt-5">
        <h2 className="text-title-lg font-bold text-primary">
          {t("entitlement.formTitle")}
        </h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          {t("entitlement.formDescription")}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CompanySearchSelect
            label={t("superAdmin.tableTenant")}
            value={form.tenantId}
            disabled={editing !== null}
            onChange={(tenantId) =>
              setForm((current) => ({ ...current, tenantId }))
            }
          />
          <Select
            label={t("entitlement.dimension")}
            value={form.dimension}
            onChange={(e) =>
              setForm((f) => ({ ...f, dimension: e.target.value }))
            }
            options={DIMENSIONS.map((d) => ({
              value: d,
              label: humanizeDimension(d),
            }))}
          />
          <Input
            label={t("entitlement.limit")}
            type="number"
            min={0}
            value={form.limit}
            onChange={(e) => setForm((f) => ({ ...f, limit: e.target.value }))}
            placeholder="0"
          />
          <Input
            label={t("entitlement.reason")}
            value={form.reason}
            onChange={(e) =>
              setForm((f) => ({ ...f, reason: e.target.value }))
            }
            placeholder="e.g. Enterprise customer, temporary promo"
          />
        </div>

        {formError ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-error/20 bg-error-container p-3 text-sm text-on-error-container"
          >
            {formError}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button isLoading={submitting} onClick={() => void handleSubmit()}>
            {t("entitlement.submit")}
          </Button>
          {editing ? (
            <Button variant="ghost" onClick={resetForm}>
              {t("common.cancel")}
            </Button>
          ) : null}
        </div>
      </DashboardPanel>

      {/* ── Reconciliation ───────────────────────────────────────────── */}
      <DashboardPanel className="mt-5">
        <h2 className="text-title-lg font-bold text-primary">
          {t("entitlement.reconcileTitle")}
        </h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          {t("entitlement.reconcileDescription")}
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Select
              label={t("entitlement.reconcileMode")}
              value={reconcileMode}
              onChange={(e) =>
                setReconcileMode(e.target.value as "dry-run" | "execute")
              }
              options={[
                {
                  value: "dry-run",
                  label: t("entitlement.reconcileDryRun"),
                },
                {
                  value: "execute",
                  label: t("entitlement.reconcileExecute"),
                },
              ]}
            />
          </div>
          <div className="w-72">
            <CompanySearchSelect
              label={t("superAdmin.tableTenant")}
              value={reconcileTenant}
              onChange={setReconcileTenant}
              allowAll
            />
          </div>
          <Button
            variant="primary"
            className="min-w-40 rounded-xl px-5 font-bold shadow-sm"
            isLoading={reconciling}
            onClick={() => void handleReconcile()}
          >
            {t("entitlement.reconcileRun")}
          </Button>
        </div>

        {reconcileError ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-error/20 bg-error-container p-3 text-sm text-on-error-container"
          >
            {reconcileError}
          </div>
        ) : null}

        {reconcileResult ? (
          <div className="mt-5">
            <div className="grid auto-rows-auto items-start gap-3 sm:grid-cols-3 sm:gap-4">
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
                <p className="text-label-md text-on-surface-variant">
                  {t("entitlement.reconcileMode")}
                </p>
                <p className="mt-1 text-title-lg font-bold text-primary">
                  {reconcileResult.mode === "execute"
                    ? t("entitlement.reconcileExecute")
                    : t("entitlement.reconcileDryRun")}
                </p>
              </div>
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
                <p className="text-label-md text-on-surface-variant">
                  {t("entitlement.reconcileTenants")}
                </p>
                <p className="mt-1 text-title-lg font-bold text-primary">
                  {reconcileResult.totalTenants.toLocaleString(intlLocale)}
                </p>
              </div>
              <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
                <p className="text-label-md text-on-surface-variant">
                  {t("entitlement.reconcileDiscrepancies")}
                </p>
                <p className="mt-1 text-title-lg font-bold text-primary">
                  {reconcileResult.totalDiscrepancies.toLocaleString(
                    intlLocale,
                  )}
                </p>
              </div>
            </div>

            {reconcileResult.totalDiscrepancies === 0 ? (
              <DashboardPanel className="mt-4">
                <p className="py-6 text-center text-body-md text-on-surface-variant">
                  {t("entitlement.reconcileEmpty")}
                </p>
              </DashboardPanel>
            ) : (
              <>
                <div className="mt-4">
                  <PlatformTable
                    headers={[
                      t("entitlement.reconcileTenantHeader"),
                      t("entitlement.reconcileDimensionHeader"),
                      t("entitlement.reconcileAuthoritativeHeader"),
                      t("entitlement.reconcileCurrentHeader"),
                      t("entitlement.reconcileDiscrepancyHeader"),
                      t("entitlement.reconcileFixedHeader"),
                    ]}
                  >
                    {reconcileResult.reports.map((report, index) => (
                      <tr key={`${report.tenantId}:${report.dimension}:${index}`}>
                        <td className={cell}>
                          <strong className="break-all text-on-surface">
                            {report.tenantName ?? report.tenantId}
                          </strong>
                        </td>
                        <td className={cell}>
                          {humanizeDimension(report.dimension)}
                        </td>
                        <td className={cell}>
                          {report.authoritative.toLocaleString(intlLocale)}
                        </td>
                        <td className={cell}>
                          {report.current.toLocaleString(intlLocale)}
                        </td>
                        <td className={cell}>
                          {report.discrepancy.toLocaleString(intlLocale)}
                        </td>
                        <td className={cell}>
                          {report.fixed
                            ? t("entitlement.reconcileYes")
                            : t("entitlement.reconcileNo")}
                        </td>
                      </tr>
                    ))}
                  </PlatformTable>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
                    <p className="text-label-md text-on-surface-variant">
                      {t("entitlement.reconcileFixed")}
                    </p>
                    <p className="mt-1 text-title-lg font-bold text-primary">
                      {reconcileResult.totalFixed.toLocaleString(intlLocale)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </DashboardPanel>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("entitlement.deleteConfirmTitle")}
        description={
          deleteTarget
            ? t("entitlement.deleteConfirmDescription", {
                tenantId: deleteTarget.tenantId,
                dimension: humanizeDimension(deleteTarget.dimension),
              })
            : undefined
        }
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        isLoading={deleting}
        error={deleteError}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      />
    </DashboardPage>
  );
}
