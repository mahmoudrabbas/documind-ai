"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, DashboardPage, DashboardPageHeader, DashboardPanel, AdminPagination } from "@/components/ui";
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
              <div key={n} className="h-14 animate-pulse rounded-xl bg-surface-container" />
            ))}
            <span className="sr-only">{t("common.loading")}</span>
          </div>
        </DashboardPanel>
      )}

      {error && (
        <DashboardPanel>
          <div role="alert" className="rounded-xl border border-error/20 bg-error-container/10 p-4 text-on-error-container">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 rounded-lg bg-error px-4 py-2 text-sm font-semibold text-white"
            >
              {t("common.retry")}
            </button>
          </div>
        </DashboardPanel>
      )}

      {!loading && !error && runs.length === 0 && (
        <DashboardPanel>
          <p className="text-center text-sm text-on-surface-variant py-8">
            {t("superAdmin.processingOverviewEmpty")}
          </p>
        </DashboardPanel>
      )}

      {!loading && !error && runs.length > 0 && (
        <>
          <DashboardPanel padding="none">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full border-collapse text-start text-sm">
                <thead className="border-b border-outline-variant/30 bg-surface-container-low">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("superAdmin.tableTenant")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("superAdmin.tableDocument")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("superAdmin.tableStatus")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("superAdmin.tableFailedStage")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("superAdmin.tableError")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("superAdmin.tableRetries")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("superAdmin.tableFailedAt")}
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                      {t("superAdmin.tableActions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-4 py-4 text-xs text-on-surface-variant max-w-[150px] truncate" title={run.tenantName ?? run.tenantId}>
                        {run.tenantName ?? run.tenantId.slice(0, 8) + "..."}
                      </td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                          className="text-sm font-medium text-blue-600 hover:underline text-start"
                        >
                          {run.documentName ?? run.documentId.slice(0, 12) + "..."}
                        </button>
                        <p className="text-xs text-on-surface-variant mt-0.5">
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
                      <td className="px-4 py-4 text-sm text-on-surface-variant">
                        {run.currentStage
                          ? codeLabel(t, "documents.stage", run.currentStage)
                          : "—"}
                      </td>
                      <td className="px-4 py-4 max-w-[200px]">
                        <p className="text-sm font-medium text-error">
                          {run.errorCode
                            ? codeLabel(t, "documents.errorCode", run.errorCode)
                            : "—"}
                        </p>
                        {run.errorMessage && (
                          <p className="text-xs text-on-surface-variant mt-0.5 truncate" title={run.errorMessage}>
                            {run.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-on-surface-variant">
                        {run.retryCount} / {run.maxRetries}
                      </td>
                      <td className="px-4 py-4 text-sm text-on-surface-variant">
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
                <h3 className="text-sm font-semibold text-on-surface">{t("superAdmin.processingOverviewTimelineTitle")}</h3>
                <button
                  type="button"
                  onClick={() => setExpandedRunId(null)}
                  className="text-xs text-outline hover:text-on-surface-variant"
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
            <div className="sticky bottom-0 z-10">
              <AdminPagination
                currentPage={page}
                totalPages={Math.ceil(total / limit)}
                onPageChange={setPage}
              />
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
