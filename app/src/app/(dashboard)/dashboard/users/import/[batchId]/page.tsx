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
import {
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";

const ROW_STATE_BADGE: Record<ImportRowState, string> = {
  VALID: "bg-emerald-100 text-emerald-800",
  WARNING: "bg-amber-100 text-amber-800",
  INVALID: "bg-red-100 text-red-800",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING_MAPPING: "bg-neutral-100 text-neutral-800",
  VALIDATING: "bg-blue-100 text-blue-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  PARTIALLY_COMPLETED: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-neutral-100 text-neutral-800",
};

const CANCELLABLE_STATUSES = new Set<ImportBatchStatus>([
  "PENDING_MAPPING",
  "VALIDATING",
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
        err instanceof ApiError ? err.message : "Failed to load batch details.",
      );
    } finally {
      setLoading(false);
    }
  }, [batchId]);

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
  }, [batch?.status, loadData, stopPolling]);

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    try {
      const res = await cancelBatch(batchId);
      setBatch(res.data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to cancel import.",
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
        err instanceof ApiError ? err.message : "Failed to retry failed rows.",
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
    return new Date(dateStr).toLocaleDateString("en-US", {
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
            Loading batch details...
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
              Batch not found
            </h2>
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <button
              type="button"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-bold text-on-primary shadow-sm transition-all hover:opacity-90"
              onClick={() => router.push("/dashboard/users/import/history")}
            >
              Back to history
            </button>
          </div>
        </DashboardPanel>
    );
  }

  const isProcessing =
    batch.status === "PROCESSING" || batch.status === "VALIDATING";
  const isTerminal =
    batch.status === "COMPLETED" ||
    batch.status === "PARTIALLY_COMPLETED" ||
    batch.status === "FAILED" ||
    batch.status === "CANCELLED";
  const canCancel = CANCELLABLE_STATUSES.has(batch.status) && !cancelling;
  const canRetry = RETRYABLE_STATUSES.has(batch.status) && !retrying;

  const filteredRows =
    rowFilter === "FAILED"
      ? rows.filter((r) => r.state === "INVALID")
      : rows;

  return (
    <>
      <DashboardPageHeader
        eyebrow={
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            <span className="material-symbols-outlined text-[16px]">
              description
            </span>
            Import batch
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
              {batch.status === "PENDING_MAPPING"
                ? "Pending mapping"
                : batch.status === "PARTIALLY_COMPLETED"
                  ? "Partially completed"
                  : batch.status.charAt(0) +
                    batch.status.slice(1).toLowerCase()}
            </span>
          </span>
        }
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
            onClick={() => router.push("/dashboard/users/import/history")}
          >
            <span className="material-symbols-outlined text-[18px]">
              arrow_back
            </span>
            Back to history
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
              This import is currently processing. Data refreshes automatically.
            </p>
          </div>
        </DashboardPanel>
      )}

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total rows", value: batch.summary.totalRows, color: "" },
          { label: "Valid", value: batch.summary.validRows, color: "text-emerald-700" },
          { label: "Warnings", value: batch.summary.warningRows, color: "text-amber-700" },
          { label: "Invalid", value: batch.summary.invalidRows, color: "text-red-700" },
          { label: "Created", value: batch.summary.createdCount, color: "text-emerald-700" },
          { label: "Failed", value: batch.summary.failedCount, color: "text-red-700" },
        ].map((stat) => (
          <DashboardPanel key={stat.label} padding="compact" className="text-center">
            <p className={`text-2xl font-bold ${stat.color || "text-on-surface"}`}>
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">{stat.label}</p>
          </DashboardPanel>
        ))}
      </div>

      {/* Timing info */}
      <DashboardPanel className="mb-6">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <span className="font-medium text-on-surface-variant">Created:</span>{" "}
            <span className="text-on-surface">{formatTiming(batch.createdAt)}</span>
          </div>
          {batch.completedAt && (
            <div>
              <span className="font-medium text-on-surface-variant">Completed:</span>{" "}
              <span className="text-on-surface">{formatTiming(batch.completedAt)}</span>
            </div>
          )}
          {batch.errorMessage && (
            <div className="w-full">
              <span className="font-medium text-red-700">Error:</span>{" "}
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
              {cancelling ? "Cancelling..." : "Cancel import"}
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
              {retrying ? "Retrying..." : "Retry failed rows"}
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
                Export CSV
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
                onClick={() => handleExport("xlsx")}
              >
                <span className="material-symbols-outlined text-[18px]">
                  file_download
                </span>
                Export XLSX
              </button>
            </>
          )}
        </div>
      </DashboardPanel>

      {/* Row-level breakdown */}
      <DashboardPanel>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-title-md font-bold text-primary">
            Row Breakdown
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-label-sm text-on-surface-variant">
              Show:
            </span>
            <select
              className="rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-sm text-on-surface shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              value={rowFilter}
              onChange={(event) =>
                setRowFilter(event.target.value as RowFilter)
              }
            >
              <option value="ALL">All rows</option>
              <option value="FAILED">Failed only</option>
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
                  State
                </th>
                <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                  Data
                </th>
                <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                  Messages
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={`transition-colors ${
                      row.state === "INVALID"
                        ? "bg-red-50/50"
                        : row.state === "WARNING"
                          ? "bg-amber-50/50"
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
                        {row.state}
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
                      ? "No failed rows."
                      : "No rows available."}
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
              Retry failed rows?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
              This will re-attempt importing {batch.summary.invalidRows} invalid
              row(s) and {batch.summary.failedCount} failed row(s). Any
              previously created records will not be duplicated.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
                onClick={() => setShowRetryConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-secondary px-4 py-2 text-label-md font-bold text-on-secondary shadow-sm transition-colors hover:bg-secondary-container hover:text-on-secondary-container"
                onClick={() => void handleRetry()}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
