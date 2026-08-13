"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";
import {
  PlatformState,
  StatusPill,
  usePlatformData,
} from "@/components/super-admin/platform-ui";
import {
  getTenantDetail,
  previewTenantSuspend,
  previewTenantReinstate,
  suspendTenant,
  reinstateTenant,
} from "@/services/platform.service";
import { usePermissions } from "@/providers/permission-provider";
import { Permission } from "@/types/api/permissions.types";
import type {
  TenantDetailView,
  TenantLifecyclePreview,
} from "@/types/api/platform.types";
import {
  canConfirmTenantLifecycle,
  completeTenantLifecycleTransition,
  createLifecyclePreviewRequestTracker,
  lifecyclePreviewRequestKey,
} from "@/lib/tenant-lifecycle-state";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function LifecycleDialog({
  open,
  onClose,
  onSuccess,
  tenant,
  targetStatus,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tenant: TenantDetailView;
  targetStatus: "suspended" | "active";
}) {
  const { t, tPlural } = useI18n();
  const [preview, setPreview] = useState<TenantLifecyclePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const submittingRef = useRef(submitting);
  const previewRequestTrackerRef = useRef(
    createLifecyclePreviewRequestTracker(),
  );

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  const isSuspend = targetStatus === "suspended";
  const title = isSuspend
    ? t("superAdmin.companies.suspendTitle")
    : t("superAdmin.companies.reinstateTitle");
  const confirmLabel = isSuspend
    ? t("superAdmin.companies.suspend")
    : t("superAdmin.companies.reinstate");
  const confirmVariant: "danger" | "primary" = isSuspend ? "danger" : "primary";

  const loadPreview = useCallback(async (signal?: AbortSignal, retry = false) => {
    const requestKey = lifecyclePreviewRequestKey(tenant.id, targetStatus);
    if (retry) previewRequestTrackerRef.current.reset(requestKey);
    if (!previewRequestTrackerRef.current.start(requestKey)) return;

    setPreviewLoading(true);
    setPreviewError("");
    try {
      const previewFn = isSuspend ? previewTenantSuspend : previewTenantReinstate;
      const result = await previewFn(tenant.id, signal);
      if (signal?.aborted) return;
      setPreview(result.data);
      previewRequestTrackerRef.current.complete(requestKey);
    } catch {
      previewRequestTrackerRef.current.cancel(requestKey);
      if (signal?.aborted) return;
      setPreviewError(t("superAdmin.companies.previewError"));
    } finally {
      if (!signal?.aborted) setPreviewLoading(false);
    }
  }, [isSuspend, t, targetStatus, tenant.id]);

  useEffect(() => {
    if (!open) return;

    const requestKey = lifecyclePreviewRequestKey(tenant.id, targetStatus);
    const controller = new AbortController();
    const requestTracker = previewRequestTrackerRef.current;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    setPreview(null);
    setReason("");
    setSubmitError("");
    setPreviewLoading(false);
    setPreviewError("");
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    void loadPreview(controller.signal);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingRef.current) {
        closeRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      controller.abort();
      requestTracker.reset(requestKey);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [loadPreview, open, targetStatus, tenant.id]);

  const handleConfirm = async () => {
    if (!canConfirmTenantLifecycle(preview, reason, submitting)) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const actionFn = isSuspend ? suspendTenant : reinstateTenant;
      await actionFn(tenant.id, reason.trim());
      completeTenantLifecycleTransition(onSuccess, onClose);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("superAdmin.companies.operationFailed");
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lifecycle-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="w-full max-w-lg rounded-2xl bg-surface-container-lowest p-6 shadow-modal">
        <div className="flex items-start justify-between gap-3">
          <h3
            id="lifecycle-dialog-title"
            className="text-title-lg font-bold text-on-surface"
          >
            {title}
          </h3>
          <button
            type="button"
            aria-label={t("superAdmin.companies.closeDialog", { title })}
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-1 text-on-surface-variant hover:bg-surface-container disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <p className="mt-1 text-sm text-on-surface-variant">
          {tenant.name} ({tenant.slug})
        </p>
        <p className="mt-1 text-sm text-on-surface-variant">
          {t("superAdmin.companies.currentStatusLabel")}{" "}
          <StatusPill
            value={tenant.status}
            label={codeLabel(t, "superAdmin.tenantStatus", tenant.status)}
          />
        </p>

        {previewLoading && (
          <div className="mt-4 space-y-2">
            <div className="h-8 animate-pulse rounded-lg bg-surface-container" />
            <div className="h-8 animate-pulse rounded-lg bg-surface-container" />
          </div>
        )}

        {previewError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-error/20 bg-error-container p-3 text-sm text-on-error-container"
          >
            {previewError}
            <button
              type="button"
              onClick={() => void loadPreview(undefined, true)}
              className="ms-2 font-bold underline"
            >
              {t("common.retry")}
            </button>
          </div>
        )}

        {submitError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-error/20 bg-error-container p-3 text-sm text-on-error-container"
          >
            {submitError}
          </div>
        )}

        {preview && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-on-surface-variant">
                  {t("superAdmin.companies.usersAffectedLabel")}
                </span>
                <span className="ms-1 font-bold text-on-surface">
                  {t("superAdmin.companies.usersValue", {
                    active: String(preview.activeUsersAffected),
                    total: String(preview.totalUsersAffected),
                  })}
                </span>
              </div>
              <div>
                <span className="text-on-surface-variant">
                  {t("superAdmin.companies.adminsAffectedLabel")}
                </span>
                <span className="ms-1 font-bold text-on-surface">
                  {preview.activeCompanyAdminsAffected}
                </span>
              </div>
              <div>
                <span className="text-on-surface-variant">
                  {t("superAdmin.companies.documentsLabel")}
                </span>
                <span className="ms-1 font-bold text-on-surface">
                  {preview.documentCount}
                </span>
              </div>
              <div>
                <span className="text-on-surface-variant">
                  {t("superAdmin.companies.subscriptionLabel")}
                </span>
                <span className="ms-1 font-bold text-on-surface">
                  {preview.currentSubscriptionStatus
                    ? codeLabel(
                        t,
                        "superAdmin.subsStatus",
                        preview.currentSubscriptionStatus,
                      )
                    : t("superAdmin.companies.noSubscriptionValue")}
                </span>
              </div>
            </div>

            {preview.warnings.length > 0 && (
              <div className="mt-3 rounded-lg bg-warning-container/30 p-3 text-sm text-on-surface">
                {preview.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            )}

            {preview.blockingReasons.length > 0 && (
              <div className="mt-3 rounded-lg bg-error-container/30 p-3 text-sm text-on-error-container">
                {preview.blockingReasons.map((b) => (
                  <p key={b}>{b}</p>
                ))}
              </div>
            )}

            {preview.transitionAllowed && !preview.alreadyInTargetState && (
              <div className="mt-4">
                <label
                  htmlFor="lifecycle-reason"
                  className="block text-sm font-medium text-on-surface"
                >
                  {t("superAdmin.packages.reason")}{" "}
                  <span className="text-error">*</span>
                </label>
                <textarea
                  id="lifecycle-reason"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("superAdmin.companies.reasonPlaceholder")}
                  className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={submitting}
                />
                <p className="mt-1 text-xs text-on-surface-variant">
                  {reason.trim().length < 3
                    ? tPlural(
                        "superAdmin.companies.charactersNeeded",
                        3 - reason.trim().length,
                      )
                    : reason.trim().length > 500
                      ? t("superAdmin.companies.reasonTooLong")
                      : t("superAdmin.companies.reasonValid")}
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-md px-4 py-2 text-label-md font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low"
                disabled={submitting}
              >
                {t("common.cancel")}
              </button>
              {preview.transitionAllowed && !preview.alreadyInTargetState && (
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!canConfirmTenantLifecycle(preview, reason, submitting)}
                  className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-label-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    confirmVariant === "danger"
                      ? "bg-error text-on-error hover:bg-error/90"
                      : "bg-primary text-on-primary hover:bg-primary-container"
                  }`}
                >
                  {submitting && (
                    <span className="me-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  {confirmLabel}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CompanyDetailPage() {
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
  const id = String(useParams<{ companyId: string }>().companyId ?? "");
  const permissions = usePermissions();
  const canManageTenant = permissions.can(Permission.COMPANY_SETTINGS_UPDATE);

  const loader = useCallback(
    (signal?: AbortSignal) => getTenantDetail(id, signal),
    [id],
  );
  const state = usePlatformData<TenantDetailView>(loader);

  const [lifecycleAction, setLifecycleAction] = useState<
    "suspend" | "reinstate" | null
  >(null);
  const [lifecycleNotice, setLifecycleNotice] = useState("");

  const canSuspend = [
    "active",
    "trial",
    "pending",
    "pending_verification",
  ].includes(state.data?.status ?? "");

  return (
    <DashboardPage>
      <Link
        href="/super-admin/companies"
        className="mb-4 inline-flex w-fit items-center gap-1 text-sm font-bold text-secondary"
      >
        <span className="material-symbols-outlined text-[18px] rtl:rotate-180">
          arrow_back
        </span>
        {t("superAdmin.companies.backLink")}
      </Link>

      <PlatformState
        loading={state.loading}
        error={state.error}
        onRetry={state.reload}
      />

      {lifecycleNotice && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-success/20 bg-success-container p-3 text-sm text-on-success-container"
        >
          {lifecycleNotice}
        </div>
      )}

      {state.data ? (
        <>
          <DashboardPageHeader
            title={state.data.name}
            description={state.data.slug}
            actions={
              <div className="flex items-center gap-3">
                <StatusPill
                  value={state.data.status}
                  label={codeLabel(t, "superAdmin.tenantStatus", state.data.status)}
                />
                {canManageTenant && canSuspend && (
                  <button
                    type="button"
                    onClick={() => setLifecycleAction("suspend")}
                    className="inline-flex items-center gap-1 rounded-lg bg-error/10 px-3 py-1.5 text-sm font-medium text-error transition-colors hover:bg-error/20"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      block
                    </span>
                    {t("superAdmin.companies.suspend")}
                  </button>
                )}
                {canManageTenant && state.data.status === "suspended" && (
                  <button
                    type="button"
                    onClick={() => setLifecycleAction("reinstate")}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      restart_alt
                    </span>
                    {t("superAdmin.companies.reinstate")}
                  </button>
                )}
              </div>
            }
          />

          <div className="grid auto-rows-auto items-start gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 xl:gap-5">
            {[
              ["plan", t("superAdmin.companies.plan"), codeLabel(t, "superAdmin.tenantPlan", state.data.plan)],
              [
                "users",
                t("superAdmin.companies.users"),
                t("superAdmin.companies.usersValue", {
                  active: String(state.data.users.active),
                  total: String(state.data.users.total),
                }),
              ],
              ["companyAdmins", t("superAdmin.companies.companyAdmins"), state.data.users.companyAdmins],
              ["employees", t("superAdmin.packages.employees"), state.data.users.employees],
              ["documents", t("superAdmin.documents"), state.data.usage.documents],
              ["storage", t("superAdmin.storage"), formatBytes(state.data.usage.storageBytes)],
              ["queries", t("superAdmin.queries"), state.data.usage.questions],
              [
                "created",
                t("superAdmin.tableCreated"),
                new Date(state.data.createdAt).toLocaleDateString(intlLocale),
              ],
              [
                "updated",
                t("superAdmin.tableUpdated"),
                new Date(state.data.updatedAt).toLocaleDateString(intlLocale),
              ],
            ].map(([id, label, value]) => (
              <DashboardPanel key={id} padding="compact">
                <p className="text-sm text-on-surface-variant">{label}</p>
                <p className="mt-1 break-words text-title-lg font-bold text-primary">
                  {value}
                </p>
              </DashboardPanel>
            ))}
          </div>

          {state.data.subscription && (
            <DashboardPanel className="mt-4">
              <h3 className="text-title-sm font-bold text-on-surface">
                {t("superAdmin.companies.subscription")}
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <span className="text-on-surface-variant">
                    {t("superAdmin.companies.statusLabel")}
                  </span>
                  <span className="ms-1 font-bold text-on-surface">
                    {codeLabel(
                      t,
                      "superAdmin.subsStatus",
                      state.data.subscription.status,
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-on-surface-variant">
                    {t("superAdmin.companies.providerLabel")}
                  </span>
                  <span className="ms-1 font-bold text-on-surface">
                    {codeLabel(
                      t,
                      "superAdmin.subsProvider",
                      state.data.subscription.provider,
                    )}
                  </span>
                </div>
                {state.data.subscription.periodStart && (
                  <div>
                    <span className="text-on-surface-variant">
                      {t("superAdmin.companies.periodStartLabel")}
                    </span>
                    <span className="ms-1 font-bold text-on-surface">
                      {new Date(
                        state.data.subscription.periodStart,
                      ).toLocaleDateString(intlLocale)}
                    </span>
                  </div>
                )}
                {state.data.subscription.periodEnd && (
                  <div>
                    <span className="text-on-surface-variant">
                      {t("superAdmin.companies.periodEndLabel")}
                    </span>
                    <span className="ms-1 font-bold text-on-surface">
                      {new Date(
                        state.data.subscription.periodEnd,
                      ).toLocaleDateString(intlLocale)}
                    </span>
                  </div>
                )}
                {state.data.subscription.trialEnd && (
                  <div>
                    <span className="text-on-surface-variant">
                      {t("superAdmin.subsTrialEndLabel")}
                    </span>
                    <span className="ms-1 font-bold text-on-surface">
                      {new Date(
                        state.data.subscription.trialEnd,
                      ).toLocaleDateString(intlLocale)}
                    </span>
                  </div>
                )}
                {state.data.subscription.cancelAtPeriodEnd && (
                  <div>
                    <span className="text-on-surface-variant">
                      {t("superAdmin.companies.cancelAtPeriodEndLabel")}
                    </span>
                    <span className="ms-1 font-bold text-error">
                      {t("superAdmin.verifiedYes")}
                    </span>
                  </div>
                )}
              </div>
            </DashboardPanel>
          )}

          {state.data.package && (
            <DashboardPanel className="mt-4">
              <h3 className="text-title-sm font-bold text-on-surface">
                {t("superAdmin.subsTablePackage")}
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <span className="text-on-surface-variant">
                    {t("superAdmin.companies.nameLabel")}
                  </span>
                  <span className="ms-1 font-bold text-on-surface">
                    {state.data.package.packageName}
                  </span>
                </div>
                <div>
                  <span className="text-on-surface-variant">
                    {t("superAdmin.companies.codeLabel")}
                  </span>
                  <span className="ms-1 font-bold text-on-surface">
                    {state.data.package.packageCode}
                  </span>
                </div>
                <div>
                  <span className="text-on-surface-variant">
                    {t("superAdmin.companies.versionLabel")}
                  </span>
                  <span className="ms-1 font-bold text-on-surface">
                    {state.data.package.packageVersion}
                  </span>
                </div>
                {state.data.package.entitlements && (
                  <>
                    <div>
                      <span className="text-on-surface-variant">
                        {t("superAdmin.companies.maxEmployeesLabel")}
                      </span>
                      <span className="ms-1 font-bold text-on-surface">
                        {state.data.package.entitlements.employees}
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant">
                        {t("superAdmin.companies.maxAdminsLabel")}
                      </span>
                      <span className="ms-1 font-bold text-on-surface">
                        {state.data.package.entitlements.admins}
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant">
                        {t("superAdmin.companies.maxDocumentsLabel")}
                      </span>
                      <span className="ms-1 font-bold text-on-surface">
                        {state.data.package.entitlements.documents}
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant">
                        {t("superAdmin.companies.storageLabel")}
                      </span>
                      <span className="ms-1 font-bold text-on-surface">
                        {t("superAdmin.packages.megabytes", {
                          value: String(
                            state.data.package.entitlements.storageMb,
                          ),
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant">
                        {t("superAdmin.companies.queriesPerMonthLabel")}
                      </span>
                      <span className="ms-1 font-bold text-on-surface">
                        {state.data.package.entitlements.queriesPerMonth}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </DashboardPanel>
          )}

          {state.data.recentAudit.length > 0 && (
            <DashboardPanel className="mt-4">
              <h3 className="text-title-sm font-bold text-on-surface">
                {t("superAdmin.companies.recentActivity")}
              </h3>
              <div className="mt-3 space-y-2">
                {state.data.recentAudit.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-on-surface">
                        {entry.action}
                      </span>
                      {entry.actorEmail && (
                        <span className="text-on-surface-variant">
                          {t("superAdmin.companies.byActor", {
                            email: entry.actorEmail,
                          })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill
                        value={entry.outcome.toLowerCase()}
                        label={codeLabel(t, "superAdmin.auditOutcome", entry.outcome)}
                      />
                      <span className="text-on-surface-variant">
                        {new Date(entry.createdAt).toLocaleString(intlLocale)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </DashboardPanel>
          )}

          {!state.data.subscription && !state.data.package && (
            <DashboardPanel className="mt-4">
              <p className="text-sm text-on-surface-variant">
                {t("superAdmin.companies.noSubscriptionOrPackage")}
              </p>
            </DashboardPanel>
          )}
        </>
      ) : null}

      {state.data && lifecycleAction && (
        <LifecycleDialog
          open={true}
          onClose={() => setLifecycleAction(null)}
          onSuccess={() => {
            setLifecycleNotice(
              lifecycleAction === "suspend"
                ? t("superAdmin.companies.suspendSuccess")
                : t("superAdmin.companies.reinstateSuccess"),
            );
            state.reload();
          }}
          tenant={state.data}
          targetStatus={lifecycleAction === "suspend" ? "suspended" : "active"}
        />
      )}
    </DashboardPage>
  );
}
