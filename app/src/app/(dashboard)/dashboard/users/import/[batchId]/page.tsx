"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import {
  buildExportUrl,
  cancelBatch,
  getBatchWithRows,
  retryFailedRows,
} from "@/services/imports.service";
import type {
  ImportBatchStatus,
  ImportBatchView,
  ImportRowView,
  ImportRowState,
} from "@/types/api/imports.types";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import {
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";

const ROW_STATE_BADGE: Record<string, string> = {
  VALID: "bg-emerald-100 text-emerald-800",
  CREATED: "bg-emerald-100 text-emerald-800",
  INVITED: "bg-emerald-100 text-emerald-800",
  WARNING: "bg-amber-100 text-amber-800",
  SKIPPED: "bg-amber-100 text-amber-800",
  INVALID: "bg-red-100 text-red-800",
  FAILED: "bg-red-100 text-red-800",
  PENDING: "bg-slate-100 text-slate-800",
  PROCESSING: "bg-blue-100 text-blue-800",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING_MAPPING: "bg-neutral-100 text-neutral-800",
  VALIDATING: "bg-blue-100 text-blue-800",
  QUEUED: "bg-blue-100 text-blue-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  PARTIALLY_COMPLETED: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-neutral-100 text-neutral-800",
};

const CANCELLABLE_STATUSES = new Set<ImportBatchStatus>([
  "PENDING_MAPPING",
  "VALIDATING",
  "QUEUED",
  "PROCESSING",
]);

const RETRYABLE_STATUSES = new Set<ImportBatchStatus>([
  "FAILED",
  "PARTIALLY_COMPLETED",
]);

type RowFilter = "ALL" | "FAILED";

export default function BatchDetailPage() {
  const params = useParams();
  const batchId = params.batchId as string;
  const router = useRouter();
  const { t, tPlural } = useI18n();
  const intlLocale = useIntlLocale();

  const [batch, setBatch] = useState<ImportBatchView | null>(null);
  const [rows, setRows] = useState<ImportRowView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowFilter, setRowFilter] = useState<RowFilter>("ALL");
  const [showRetryConfirm, setShowRetryConfirm] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const res = await getBatchWithRows(batchId);
      setBatch(res.data);
      setRows(res.data.rows ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("dashboard.import.loadBatchError"),
      );
    } finally {
      setLoading(false);
    }
  }, [batchId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (
      batch &&
      (batch.status === "PROCESSING" || batch.status === "VALIDATING")
    ) {
      pollingRef.current = setInterval(() => {
        void loadData();
      }, 3000);
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [batch, loadData, stopPolling]);

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    try {
      const res = await cancelBatch(batchId);
      setBatch(res.data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("dashboard.import.cancelBatchError"),
      );
    } finally {
      setCancelling(false);
    }
  }

  async function handleRetry() {
    setRetrying(true);
    setError(null);
    setShowRetryConfirm(false);
    try {
      const res = await retryFailedRows(batchId);
      setBatch(res.data);
      await loadData();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t("dashboard.import.retryRowsError"),
      );
    } finally {
      setRetrying(false);
    }
  }

  function handleExport(format: "csv" | "xlsx") {
    const url = buildExportUrl(
      batchId,
      format,
      rowFilter === "FAILED" ? "FAILED" : undefined,
    );
    window.open(url, "_blank");
  }

  function formatTiming(dateStr?: string): string {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString(intlLocale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <DashboardPanel>
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin">
              progress_activity
            </span>
            {t("dashboard.import.loadingBatchDetails")}
          </div>
        </DashboardPanel>
    );
  }

  if (!batch) {
    return (
      <DashboardPanel>
          <div className="flex flex-col items-center py-10 text-center">
            <span className="material-symbols-outlined mb-4 text-5xl text-red-500">
              error
            </span>
            <h2 className="text-title-lg font-bold text-on-surface">
              {t("dashboard.import.batchNotFound")}
            </h2>
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <button
              type="button"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-bold text-on-primary shadow-sm transition-all hover:opacity-90"
              onClick={() => router.push("/dashboard/users/import/history")}
            >
              {t("dashboard.import.backToHistory")}
            </button>
          </div>
        </DashboardPanel>
    );
  }

  const isProcessing =
    batch.status === "PROCESSING" || batch.status === "VALIDATING" || batch.status === "QUEUED";
  const isTerminal =
    batch.status === "COMPLETED" ||
    batch.status === "PARTIALLY_COMPLETED" ||
    batch.status === "FAILED" ||
    batch.status === "CANCELLED";
  const canCancel = CANCELLABLE_STATUSES.has(batch.status) && !cancelling;
  const canRetry = RETRYABLE_STATUSES.has(batch.status) && !retrying;

  const filteredRows =
    rowFilter === "FAILED"
      ? rows.filter((r) => r.state === "INVALID" || r.state === "FAILED")
      : rows;

  return (
    <>
      <DashboardPageHeader
        eyebrow={
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            <span className="material-symbols-outlined text-[16px]">
              description
            </span>
            {t("dashboard.import.batchEyebrow")}
          </div>
        }
        title={
          <span className="flex items-center gap-3">
            {batch.originalFileName}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                STATUS_BADGE[batch.status] ??
                "bg-surface-container text-on-surface-variant"
              }`}
            >
              {codeLabel(t, "dashboard.importStatus", batch.status)}
            </span>
          </span>
        }
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
            onClick={() => router.push("/dashboard/users/import/history")}
          >
            <span className="material-symbols-outlined text-[18px] rtl:rotate-180">
              arrow_back
            </span>
            {t("dashboard.import.backToHistory")}
          </button>
        }
      />

      {error ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {isProcessing && (
        <DashboardPanel tone="muted" className="mb-6">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined animate-spin text-primary">
              progress_activity
            </span>
            <p className="text-sm font-medium text-on-surface">
              {t("dashboard.import.processingNotice")}
            </p>
          </div>
        </DashboardPanel>
      )}

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { labelKey: "dashboard.import.totalRows", value: batch.summary.totalRows, color: "" },
          { labelKey: "dashboard.import.valid", value: batch.summary.validRows, color: "text-emerald-700" },
          { labelKey: "dashboard.import.warnings", value: batch.summary.warningRows, color: "text-amber-700" },
          { labelKey: "dashboard.import.invalid", value: batch.summary.invalidRows, color: "text-red-700" },
          { labelKey: "dashboard.import.created", value: batch.summary.createdCount, color: "text-emerald-700" },
          { labelKey: "dashboard.import.failed", value: batch.summary.failedCount, color: "text-red-700" },
        ].map((stat) => (
          <DashboardPanel key={stat.labelKey} padding="compact" className="text-center">
            <p className={`text-2xl font-bold ${stat.color || "text-on-surface"}`}>
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">{t(stat.labelKey)}</p>
          </DashboardPanel>
        ))}
      </div>

      {/* Timing info */}
      <DashboardPanel className="mb-6">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <span className="font-medium text-on-surface-variant">
              {t("dashboard.import.createdAtLabel")}
            </span>{" "}
            <span className="text-on-surface">{formatTiming(batch.createdAt)}</span>
          </div>
          {batch.completedAt && (
            <div>
              <span className="font-medium text-on-surface-variant">
                {t("dashboard.import.completedAtLabel")}
              </span>{" "}
              <span className="text-on-surface">{formatTiming(batch.completedAt)}</span>
            </div>
          )}
          {batch.errorMessage && (
            <div className="w-full">
              <span className="font-medium text-red-700">
                {t("dashboard.import.errorLabel")}
              </span>{" "}
              <span className="text-red-600">{batch.errorMessage}</span>
            </div>
          )}
        </div>
      </DashboardPanel>

      {/* Actions */}
      <DashboardPanel className="mb-6">
        <div className="flex flex-wrap gap-3">
          {canCancel && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-error/30 bg-surface px-4 py-2 text-label-md font-bold text-error shadow-sm transition-colors hover:bg-error-container hover:text-on-error-container disabled:cursor-not-allowed disabled:opacity-50"
              disabled={cancelling}
              onClick={() => void handleCancel()}
            >
              <span className="material-symbols-outlined text-[18px]">
                cancel
              </span>
              {cancelling
                ? t("dashboard.import.cancelling")
                : t("dashboard.import.cancelImport")}
            </button>
          )}

          {canRetry && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-label-md font-bold text-on-secondary shadow-sm transition-colors hover:bg-secondary-container hover:text-on-secondary-container disabled:cursor-not-allowed disabled:opacity-50"
              disabled={retrying}
              onClick={() => setShowRetryConfirm(true)}
            >
              <span className="material-symbols-outlined text-[18px]">
                refresh
              </span>
              {retrying
                ? t("dashboard.import.retrying")
                : t("dashboard.import.retryFailedRows")}
            </button>
          )}

          {isTerminal && (
            <>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
                onClick={() => handleExport("csv")}
              >
                <span className="material-symbols-outlined text-[18px]">
                  file_download
                </span>
                {t("dashboard.import.exportCsv")}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
                onClick={() => handleExport("xlsx")}
              >
                <span className="material-symbols-outlined text-[18px]">
                  file_download
                </span>
                {t("dashboard.import.exportXlsx")}
              </button>
            </>
          )}
        </div>
      </DashboardPanel>

      {/* Row-level breakdown */}
      <DashboardPanel>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-title-md font-bold text-primary">
            {t("dashboard.import.rowBreakdown")}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-label-sm text-on-surface-variant">
              {t("dashboard.import.showLabel")}
            </span>
            <select
              className="rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-sm text-on-surface shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={rowFilter}
              onChange={(event) =>
                setRowFilter(event.target.value as RowFilter)
              }
            >
              <option value="ALL">{t("dashboard.import.filterAllRows")}</option>
              <option value="FAILED">{t("dashboard.import.filterFailedOnly")}</option>
            </select>
          </div>
        </div>

        <div className="max-w-full overflow-x-auto rounded-xl border border-outline-variant/30">
          <table className="w-full min-w-[600px] divide-y divide-outline-variant/30 text-start text-sm">
            <thead className="bg-surface-container-low">
              <tr>
                <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                  #
                </th>
                <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                  {t("dashboard.import.colState")}
                </th>
                <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                  {t("dashboard.import.colData")}
                </th>
                <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                  {t("dashboard.import.colMessages")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={`transition-colors ${
                      row.state === "INVALID" || row.state === "FAILED"
                        ? "bg-red-50/50"
                        : row.state === "WARNING" || row.state === "SKIPPED"
                          ? "bg-amber-50/50"
                          : row.state === "CREATED" || row.state === "INVITED"
                            ? "bg-emerald-50/50"
                            : "hover:bg-surface-container-low/50"
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-on-surface">
                      {row.rowNumber}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${ROW_STATE_BADGE[row.state]}`}
                      >
                        {codeLabel(t, "dashboard.importRowState", row.state)}
                      </span>
                    </td>
                    <td className="max-w-[300px] px-4 py-3 text-on-surface-variant">
                      <div className="space-y-0.5">
                        {Object.entries(row.data).map(([key, value]) =>
                          value ? (
                            <p key={key} className="truncate text-xs">
                              <span className="font-medium text-on-surface">
                                {key}:
                              </span>{" "}
                              {value}
                            </p>
                          ) : null,
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.errors && row.errors.length > 0 && (
                        <p className="text-xs text-red-700">
                          {row.errors.join("; ")}
                        </p>
                      )}
                      {row.warnings && row.warnings.length > 0 && (
                        <p className="text-xs text-amber-700">
                          {row.warnings.join("; ")}
                        </p>
                      )}
                      {row.errorMessage && row.state !== "CREATED" && row.state !== "INVITED" && (
                        <p className="text-xs text-red-700">
                          {row.errorMessage}
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-on-surface-variant"
                  >
                    {rowFilter === "FAILED"
                      ? t("dashboard.import.noFailedRows")
                      : t("dashboard.import.noRowsAvailable")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DashboardPanel>

      {/* Retry confirmation dialog */}
      {showRetryConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-xl">
            <h3 className="text-title-md font-bold text-on-surface">
              {t("dashboard.import.retryConfirmTitle")}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
              {t("dashboard.import.retryConfirmBody", {
                invalid: tPlural(
                  "dashboard.import.invalidRowsPhrase",
                  batch.summary.invalidRows,
                ),
                failed: tPlural(
                  "dashboard.import.failedRowsPhrase",
                  batch.summary.failedCount,
                ),
              })}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
                onClick={() => setShowRetryConfirm(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="rounded-lg bg-secondary px-4 py-2 text-label-md font-bold text-on-secondary shadow-sm transition-colors hover:bg-secondary-container hover:text-on-secondary-container"
                onClick={() => void handleRetry()}
              >
                {t("common.retry")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
