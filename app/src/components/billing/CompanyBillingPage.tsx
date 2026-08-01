"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionBoundary } from "@/components/auth/permission-boundary";
import { DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui/DashboardPage";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api-client";
import { useI18n } from "@/providers/i18n-provider";
import { usePermissions } from "@/providers/permission-provider";
import {
  createBillingPortalSession,
  createRefundEligibilityPreview,
  createRefundRequest,
  createSubscriptionChangePreview,
  getBillingOperation,
  getBillingSummary,
  getInvoiceLinks,
  listRefundRequests,
  listInvoices,
  listPublicBillingPackages,
  requestBillingCancellation,
  requestBillingReactivation,
  requestSubscriptionChange,
} from "@/services/billing.service";
import type {
  BillingChangePreview,
  BillingInvoice,
  BillingRefund,
  BillingOperationStatus,
  BillingPortalFlow,
  RefundEligibilityPreview,
  RefundReason,
  Pagination,
  PublicPackage,
  SubscriptionStatus,
} from "@/types/api/billing.types";
import { Permission } from "@/types/api/permissions.types";
import { parseRefundAmountMinor } from "./refund-money";

type Loadable<T> = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: T };
type Interval = "monthly" | "annual";
type CancellationType = "PERIOD_END" | "IMMEDIATE";

export function CompanyBillingPage() {
  return <PermissionBoundary permissions={[Permission.BILLING_READ]}><BillingContent /></PermissionBoundary>;
}

