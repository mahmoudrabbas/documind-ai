"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listBatches } from "@/services/imports.service";
import type { ImportBatchView } from "@/types/api/imports.types";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";
import {
  DashboardPageHeader,
  DashboardPanel,
} from "@/components/ui/DashboardPage";

type Pagination = {
  page: number;
  pageSize: number;
  totalPages: number;
  totalRecords: number;
};

/* `value` is the API's status code (empty string = no filter) and is sent
   verbatim to `listBatches`. Only the option text is translated. */
const STATUS_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: "", labelKey: "dashboard.import.allStatuses" },
  { value: "PENDING_MAPPING", labelKey: "dashboard.importStatus.pending_mapping" },
  { value: "VALIDATING", labelKey: "dashboard.importStatus.validating" },
  { value: "PROCESSING", labelKey: "dashboard.importStatus.processing" },
  { value: "COMPLETED", labelKey: "dashboard.importStatus.completed" },
  { value: "PARTIALLY_COMPLETED", labelKey: "dashboard.importStatus.partially_completed" },
  { value: "FAILED", labelKey: "dashboard.importStatus.failed" },
  { value: "CANCELLED", labelKey: "dashboard.importStatus.cancelled" },
];

const STATUS_BADGE: Record<string, string> = {
  PENDING_MAPPING: "bg-neutral-100 text-neutral-800",
  VALIDATING: "bg-blue-100 text-blue-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  PARTIALLY_COMPLETED: "bg-amber-100 text-amber-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-neutral-100 text-neutral-800",
};

const DEFAULT_PAGE_SIZE = 10;

export default function ImportHistoryPage() {
  const router = useRouter();
  const { t } = useI18n();
  const intlLocale = useIntlLocale();
  const [batches, setBatches] = useState<ImportBatchView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalPages: 1,
    totalRecords: 0,
  });

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listBatches(
        page,
        DEFAULT_PAGE_SIZE,
        statusFilter || undefined,
      );
      setBatches(res.data.batches);
      setPagination(res.data.pagination);
    } catch {
      setError(t("dashboard.import.loadHistoryError"));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, t]);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  function handleStatusChange(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  function formatTiming(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString(intlLocale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

    return (
      <>
        <DashboardPageHeader
          eyebrow={
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
              <span className="material-symbols-outlined text-[16px]">
                history
              </span>
              {t("dashboard.import.historyEyebrow")}
            </div>
          }
          title={t("dashboard.import.historyTitle")}
          description={t("dashboard.import.historyDescription")}
        />

        <DashboardPanel>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-label-sm font-medium text-on-surface-variant">
                {t("dashboard.import.filterByStatus")}
              </span>
              <select
                className="rounded-md border border-outline-variant bg-surface px-3 py-1.5 text-sm text-on-surface shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={statusFilter}
                onChange={(event) => handleStatusChange(event.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="shrink-0 rounded-full bg-surface-container-low px-3 py-1 text-label-sm font-bold text-on-surface-variant">
              {t("dashboard.import.pageOf", {
                page: String(pagination.page),
                totalPages: String(pagination.totalPages),
              })}
            </div>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin">
                progress_activity
              </span>
              {t("dashboard.import.loadingHistory")}
            </div>
          ) : (
            <div className="max-w-full overflow-x-auto rounded-xl border border-outline-variant/30">
              <table className="w-full min-w-[900px] divide-y divide-outline-variant/30 text-start text-sm">
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("dashboard.import.colFileName")}
                    </th>
                    <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("dashboard.import.colStatus")}
                    </th>
                    <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("dashboard.import.total")}
                    </th>
                    <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("dashboard.import.valid")}
                    </th>
                    <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("dashboard.import.invalid")}
                    </th>
                    <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("dashboard.import.created")}
                    </th>
                    <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("dashboard.import.failed")}
                    </th>
                    <th className="px-4 py-3 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("dashboard.import.colCreatedAt")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                  {batches.length > 0 ? (
                    batches.map((batch) => (
                      <tr
                        key={batch.id}
                        className="cursor-pointer transition-colors hover:bg-surface-container-low/50"
                        onClick={() =>
                          router.push(
                            `/dashboard/users/import/${batch.id}`,
                          )
                        }
                      >
                        <td className="px-4 py-4 font-medium text-on-surface">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-[18px] text-outline">
                              description
                            </span>
                            {batch.originalFileName}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                              STATUS_BADGE[batch.status] ??
                              "bg-surface-container text-on-surface-variant"
                            }`}
                          >
                            {codeLabel(
                              t,
                              "dashboard.importStatus",
                              batch.status,
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-on-surface-variant">
                          {batch.summary.totalRows}
                        </td>
                        <td className="px-4 py-4 text-emerald-700">
                          {batch.summary.validRows}
                        </td>
                        <td className="px-4 py-4 text-red-700">
                          {batch.summary.invalidRows}
                        </td>
                        <td className="px-4 py-4 text-on-surface-variant">
                          {batch.summary.createdCount}
                        </td>
                        <td className="px-4 py-4 text-red-700">
                          {batch.summary.failedCount}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-on-surface-variant">
                          {formatTiming(batch.createdAt)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-8 text-center text-sm text-on-surface-variant"
                      >
                        {t("dashboard.import.noImportsFound")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-4 py-2 text-label-md font-bold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page <= 1}
              onClick={() =>
                setPage((current) => Math.max(1, current - 1))
              }
            >
              <span className="material-symbols-outlined text-[18px] rtl:rotate-180">
                chevron_left
              </span>
              {t("dashboard.import.previous")}
            </button>
            <div className="text-label-sm font-medium text-on-surface-variant">
              {t("dashboard.import.showingImports", {
                shown: String(batches.length),
                total: String(pagination.totalRecords),
              })}
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-bold text-on-primary shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page >= pagination.totalPages}
              onClick={() =>
                setPage((current) =>
                  Math.min(pagination.totalPages, current + 1),
                )
              }
            >
              {t("common.next")}
              <span className="material-symbols-outlined text-[18px] rtl:rotate-180">
                chevron_right
              </span>
            </button>
          </div>
        </DashboardPanel>
      </>
    );
}
