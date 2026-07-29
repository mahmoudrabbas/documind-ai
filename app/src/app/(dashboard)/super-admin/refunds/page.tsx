"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PermissionBoundary } from "@/components/auth/permission-boundary";
import { DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui/DashboardPage";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { PlatformState, PlatformTable, StatusPill } from "@/components/super-admin/platform-ui";
import { useI18n } from "@/providers/i18n-provider";
import { usePermissions } from "@/providers/permission-provider";
import {
  confirmPlatformRefund,
  getPlatformRefund,
  listPlatformRefunds,
  rejectPlatformRefund,
  retryPlatformRefund,
} from "@/services/billing.service";
import type { BillingRefund, RefundStatus } from "@/types/api/billing.types";
import { Permission } from "@/types/api/permissions.types";

export default function SuperAdminRefundPage() {
  return (
    <PermissionBoundary permissions={[Permission.BILLING_READ]}>
      <RefundReviewContent />
    </PermissionBoundary>
  );
}

function RefundReviewContent() {
  const { t, locale, dir } = useI18n();
  const permissions = usePermissions();
  const canConfirm = permissions.can(Permission.BILLING_REFUND_CONFIRM);
  const [status, setStatus] = useState<RefundStatus | "">("");
  const [refunds, setRefunds] = useState<BillingRefund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRefund, setSelectedRefund] = useState<BillingRefund | null>(null);
  const [confirmRefund, setConfirmRefund] = useState<BillingRefund | null>(null);
  const [retryRefund, setRetryRefund] = useState<BillingRefund | null>(null);
  const [rejectRefund, setRejectRefund] = useState<BillingRefund | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await listPlatformRefunds({ page: 1, pageSize: 20, status: status || undefined }, signal);
      setRefunds(response.data.refunds);
    } catch {
      if (!signal?.aborted) setError(t("billingAdmin.loadError"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [status, t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const pendingReviewCount = useMemo(
    () => refunds.filter((refund) => refund.status === "REQUESTED").length,
    [refunds],
  );

  const review = useCallback(async (refundId: string) => {
    setNotice("");
    try {
      const response = await getPlatformRefund(refundId);
      setSelectedRefund(response.data);
    } catch {
      setNotice(t("billingAdmin.loadError"));
    }
  }, [t]);

  async function runAction(action: "confirm" | "retry" | "reject") {
    const target = action === "confirm" ? confirmRefund : action === "retry" ? retryRefund : rejectRefund;
    if (!target) return;
    setSubmitting(true);
    setNotice("");
    try {
      if (action === "confirm") {
        await confirmPlatformRefund(target.id);
        setConfirmRefund(null);
      } else if (action === "retry") {
        await retryPlatformRefund(target.id);
        setRetryRefund(null);
      } else {
        await rejectPlatformRefund(target.id, rejectReason);
        setRejectRefund(null);
        setRejectReason("");
      }
      setNotice(t("refundAdmin.actionSuccess"));
      await load();
      if (selectedRefund?.id === target.id) {
        const response = await getPlatformRefund(target.id);
        setSelectedRefund(response.data);
      }
    } catch {
      setNotice(t("billingAdmin.loadError"));
    } finally {
      setSubmitting(false);
    }
  }

  const formatMoney = (amountMinor: number, currency: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
      style: "currency",
      currency,
    }).format(amountMinor / 100);

  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
      : "—";

  return (
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        title={t("refundAdmin.title")}
        description={t("refundAdmin.description")}
      />

      <DashboardPanel className="mb-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex min-w-52 flex-col gap-2">
            <span className="text-sm font-semibold">{t("refundAdmin.statusFilter")}</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as RefundStatus | "")}
              className="min-h-11 rounded-xl border border-outline px-3 py-2"
            >
              <option value="">{t("refundAdmin.statusAll")}</option>
              {["REQUESTED", "PROVIDER_PENDING", "SUCCEEDED", "FAILED", "REJECTED", "RETRY_PENDING"].map((value) => (
                <option key={value} value={value}>{t(`billingAdmin.refundStatus.${value.toLowerCase()}`)}</option>
              ))}
            </select>
          </label>
          <p className="text-sm text-on-surface-variant">{t("refundAdmin.pendingReview")}: {pendingReviewCount}</p>
        </div>
        {notice ? <p className="mt-3 text-sm" aria-live="polite">{notice}</p> : null}
      </DashboardPanel>

      <PlatformState loading={loading} error={error} onRetry={() => void load()} />

      {!loading && !error && refunds.length === 0 ? (
        <DashboardPanel><p>{t("refundAdmin.noRefunds")}</p></DashboardPanel>
      ) : null}

      {!loading && !error && refunds.length > 0 ? (
        <PlatformTable
          headers={[
            t("refundAdmin.company"),
            t("refundAdmin.invoice"),
            t("refundAdmin.package"),
            t("refundAdmin.amount"),
            t("refundAdmin.status"),
            t("refundAdmin.requestedAt"),
            t("refundAdmin.actions"),
          ]}
          minWidth="1100px"
        >
          {refunds.map((refund) => (
            <tr key={refund.id}>
              <td className="cell">{refund.tenant.name ?? refund.tenant.slug ?? refund.tenantId}</td>
              <td className="cell">{refund.invoiceNumber ?? "—"}</td>
              <td className="cell">{refund.subscription?.packageName ?? "—"}</td>
              <td className="cell">{formatMoney(refund.amountMinor, refund.currency)}</td>
              <td className="cell"><StatusPill value={refund.status.toLowerCase()} /></td>
              <td className="cell">{formatDate(refund.requestedAt)}</td>
              <td className="cell">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void review(refund.id)} className="rounded border px-2 py-1 text-xs font-bold">{t("refundAdmin.viewDetails")}</button>
                  {canConfirm && refund.status === "REQUESTED" ? <button type="button" onClick={() => setConfirmRefund(refund)} className="rounded bg-primary px-2 py-1 text-xs font-bold text-on-primary">{t("refundAdmin.confirm")}</button> : null}
                  {canConfirm && refund.status === "REQUESTED" ? <button type="button" onClick={() => setRejectRefund(refund)} className="rounded border border-error px-2 py-1 text-xs font-bold text-error">{t("refundAdmin.reject")}</button> : null}
                  {canConfirm && refund.status === "RETRY_PENDING" ? <button type="button" onClick={() => setRetryRefund(refund)} className="rounded bg-secondary px-2 py-1 text-xs font-bold text-on-secondary">{t("refundAdmin.retryAction")}</button> : null}
                </div>
              </td>
            </tr>
          ))}
        </PlatformTable>
      ) : null}

      <Modal open={Boolean(selectedRefund)} onClose={() => setSelectedRefund(null)} title={t("refundAdmin.detailTitle")} maxWidth="max-w-2xl">
        {selectedRefund ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Detail label={t("refundAdmin.company")} value={selectedRefund.tenant.name ?? selectedRefund.tenant.slug ?? selectedRefund.tenantId} />
            <Detail label={t("refundAdmin.invoice")} value={selectedRefund.invoiceNumber ?? "—"} />
            <Detail label={t("refundAdmin.package")} value={selectedRefund.subscription?.packageName ?? "—"} />
            <Detail label={t("refundAdmin.amount")} value={formatMoney(selectedRefund.amountMinor, selectedRefund.currency)} />
            <Detail label={t("refundAdmin.remaining")} value={formatMoney(selectedRefund.refundableRemainingMinor, selectedRefund.currency)} />
            <Detail label={t("refundAdmin.requester")} value={selectedRefund.requestedBy.name ?? selectedRefund.requestedBy.email ?? selectedRefund.requestedBy.id} />
            <Detail label={t("refundAdmin.reason")} value={t(`billingAdmin.refundReason.${selectedRefund.reason}`)} />
            <Detail label={t("refundAdmin.status")} value={t(`billingAdmin.refundStatus.${selectedRefund.status.toLowerCase()}`)} />
            {selectedRefund.failureCode ? <Detail label={t("refundAdmin.failureCode")} value={selectedRefund.failureCode} /> : null}
            {selectedRefund.rejectionReason ? <Detail label={t("refundAdmin.rejectionReason")} value={selectedRefund.rejectionReason} /> : null}
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmRefund)}
        title={t("refundAdmin.confirmTitle")}
        description={t("refundAdmin.confirmDescription")}
        confirmLabel={t("refundAdmin.confirm")}
        cancelLabel={t("common.cancel")}
        variant="primary"
        isLoading={submitting}
        error={null}
        onCancel={() => !submitting && setConfirmRefund(null)}
        onConfirm={() => void runAction("confirm")}
      />

      <Modal
        open={Boolean(rejectRefund)}
        onClose={() => !submitting && setRejectRefund(null)}
        title={t("refundAdmin.rejectTitle")}
        maxWidth="max-w-xl"
        footer={(
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setRejectRefund(null)} className="rounded-lg border px-4 py-2 font-semibold">{t("common.cancel")}</button>
            <button type="button" onClick={() => void runAction("reject")} disabled={!rejectReason.trim() || submitting} className="rounded-lg bg-error px-4 py-2 font-semibold text-on-error disabled:opacity-60">{t("refundAdmin.reject")}</button>
          </div>
        )}
      >
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{t("refundAdmin.rejectionReason")}</span>
          <textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={4} className="rounded-xl border border-outline px-3 py-2" placeholder={t("refundAdmin.rejectPlaceholder")} />
        </label>
      </Modal>

      <ConfirmDialog
        open={Boolean(retryRefund)}
        title={t("refundAdmin.retryTitle")}
        description={t("refundAdmin.retryDescription")}
        confirmLabel={t("refundAdmin.retryAction")}
        cancelLabel={t("common.cancel")}
        variant="warning"
        isLoading={submitting}
        error={null}
        onCancel={() => !submitting && setRetryRefund(null)}
        onConfirm={() => void runAction("retry")}
      />
    </DashboardPage>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-on-surface-variant">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