function BillingContent() {
  const { t, locale, dir } = useI18n();
  const permissions = usePermissions();
  const canRead = permissions.can(Permission.BILLING_READ);
  const canManage = permissions.can(Permission.BILLING_MANAGE);
  const [summary, setSummary] = useState<Loadable<SubscriptionStatus>>({ kind: "loading" });
  const [invoiceState, setInvoiceState] = useState<Loadable<{ invoices: BillingInvoice[]; pagination: Pagination }>>({ kind: "loading" });
  const [packageState, setPackageState] = useState<Loadable<PublicPackage[]>>({ kind: "loading" });
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [refundState, setRefundState] = useState<Loadable<{ refunds: BillingRefund[]; pagination: Pagination }>>({ kind: "loading" });
  const [portalFlow, setPortalFlow] = useState<BillingPortalFlow | null>(null);
  const [portalError, setPortalError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [operationState, setOperationState] = useState<BillingOperationStatus | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedInterval, setSelectedInterval] = useState<Interval>("monthly");
  const [previewState, setPreviewState] = useState<Loadable<BillingChangePreview> | null>(null);
  const [previewSubmitting, setPreviewSubmitting] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [confirmCancellation, setConfirmCancellation] = useState<CancellationType | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [reactivationLoading, setReactivationLoading] = useState(false);
  const [reactivationError, setReactivationError] = useState("");
  const [refundDialogInvoice, setRefundDialogInvoice] = useState<BillingInvoice | null>(null);
  const [refundMode, setRefundMode] = useState<"FULL" | "PARTIAL">("FULL");
  const [refundAmountMinor, setRefundAmountMinor] = useState("");
  const [refundReason, setRefundReason] = useState<RefundReason>("VOLUNTARY_CANCELLATION");
  const [refundEligibility, setRefundEligibility] = useState<Loadable<RefundEligibilityPreview> | null>(null);
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const portalRequestRef = useRef(false);
  const previewSubmitKeyRef = useRef<string | null>(null);
  const cancellationKeysRef = useRef<Record<CancellationType, string | null>>({
    PERIOD_END: null,
    IMMEDIATE: null,
  });
  const reactivationKeyRef = useRef<string | null>(null);
  const refundSubmitKeyRef = useRef<string | null>(null);

  const currentOperationId = summary.kind === "ready" ? summary.data.pendingOperation?.id ?? null : null;

  const refreshAll = useCallback(() => {
    setRefresh((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setSummary({ kind: "loading" });
    getBillingSummary(controller.signal)
      .then((response) => setSummary({ kind: "ready", data: response.data }))
      .catch((error) => {
        if (!controller.signal.aborted) setSummary({ kind: "error", message: safeMessage(error, t) });
      });
    return () => controller.abort();
  }, [canRead, refresh, t]);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setInvoiceState({ kind: "loading" });
    listInvoices({ page, pageSize: 10 }, controller.signal)
      .then((response) => {
        setInvoiceState({ kind: "ready", data: response.data });
        setAnnouncement(t("billingAdmin.refreshSuccess"));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setInvoiceState({ kind: "error", message: safeMessage(error, t) });
      });
    return () => controller.abort();
  }, [canRead, page, refresh, t]);

  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setRefundState({ kind: "loading" });
    listRefundRequests({ page: 1, pageSize: 10 }, controller.signal)
      .then((response) => setRefundState({ kind: "ready", data: response.data }))
      .catch((error) => {
        if (!controller.signal.aborted) setRefundState({ kind: "error", message: safeMessage(error, t) });
      });
    return () => controller.abort();
  }, [canRead, refresh, t]);

  useEffect(() => {
    if (!canManage || summary.kind !== "ready" || !summary.data.canChangePlan) {
      setPackageState({ kind: "loading" });
      return;
    }
    const controller = new AbortController();
    listPublicBillingPackages(controller.signal)
      .then((response) => {
        const options = response.data.filter((pkg) => pkg.id !== summary.data.packageId?._id);
        setPackageState({ kind: "ready", data: options });
        if (!selectedPackageId && options[0]) setSelectedPackageId(options[0].id);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setPackageState({ kind: "error", message: safeMessage(error, t) });
      });
    return () => controller.abort();
  }, [canManage, selectedPackageId, summary, t]);

  useEffect(() => {
    if (!currentOperationId) {
      setOperationState(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    const poll = async () => {
      try {
        const response = await getBillingOperation(currentOperationId, controller.signal);
        if (!active) return;
        setOperationState(response.data);
        if (["REQUESTED", "PROVIDER_PENDING", "RETRY_PENDING"].includes(response.data.status)) {
          window.setTimeout(() => {
            if (active) void poll();
          }, 3000);
          return;
        }
        setAnnouncement(response.data.status === "CONFIRMED" ? t("billingAdmin.operationConfirmed") : t("billingAdmin.operationFailed"));
        refreshAll();
      } catch (error) {
        if (!controller.signal.aborted) setAnnouncement(safeMessage(error, t));
      }
    };
    void poll();
    return () => {
      active = false;
      controller.abort();
    };
  }, [currentOperationId, refreshAll, t]);

  useEffect(() => {
    if (portalError || previewError || confirmError || reactivationError || refundError) errorRef.current?.focus();
  }, [portalError, previewError, confirmError, reactivationError, refundError]);

  const launchPortal = useCallback(async (flow: BillingPortalFlow) => {
    if (portalRequestRef.current) return;
    portalRequestRef.current = true;
    setPortalFlow(flow);
    setPortalError("");
    setAnnouncement(t("billingAdmin.portalOpening"));
    try {
      const response = await createBillingPortalSession(flow);
      window.location.assign(response.data.url);
    } catch (error) {
      setPortalError(safeMessage(error, t));
      setAnnouncement(t("billingAdmin.portalFailed"));
      setPortalFlow(null);
      portalRequestRef.current = false;
    }
  }, [t]);

  const openLinks = useCallback(async (invoice: BillingInvoice) => {
    try {
      setAnnouncement(t("billingAdmin.linkLoading"));
      const response = await getInvoiceLinks(invoice.id);
      const url = response.data.invoicePdfUrl ?? response.data.hostedInvoiceUrl ?? response.data.receiptUrl;
      if (!url) throw new Error("unavailable");
      window.open(url, "_blank", "noopener,noreferrer");
      setAnnouncement(t("billingAdmin.linkOpened"));
    } catch (error) {
      setAnnouncement(safeMessage(error, t));
    }
  }, [t]);

  const loadRefundEligibility = useCallback(async (invoice: BillingInvoice, reason: RefundReason) => {
    setRefundEligibility({ kind: "loading" });
    try {
      const response = await createRefundEligibilityPreview({ invoiceId: invoice.id, reason });
      setRefundEligibility({ kind: "ready", data: response.data });
      setRefundMode(response.data.maximumEligibleRefundMinor === invoice.remainingRefundableMinor ? "FULL" : "PARTIAL");
      setRefundAmountMinor((response.data.maximumEligibleRefundMinor / 100).toFixed(2));
    } catch (error) {
      setRefundEligibility({ kind: "error", message: safeMessage(error, t) });
    }
  }, [t]);

  const openRefundDialog = useCallback((invoice: BillingInvoice) => {
    refundSubmitKeyRef.current = null;
    setRefundDialogInvoice(invoice);
    setRefundMode("PARTIAL");
    setRefundAmountMinor("");
    setRefundReason("VOLUNTARY_CANCELLATION");
    setRefundError("");
    void loadRefundEligibility(invoice, "VOLUNTARY_CANCELLATION");
  }, [loadRefundEligibility]);

  const submitRefund = useCallback(async () => {
    if (!refundDialogInvoice || refundEligibility?.kind !== "ready") return;
    setRefundSubmitting(true);
    setRefundError("");
    try {
      const idempotencyKey = refundSubmitKeyRef.current ?? (globalThis.crypto?.randomUUID?.() ?? `refund-${Date.now()}`);
      refundSubmitKeyRef.current = idempotencyKey;
      const amountMinor = refundMode === "PARTIAL" ? parseRefundAmountMinor(refundAmountMinor, locale) ?? undefined : undefined;
      await createRefundRequest({
        previewId: refundEligibility.data.id,
        mode: refundMode,
        amountMinor,
        idempotencyKey,
      });
      setRefundSubmitting(false);
      setRefundDialogInvoice(null);
      setAnnouncement(t("billingAdmin.refundRequested"));
      refreshAll();
    } catch (error) {
      setRefundSubmitting(false);
      setRefundError(safeMessage(error, t));
    }
  }, [locale, refundAmountMinor, refundDialogInvoice, refundEligibility, refundMode, refreshAll, t]);

  const requestPreview = useCallback(async () => {
    if (!selectedPackageId) return;
    setPreviewError("");
    setPreviewState({ kind: "loading" });
    try {
      const response = await createSubscriptionChangePreview({ targetPackageId: selectedPackageId, billingInterval: selectedInterval });
      setPreviewState({ kind: "ready", data: response.data });
      previewSubmitKeyRef.current = null;
      setAnnouncement(t("billingAdmin.previewLoaded"));
    } catch (error) {
      const message = safeMessage(error, t);
      setPreviewState({ kind: "error", message });
      setPreviewError(message);
    }
  }, [selectedInterval, selectedPackageId, t]);

  const submitPreview = useCallback(async () => {
    if (previewState?.kind !== "ready") return;
    setPreviewSubmitting(true);
    setPreviewError("");
    try {
      const idempotencyKey = previewSubmitKeyRef.current ?? (globalThis.crypto?.randomUUID?.() ?? `plan-${Date.now()}`);
      previewSubmitKeyRef.current = idempotencyKey;
      const response = await requestSubscriptionChange({ previewId: previewState.data.id, idempotencyKey });
      setPreviewSubmitting(false);
      setPreviewDialogOpen(false);
      setOperationState(response.data.operation);
      setAnnouncement(t("billingAdmin.operationPending"));
      refreshAll();
    } catch (error) {
      setPreviewSubmitting(false);
      setPreviewError(safeMessage(error, t));
    }
  }, [previewState, refreshAll, t]);

  const submitCancellation = useCallback(async (cancellationType: CancellationType) => {
    setConfirmLoading(true);
    setConfirmError("");
    try {
      const idempotencyKey = cancellationKeysRef.current[cancellationType]
        ?? (globalThis.crypto?.randomUUID?.() ?? `cancel-${Date.now()}`);
      cancellationKeysRef.current[cancellationType] = idempotencyKey;
      const response = await requestBillingCancellation({
        cancellationType,
        idempotencyKey,
      });
      setConfirmLoading(false);
      setConfirmCancellation(null);
      setOperationState(response.data.operation);
      setAnnouncement(t("billingAdmin.operationPending"));
      refreshAll();
    } catch (error) {
      setConfirmLoading(false);
      setConfirmError(safeMessage(error, t));
    }
  }, [refreshAll, t]);

  const submitReactivation = useCallback(async () => {
    setReactivationLoading(true);
    setReactivationError("");
    try {
      const idempotencyKey = reactivationKeyRef.current ?? (globalThis.crypto?.randomUUID?.() ?? `reactivate-${Date.now()}`);
      reactivationKeyRef.current = idempotencyKey;
      const response = await requestBillingReactivation({ idempotencyKey });
      setReactivationLoading(false);
      setOperationState(response.data.operation);
      setAnnouncement(t("billingAdmin.operationPending"));
      refreshAll();
    } catch (error) {
      setReactivationLoading(false);
      setReactivationError(safeMessage(error, t));
    }
  }, [refreshAll, t]);

  const selectedPackage = useMemo(
    () => packageState.kind === "ready" ? packageState.data.find((pkg) => pkg.id === selectedPackageId) ?? null : null,
    [packageState, selectedPackageId],
  );
  const readsLoading = summary.kind === "loading" || invoiceState.kind === "loading" || refundState.kind === "loading";
  const readsFailed = summary.kind === "error" || invoiceState.kind === "error" || refundState.kind === "error";

  return (
    <DashboardPage dir={dir}>
      <div className="sr-only" aria-live="polite">{announcement}</div>
      <DashboardPageHeader
        title={t("billingAdmin.title")}
        description={t("billingAdmin.description")}
        actions={<button type="button" disabled={readsLoading} onClick={refreshAll} className="min-h-11 rounded-xl border border-outline px-4 font-semibold disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{readsLoading ? t("billingAdmin.loading") : readsFailed ? t("common.retry") : t("common.refresh")}</button>}
      />
      {portalError || previewError || confirmError || reactivationError || refundError ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="mb-4 rounded-xl border border-error/40 bg-error-container p-4 text-on-error-container">
          {portalError || previewError || confirmError || reactivationError || refundError}
        </div>
      ) : null}
      <div className="space-y-6">
        <DashboardPanel aria-labelledby="current-subscription-heading">
          <h2 id="current-subscription-heading" className="text-title-lg font-bold">{t("billingAdmin.currentSubscription")}</h2>
          {summary.kind === "loading" ? (
            <Loading label={t("billingAdmin.loadingSummary")} />
          ) : summary.kind === "error" ? (
            <ErrorState message={summary.message} retry={refreshAll} label={t("common.retry")} />
          ) : (
            <SubscriptionDetails
              summary={summary.data}
              locale={locale}
              t={t}
              canManage={canManage}
              portalFlow={portalFlow}
              launchPortal={launchPortal}
              openPreview={() => {
                setPreviewState(null);
                setPreviewError("");
                previewSubmitKeyRef.current = null;
                setPreviewDialogOpen(true);
              }}
              openCancel={(value) => {
                cancellationKeysRef.current[value] = null;
                setConfirmCancellation(value);
              }}
              reactivate={submitReactivation}
              reactivationLoading={reactivationLoading}
              reactivationError={reactivationError}
              operationState={operationState}
            />
          )}
        </DashboardPanel>

        <DashboardPanel padding="none" aria-labelledby="invoice-history-heading">
          <div className="flex items-center justify-between border-b border-outline-variant/30 p-4 sm:p-5">
            <div>
              <h2 id="invoice-history-heading" className="text-title-lg font-bold">{t("billingAdmin.invoices")}</h2>
              <p className="text-sm text-on-surface-variant">{t("billingAdmin.invoiceDescription")}</p>
            </div>
          </div>
          {invoiceState.kind === "loading" ? (
            <div className="p-5"><Loading label={t("billingAdmin.loadingInvoices")} /></div>
          ) : invoiceState.kind === "error" ? (
            <div className="p-5"><ErrorState message={invoiceState.message} retry={refreshAll} label={t("common.retry")} /></div>
          ) : invoiceState.data.invoices.length === 0 ? (
            <div className="p-8 text-center">
              <span aria-hidden="true" className="material-symbols-outlined text-4xl">receipt_long</span>
              <h3 className="mt-2 font-bold">{t("billingAdmin.noInvoices")}</h3>
              <p className="text-sm text-on-surface-variant">{t("billingAdmin.noInvoicesDescription")}</p>
            </div>
          ) : (
            <InvoiceHistory
              invoices={invoiceState.data.invoices}
              pagination={invoiceState.data.pagination}
              locale={locale}
              t={t}
              onLinks={openLinks}
              onRefund={openRefundDialog}
              setPage={setPage}
              canManage={canManage && summary.kind === "ready" && summary.data.canRequestRefund}
            />
          )}
        </DashboardPanel>

        <DashboardPanel padding="none" aria-labelledby="refund-history-heading">
          <div className="flex items-center justify-between border-b border-outline-variant/30 p-4 sm:p-5">
            <div>
              <h2 id="refund-history-heading" className="text-title-lg font-bold">{t("billingAdmin.refunds")}</h2>
              <p className="text-sm text-on-surface-variant">{t("billingAdmin.refundDescription")}</p>
            </div>
          </div>
          {refundState.kind === "loading" ? (
            <div className="p-5"><Loading label={t("billingAdmin.loadingRefunds")} /></div>
          ) : refundState.kind === "error" ? (
            <div className="p-5"><ErrorState message={refundState.message} retry={refreshAll} label={t("common.retry")} /></div>
          ) : refundState.data.refunds.length === 0 ? (
            <div className="p-8 text-center">
              <span aria-hidden="true" className="material-symbols-outlined text-4xl">payments</span>
              <h3 className="mt-2 font-bold">{t("billingAdmin.noRefunds")}</h3>
              <p className="text-sm text-on-surface-variant">{t("billingAdmin.noRefundsDescription")}</p>
            </div>
          ) : (
            <RefundHistory refunds={refundState.data.refunds} locale={locale} t={t} />
          )}
        </DashboardPanel>
      </div>

      <Modal
        open={previewDialogOpen}
        onClose={() => !previewSubmitting && setPreviewDialogOpen(false)}
        title={t("billingAdmin.changePlan")}
        maxWidth="max-w-3xl"
        footer={(
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setPreviewDialogOpen(false)} className="rounded-lg border px-4 py-2 font-semibold">{t("common.cancel")}</button>
            <button type="button" onClick={requestPreview} disabled={!selectedPackageId || previewSubmitting} className="rounded-lg border border-outline px-4 py-2 font-semibold disabled:opacity-60">{t("billingAdmin.previewChange")}</button>
            <button type="button" onClick={submitPreview} disabled={previewState?.kind !== "ready" || previewSubmitting} className="rounded-lg bg-primary px-4 py-2 font-semibold text-on-primary disabled:opacity-60">{previewSubmitting ? t("billingAdmin.submitting") : t("billingAdmin.confirmChange")}</button>
          </div>
        )}
      >
        <div className="space-y-6">
          {packageState.kind === "loading" ? <Loading label={t("billingAdmin.loadingPackages")} /> : packageState.kind === "error" ? <ErrorState message={packageState.message} retry={refreshAll} label={t("common.retry")} /> : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold">{t("billingAdmin.targetPlan")}</span>
                  <select value={selectedPackageId} onChange={(event) => setSelectedPackageId(event.target.value)} className="min-h-11 rounded-xl border border-outline px-3 py-2">
                    {packageState.data.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}
                  </select>
                </label>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-semibold">{t("billingAdmin.billingInterval")}</legend>
                  <div className="flex gap-3">
                    {(["monthly", "annual"] as const).map((interval) => (
                      <label key={interval} className="flex items-center gap-2 rounded-xl border border-outline px-3 py-2">
                        <input type="radio" name="billing-interval" checked={selectedInterval === interval} onChange={() => setSelectedInterval(interval)} />
                        <span>{t(`billingAdmin.interval.${interval}`)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              {selectedPackage ? <p className="text-sm text-on-surface-variant">{selectedPackage.description}</p> : null}
              {previewState?.kind === "loading" ? <Loading label={t("billingAdmin.loadingPreview")} /> : null}
              {previewState?.kind === "error" ? <ErrorState message={previewState.message} retry={requestPreview} label={t("common.retry")} /> : null}
              {previewState?.kind === "ready" ? <PreviewSummary preview={previewState.data} locale={locale} t={t} /> : null}
            </>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmCancellation === "PERIOD_END"}
        title={t("billingAdmin.cancelAtPeriodEnd")}
        description={t("billingAdmin.cancelAtPeriodEndDescription")}
        confirmLabel={t("billingAdmin.confirmCancellation")}
        cancelLabel={t("common.cancel")}
        variant="warning"
        isLoading={confirmLoading}
        error={confirmError || null}
        onCancel={() => {
          if (!confirmLoading) {
            setConfirmCancellation(null);
            setConfirmError("");
          }
        }}
        onConfirm={() => void submitCancellation("PERIOD_END")}
      />

      <ConfirmDialog
        open={confirmCancellation === "IMMEDIATE"}
        title={t("billingAdmin.cancelImmediately")}
        description={t("billingAdmin.cancelImmediatelyDescription")}
        confirmLabel={t("billingAdmin.confirmImmediateCancellation")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        isLoading={confirmLoading}
        error={confirmError || null}
        onCancel={() => {
          if (!confirmLoading) {
            setConfirmCancellation(null);
            setConfirmError("");
          }
        }}
        onConfirm={() => void submitCancellation("IMMEDIATE")}
      />

      <Modal
        open={Boolean(refundDialogInvoice)}
        onClose={() => {
          if (!refundSubmitting) {
            setRefundDialogInvoice(null);
            setRefundError("");
          }
        }}
        title={t("billingAdmin.requestRefund")}
        maxWidth="max-w-xl"
        footer={(
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setRefundDialogInvoice(null)} className="rounded-lg border px-4 py-2 font-semibold">{t("common.cancel")}</button>
            <button type="button" onClick={submitRefund} disabled={!refundDialogInvoice || refundSubmitting || refundEligibility?.kind !== "ready" || (refundMode === "PARTIAL" && parseRefundAmountMinor(refundAmountMinor, locale) === null)} className="rounded-lg bg-primary px-4 py-2 font-semibold text-on-primary disabled:opacity-60">{refundSubmitting ? t("billingAdmin.submitting") : t("billingAdmin.submitRefund")}</button>
          </div>
        )}
      >
        {refundDialogInvoice ? (
          <RefundRequestForm
            invoice={refundDialogInvoice}
            locale={locale}
            t={t}
            mode={refundMode}
            amount={refundAmountMinor}
            reason={refundReason}
            eligibility={refundEligibility}
            error={refundError}
            onModeChange={(mode) => { setRefundMode(mode); refundSubmitKeyRef.current = null; }}
            onAmountChange={(amount) => { setRefundAmountMinor(amount); refundSubmitKeyRef.current = null; }}
            onReasonChange={(reason) => {
              setRefundReason(reason);
              refundSubmitKeyRef.current = null;
              void loadRefundEligibility(refundDialogInvoice, reason);
            }}
          />
        ) : null}
      </Modal>
    </DashboardPage>
  );
}

function SubscriptionDetails({
  summary,
  locale,
  t,
  canManage,
  portalFlow,
  launchPortal,
  openPreview,
  openCancel,
  reactivate,
  reactivationLoading,
  reactivationError,
  operationState,
}: {
  summary: SubscriptionStatus;
  locale: string;
  t: (key: string) => string;
  canManage: boolean;
  portalFlow: BillingPortalFlow | null;
  launchPortal: (flow: BillingPortalFlow) => void;
  openPreview: () => void;
  openCancel: (value: CancellationType) => void;
  reactivate: () => void;
  reactivationLoading: boolean;
  reactivationError: string;
  operationState: BillingOperationStatus | null;
}) {
  const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", { dateStyle: "medium" }).format(new Date(value)) : t("billingAdmin.notAvailable");
  const pending = operationState ?? summary.pendingOperation;
  const currentOperationStatus = pending ? t(`billingAdmin.operationStatus.${pending.status.toLowerCase()}`) : null;

  return (
    <div className="mt-4 space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label={t("billingAdmin.plan")} value={`${summary.packageId?.name ?? t("billingAdmin.notAvailable")} · v${summary.packageVersion}`} />
        <Detail label={t("billingAdmin.status")} value={t(`billingAdmin.status.${summary.status.toLowerCase()}`)} />
        <Detail label={t("billingAdmin.paymentState")} value={t(`billingAdmin.status.${summary.paymentState.toLowerCase()}`)} />
        <Detail label={t("billingAdmin.period")} value={`${formatDate(summary.currentPeriodStart ?? summary.periodStart)} – ${formatDate(summary.currentPeriodEnd ?? summary.periodEnd)}`} />
      </dl>
      {summary.lifecycle.inGracePeriod ? <p role="status" className="rounded-xl bg-warning-container p-3 text-on-warning-container">{t("billingAdmin.graceWarning")}</p> : null}
      {summary.cancelAtPeriodEnd && summary.cancellationEffectiveAt ? <p role="status" className="rounded-xl bg-secondary-container p-3">{t("billingAdmin.cancellationScheduled")} {formatDate(summary.cancellationEffectiveAt)}</p> : null}
      {pending ? (
        <p role="status" className="rounded-xl bg-secondary-container p-3">
          {t("billingAdmin.pendingOperation")} {currentOperationStatus ? `(${currentOperationStatus})` : ""}
        </p>
      ) : null}
      {!summary.providerLinked ? <p className="rounded-xl bg-surface-container p-3">{t("billingAdmin.notLinked")}</p> : null}
      {reactivationError ? <p role="alert" className="rounded-xl border border-error/40 bg-error-container p-3 text-on-error-container">{reactivationError}</p> : null}
      <div className="flex flex-wrap gap-3">
        {canManage && summary.canChangePlan ? <button type="button" disabled={Boolean(summary.pendingOperation)} onClick={openPreview} className="min-h-11 rounded-xl border border-outline px-4 font-semibold disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{t("billingAdmin.changePlan")}</button> : null}
        {canManage && summary.canCancel ? <button type="button" disabled={Boolean(summary.pendingOperation)} onClick={() => openCancel("PERIOD_END")} className="min-h-11 rounded-xl border border-outline px-4 font-semibold disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{t("billingAdmin.cancelAtPeriodEnd")}</button> : null}
        {canManage && summary.canCancel ? <button type="button" disabled={Boolean(summary.pendingOperation)} onClick={() => openCancel("IMMEDIATE")} className="min-h-11 rounded-xl border border-error px-4 font-semibold text-error disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{t("billingAdmin.cancelImmediately")}</button> : null}
        {canManage && summary.canReactivate ? <button type="button" disabled={reactivationLoading || Boolean(summary.pendingOperation)} onClick={reactivate} className="min-h-11 rounded-xl border border-outline px-4 font-semibold disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{reactivationLoading ? t("billingAdmin.submitting") : t("billingAdmin.reactivate")}</button> : null}
        {canManage && summary.canOpenPortal ? <button type="button" disabled={portalFlow !== null} onClick={() => launchPortal("general")} className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-on-primary disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{portalFlow === "general" ? t("billingAdmin.opening") : t("billingAdmin.openPortal")}</button> : null}
        {canManage && summary.canUpdatePaymentMethod ? <button type="button" disabled={portalFlow !== null} onClick={() => launchPortal("payment_method_update")} className="min-h-11 rounded-xl border border-outline px-4 font-semibold disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{portalFlow === "payment_method_update" ? t("billingAdmin.opening") : t("billingAdmin.updatePayment")}</button> : null}
      </div>
    </div>
  );
}

function PreviewSummary({ preview, locale, t }: { preview: BillingChangePreview; locale: string; t: (key: string) => string }) {
  const currentLocale = locale === "ar" ? "ar-EG" : "en-US";
  const money = (minor: number) => new Intl.NumberFormat(currentLocale, { style: "currency", currency: preview.currency }).format(minor / 100);
  const date = (value: string | null) => value ? new Intl.DateTimeFormat(currentLocale, { dateStyle: "medium" }).format(new Date(value)) : t("billingAdmin.notAvailable");
  return (
    <section className="space-y-4 rounded-2xl border border-outline-variant/30 p-4" aria-labelledby="billing-preview-heading">
      <h3 id="billing-preview-heading" className="text-title-md font-bold">{t("billingAdmin.previewTitle")}</h3>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Detail label={t("billingAdmin.currentPlan")} value={`${preview.currentPackage.name} · v${preview.currentPackage.version}`} />
        <Detail label={t("billingAdmin.targetPlan")} value={`${preview.targetPackage.name} · v${preview.targetPackage.version}`} />
        <Detail label={t("billingAdmin.billingInterval")} value={t(`billingAdmin.interval.${preview.billingInterval}`)} />
        <Detail label={t("billingAdmin.previewExpires")} value={date(preview.expiresAt)} />
        <Detail label={t("billingAdmin.amountDue")} value={money(preview.amountDueMinor)} />
        <Detail label={t("billingAdmin.amountCredit")} value={money(preview.amountCreditMinor)} />
        <Detail label={t("billingAdmin.effectiveDate")} value={date(preview.effectiveAt)} />
        <Detail label={t("billingAdmin.nextBillingDate")} value={date(preview.nextBillingDate)} />
      </dl>
      {preview.entitlementImpact.length > 0 ? (
        <div>
          <h4 className="font-semibold">{t("billingAdmin.entitlementImpact")}</h4>
          <ul className="mt-2 space-y-2 text-sm">
            {preview.entitlementImpact.map((entry) => (
              <li key={entry.field} className="rounded-xl bg-surface-container px-3 py-2">
                <span className="font-medium">{t(`billingAdmin.entitlement.${entry.field}`)}</span>: {entry.current} → {entry.target} ({entry.delta > 0 ? "+" : ""}{entry.delta})
              </li>
            ))}
          </ul>
        </div>
      ) : <p className="text-sm text-on-surface-variant">{t("billingAdmin.noEntitlementChange")}</p>}
    </section>
  );
}

function InvoiceHistory({ invoices, pagination, locale, t, onLinks, onRefund, setPage, canManage }: { invoices: BillingInvoice[]; pagination: Pagination; locale: string; t: (key: string) => string; onLinks: (invoice: BillingInvoice) => void; onRefund: (invoice: BillingInvoice) => void; setPage: (page: number) => void; canManage: boolean }) {
  const currentLocale = locale === "ar" ? "ar-EG" : "en-US";
  const money = (invoice: BillingInvoice) => new Intl.NumberFormat(currentLocale, { style: "currency", currency: invoice.currency }).format(invoice.amountPaidMinor / 100);
  const date = (value: string) => new Intl.DateTimeFormat(currentLocale, { dateStyle: "medium" }).format(new Date(value));
  const refundLabel = (invoice: BillingInvoice) => invoice.reservedRefundAmountMinor > 0 ? t("billingAdmin.invoicePaidRefundPending") : invoice.refundedAmountMinor <= 0 ? t("billingAdmin.status.paid") : invoice.refundedAmountMinor >= invoice.amountPaidMinor ? t("billingAdmin.invoiceFullyRefunded") : t("billingAdmin.invoicePartiallyRefunded");
  return <>
    <div className="hidden overflow-x-auto md:block"><table className="w-full text-start"><thead className="bg-surface-container"><tr><Th>{t("billingAdmin.invoiceNumber")}</Th><Th>{t("billingAdmin.date")}</Th><Th>{t("billingAdmin.status")}</Th><Th>{t("billingAdmin.amount")}</Th><Th>{t("billingAdmin.actions")}</Th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} className="border-t border-outline-variant/20"><Td>{invoice.invoiceNumber || "—"}</Td><Td>{date(invoice.createdAt)}</Td><Td>{invoice.status === "paid" ? refundLabel(invoice) : t(`billingAdmin.status.${invoice.status}`)}</Td><Td><div>{money(invoice)}</div><div className="text-xs text-on-surface-variant">{t("billingAdmin.confirmedRefunded")}: {new Intl.NumberFormat(currentLocale, { style: "currency", currency: invoice.currency }).format(invoice.refundedAmountMinor / 100)}</div><div className="text-xs text-on-surface-variant">{t("billingAdmin.pendingReserved")}: {new Intl.NumberFormat(currentLocale, { style: "currency", currency: invoice.currency }).format(invoice.reservedRefundAmountMinor / 100)}</div></Td><Td><InvoiceAction invoice={invoice} t={t} onLinks={onLinks} onRefund={onRefund} canManage={canManage} /></Td></tr>)}</tbody></table></div>
    <div className="space-y-3 p-4 md:hidden">{invoices.map((invoice) => <article key={invoice.id} className="rounded-2xl border border-outline-variant p-4"><h3 className="font-bold">{invoice.invoiceNumber || t("billingAdmin.invoice")}</h3><dl className="mt-2 grid grid-cols-2 gap-2"><Detail label={t("billingAdmin.date")} value={date(invoice.createdAt)} /><Detail label={t("billingAdmin.amount")} value={money(invoice)} /><Detail label={t("billingAdmin.status")} value={invoice.status === "paid" ? refundLabel(invoice) : t(`billingAdmin.status.${invoice.status}`)} /><Detail label={t("billingAdmin.refundableRemaining")} value={new Intl.NumberFormat(currentLocale, { style: "currency", currency: invoice.currency }).format(invoice.remainingRefundableMinor / 100)} /></dl><div className="mt-3"><InvoiceAction invoice={invoice} t={t} onLinks={onLinks} onRefund={onRefund} canManage={canManage} /></div></article>)}</div>
    <nav aria-label={t("billingAdmin.pagination")} className="flex items-center justify-between border-t border-outline-variant/30 p-4"><button type="button" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">{t("billingAdmin.previous")}</button><span>{pagination.page} / {Math.max(1, pagination.totalPages)}</span><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-50">{t("billingAdmin.next")}</button></nav>
  </>;
}

function InvoiceAction({ invoice, t, onLinks, onRefund, canManage }: { invoice: BillingInvoice; t: (key: string) => string; onLinks: (invoice: BillingInvoice) => void; onRefund: (invoice: BillingInvoice) => void; canManage: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {invoice.hostedInvoiceAvailable || invoice.invoicePdfAvailable || invoice.receiptAvailable ? <button type="button" onClick={() => onLinks(invoice)} aria-label={`${t("billingAdmin.openInvoice")} ${invoice.invoiceNumber}`} className="rounded-lg border border-outline px-3 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{t("billingAdmin.openInvoice")} <span className="sr-only">{t("billingAdmin.externalLink")}</span></button> : <span className="text-sm text-on-surface-variant">{t("billingAdmin.noLinks")}</span>}
      {canManage && invoice.canRequestRefund ? <button type="button" onClick={() => onRefund(invoice)} className="rounded-lg border border-outline px-3 py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{t("billingAdmin.requestRefund")}</button> : null}
    </div>
  );
}
function RefundRequestForm({ invoice, locale, t, mode, amount, reason, eligibility, error, onModeChange, onAmountChange, onReasonChange }: { invoice: BillingInvoice; locale: string; t: (key: string) => string; mode: "FULL" | "PARTIAL"; amount: string; reason: RefundReason; eligibility: Loadable<RefundEligibilityPreview> | null; error: string; onModeChange: (value: "FULL" | "PARTIAL") => void; onAmountChange: (value: string) => void; onReasonChange: (value: RefundReason) => void }) {
  const currentLocale = locale === "ar" ? "ar-EG" : "en-US";
  const money = new Intl.NumberFormat(currentLocale, { style: "currency", currency: invoice.currency }).format(invoice.remainingRefundableMinor / 100);
  return <div className="space-y-4">
    <p className="text-sm text-on-surface-variant">{t("billingAdmin.refundConsequence")}</p>
    <Detail label={t("billingAdmin.invoiceNumber")} value={invoice.invoiceNumber || t("billingAdmin.invoice")} />
    <Detail label={t("billingAdmin.refundableRemaining")} value={money} />
    {eligibility?.kind === "loading" ? <p role="status">{t("billingAdmin.refundEligibilityLoading")}</p> : null}
    {eligibility?.kind === "error" ? <p role="alert">{eligibility.message}</p> : null}
    {eligibility?.kind === "ready" ? <div className="rounded-xl bg-surface-container p-3"><Detail label={t("billingAdmin.maximumEligible")} value={new Intl.NumberFormat(currentLocale, { style: "currency", currency: invoice.currency }).format(eligibility.data.maximumEligibleRefundMinor / 100)} /><p className="mt-2 text-sm">{t("billingAdmin.periodElapsed")}: {eligibility.data.periodElapsedPercent}%</p>{eligibility.data.usage.map((metric) => <p key={metric.dimension} className="text-sm">{t(`billingAdmin.entitlement.${metric.dimension}`)}: {metric.percent}%</p>)}</div> : null}
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{t("billingAdmin.refundMode")}</legend>
      <div className="flex gap-3">
        {(["FULL", "PARTIAL"] as const).map((value) => <label key={value} className="flex items-center gap-2 rounded-xl border border-outline px-3 py-2"><input type="radio" checked={mode === value} disabled={value === "FULL" && eligibility?.kind === "ready" && eligibility.data.maximumEligibleRefundMinor !== invoice.remainingRefundableMinor} onChange={() => onModeChange(value)} /> <span>{t(`billingAdmin.refundMode.${value.toLowerCase()}`)}</span></label>)}
      </div>
    </fieldset>
    {mode === "PARTIAL" ? <label className="flex flex-col gap-2"><span className="text-sm font-semibold">{t("billingAdmin.refundAmount")}</span><input inputMode="decimal" value={amount} onChange={(event) => onAmountChange(event.target.value)} className="min-h-11 rounded-xl border border-outline px-3 py-2" aria-describedby="refund-amount-help" /><span id="refund-amount-help" className="text-xs text-on-surface-variant">{invoice.currency}</span></label> : null}
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{t("billingAdmin.refundReason")}</span>
      <select value={reason} onChange={(event) => onReasonChange(event.target.value as RefundReason)} className="min-h-11 rounded-xl border border-outline px-3 py-2">
        <option value="VOLUNTARY_CANCELLATION">{t("billingAdmin.refundReason.voluntary_cancellation")}</option>
        <option value="SERVICE_NOT_DELIVERED">{t("billingAdmin.refundReason.service_not_delivered")}</option>
        <option value="DUPLICATE_CHARGE">{t("billingAdmin.refundReason.duplicate_charge")}</option>
        <option value="BILLING_ERROR">{t("billingAdmin.refundReason.billing_error")}</option>
      </select>
    </label>
    {error ? <p role="alert" className="rounded-xl border border-error/40 bg-error-container p-3 text-on-error-container">{error}</p> : null}
  </div>;
}
function RefundHistory({ refunds, locale, t }: { refunds: BillingRefund[]; locale: string; t: (key: string) => string }) {
  const currentLocale = locale === "ar" ? "ar-EG" : "en-US";
  const money = (amountMinor: number, currency: string) => new Intl.NumberFormat(currentLocale, { style: "currency", currency }).format(amountMinor / 100);
  const date = (value: string) => new Intl.DateTimeFormat(currentLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const message = (refund: BillingRefund) => refund.status === "SUCCEEDED" && refund.subscriptionImpactStatus === "PENDING" ? t("billingAdmin.refundMessage.succeeded_cancel_pending") : refund.status === "SUCCEEDED" && refund.subscriptionImpactStatus === "SUCCEEDED" ? t("billingAdmin.refundMessage.succeeded_canceled") : refund.status === "SUCCEEDED" ? t("billingAdmin.refundMessage.succeeded_active") : t(`billingAdmin.refundMessage.${refund.status.toLowerCase()}`);
  return <div className="space-y-3 p-4">{refunds.map((refund) => <article key={refund.id} className="rounded-2xl border border-outline-variant p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{refund.invoiceNumber || t("billingAdmin.refund")}</h3><p className="text-sm text-on-surface-variant">{date(refund.requestedAt)}</p></div><span className="rounded-full bg-surface-container px-3 py-1 text-xs font-semibold">{t(`billingAdmin.refundStatus.${refund.status.toLowerCase()}`)}</span></div><p role="status" className="mt-2 text-sm">{message(refund)}</p><dl className="mt-3 grid gap-2 sm:grid-cols-2"><Detail label={t("billingAdmin.amount")} value={money(refund.amountMinor, refund.currency)} /><Detail label={t("billingAdmin.refundReason")} value={t(`billingAdmin.refundReason.${(refund.reasonCode ?? refund.reason).toLowerCase()}`)} /><Detail label={t("billingAdmin.refundableRemaining")} value={money(refund.refundableRemainingMinor, refund.currency)} /><Detail label={t("billingAdmin.requestedBy")} value={refund.requestedBy.name || refund.requestedBy.email || refund.requestedBy.id} /></dl>{refund.rejectionReason ? <p className="mt-3 rounded-xl bg-error-container/40 p-3 text-sm">{refund.rejectionReason}</p> : null}{refund.failureCode ? <p className="mt-3 text-sm text-on-surface-variant">{t("billingAdmin.refundRetryGuidance")}</p> : null}</article>)}</div>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-on-surface-variant">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th scope="col" className="px-4 py-3 text-start text-sm font-bold">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="px-4 py-3 text-sm">{children}</td>; }
function Loading({ label }: { label: string }) { return <div role="status" aria-busy="true" className="animate-pulse space-y-3"><div className="h-5 w-40 rounded bg-surface-container-high"/><div className="h-14 rounded bg-surface-container-high"/><span className="sr-only">{label}</span></div>; }
function ErrorState({ message, retry, label }: { message: string; retry: () => void; label: string }) { return <div role="alert"><p>{message}</p><button type="button" onClick={retry} className="mt-3 rounded-lg border px-3 py-2 font-semibold">{label}</button></div>; }

function safeMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof ApiError) {
    if (error.code === "BILLING_PROVIDER_UNAVAILABLE") return t("billingAdmin.providerUnavailable");
    if (error.code === "BILLING_PROVIDER_CONFIGURATION_INVALID") return t("billingAdmin.configurationError");
    if (error.code === "BILLING_PREVIEW_STALE" || error.code === "BILLING_SUBSCRIPTION_CHANGED") return t("billingAdmin.previewStale");
    if (error.code === "BILLING_OPERATION_ALREADY_PENDING" || error.code === "BILLING_OPERATION_CONFLICT") return t("billingAdmin.operationConflict");
    if (error.code === "BILLING_OPERATION_NOT_ALLOWED") return t("billingAdmin.operationNotAllowed");
    if (error.code === "BILLING_REFUND_AMOUNT_INVALID") return t("billingAdmin.refundAmountInvalid");
    if (error.code === "BILLING_REFUND_NOT_FOUND") return t("billingAdmin.refundNotFound");
    if (error.status === 403) return t("permissions.deniedMessage");
  }
  return t("billingAdmin.loadError");
}
