"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui";
import { getAllFailedProcessingJobs } from "@/services/processingProgress.service";
import * as processingProgressService from "@/services/processingProgress.service";
import type { ProcessingRunView } from "@/types/api/processingProgress.types";
import { ProcessingStatusBadge } from "@/components/documents/ProcessingStatusBadge";
import { ProcessingTimeline } from "@/components/documents/ProcessingTimeline";
import { RetryConfirmDialog, ReprocessConfirmDialog } from "@/components/documents/ProcessingConfirmDialogs";
import { ApiError } from "@/lib/api-client";
import { useI18n, useIntlLocale } from "@/providers/i18n-provider";
import { codeLabel } from "@/lib/i18n/code-label";

export default function SuperAdminProcessingOverviewPage() {
  const { t, dir } = useI18n();
  const intlLocale = useIntlLocale();
  const [runs, setRuns] = useState<ProcessingRunView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [retryDialogRun, setRetryDialogRun] = useState<ProcessingRunView | null>(null);
  const [reprocessDialogRun, setReprocessDialogRun] = useState<ProcessingRunView | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [retryActionError, setRetryActionError] = useState<string | null>(null);
  const [reprocessActionError, setReprocessActionError] = useState<string | null>(null);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAllFailedProcessingJobs({ page, limit });
      setRuns(res.data.runs);
      setTotal(res.data.pagination.totalRecords);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("superAdmin.processingOverviewLoadError"));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRetry = useCallback(async (run: ProcessingRunView) => {
    setIsRetrying(true);
    setRetryActionError(null);
    try {
      await processingProgressService.retryProcessing(run.documentId);
      setRetryDialogRun(null);
      await load();
    } catch (err) {
      setRetryActionError(err instanceof Error ? err.message : t("superAdmin.processingOverviewRetryError"));
    } finally {
      setIsRetrying(false);
    }
  }, [load, t]);

  const handleReprocess = useCallback(async (run: ProcessingRunView) => {
    setIsReprocessing(true);
    setReprocessActionError(null);
    try {
      await processingProgressService.reprocessDocument(run.documentId);
      setReprocessDialogRun(null);
      await load();
    } catch (err) {
      setReprocessActionError(err instanceof Error ? err.message : t("superAdmin.processingOverviewReprocessError"));
    } finally {
      setIsReprocessing(false);
    }
  }, [load, t]);

  return (
    <DashboardPage dir={dir}>
      <DashboardPageHeader
        title={t("superAdmin.processingOverviewTitle")}
        description={t("superAdmin.processingOverviewDesc")}
      />

      {loading && (
        <DashboardPanel>
          <div className="space-y-3" role="status">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
            <span className="sr-only">{t("common.loading")}</span>
          </div>
        </DashboardPanel>
      )}

      {error && (
        <DashboardPanel>
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
            >
              {t("common.retry")}
            </button>
          </div>
        </DashboardPanel>
      )}

      {!loading && !error && runs.length === 0 && (
        <DashboardPanel>
          <p className="text-center text-sm text-slate-500 py-8">
            {t("superAdmin.processingOverviewEmpty")}
          </p>
        </DashboardPanel>
      )}

      {!loading && !error && runs.length > 0 && (
        <>
          <DashboardPanel padding="none">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full border-collapse text-start text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("superAdmin.tableTenant")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("superAdmin.tableDocument")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("superAdmin.tableStatus")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("superAdmin.tableFailedStage")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("superAdmin.tableError")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("superAdmin.tableRetries")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("superAdmin.tableFailedAt")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("superAdmin.tableActions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4 text-xs text-slate-500 font-mono max-w-[100px] truncate" title={run.tenantId}>
                        {run.tenantId.slice(0, 8)}...
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                          className="text-sm font-medium text-blue-600 hover:underline text-start"
                        >
                          {run.documentId.slice(0, 12)}...
                        </button>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {t("superAdmin.documentVersion", {
                            version: String(run.documentVersion),
                          })}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {(() => {
                          const runStatus = run.status;
                          return <ProcessingStatusBadge status={runStatus} />;
                        })()}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {run.currentStage
                          ? codeLabel(t, "documents.stage", run.currentStage)
                          : "—"}
                      </td>
                      <td className="px-4 py-4 max-w-[200px]">
                        <p className="text-sm font-medium text-red-600">
                          {run.errorCode
                            ? codeLabel(t, "documents.errorCode", run.errorCode)
                            : "—"}
                        </p>
                        {run.errorMessage && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate" title={run.errorMessage}>
                            {run.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-500">
                        {run.retryCount} / {run.maxRetries}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-500">
                        {run.failedAt
                          ? new Date(run.failedAt).toLocaleString(intlLocale)
                          : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setRetryDialogRun(run)}
                          >
                            <span className="material-symbols-outlined me-1 text-[14px]">refresh</span>
                            {t("documents.retry")}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setReprocessDialogRun(run)}
                          >
                            <span className="material-symbols-outlined me-1 text-[14px]">replay</span>
                            {t("documents.reprocess")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DashboardPanel>

          {expandedRunId && (
            <DashboardPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">{t("superAdmin.processingOverviewTimelineTitle")}</h3>
                <button
                  type="button"
                  onClick={() => setExpandedRunId(null)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  {t("common.close")}
                </button>
              </div>
              {runs
                .filter((r) => r.id === expandedRunId)
                .map((run) => (
                  <ProcessingTimeline key={run.id} run={run} />
                ))}
            </DashboardPanel>
          )}

          {total > limit && (
            <div className="flex items-center justify-between">
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                {t("common.previous")}
              </Button>
              <span className="text-sm text-slate-500">
                {t("common.pageOf", {
                  page: String(page),
                  totalPages: String(Math.ceil(total / limit)),
                })}
              </span>
              <Button
                variant="secondary"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / limit)}
              >
                {t("common.next")}
              </Button>
            </div>
          )}
        </>
      )}

      <RetryConfirmDialog
        open={!!retryDialogRun}
        onConfirm={() => retryDialogRun && void handleRetry(retryDialogRun)}
        onCancel={() => { setRetryDialogRun(null); setRetryActionError(null); }}
        isLoading={isRetrying}
        error={retryActionError}
      />
      <ReprocessConfirmDialog
        open={!!reprocessDialogRun}
        onConfirm={() => reprocessDialogRun && void handleReprocess(reprocessDialogRun)}
        onCancel={() => { setReprocessDialogRun(null); setReprocessActionError(null); }}
        isLoading={isReprocessing}
        error={reprocessActionError}
      />
    </DashboardPage>
  );
}
