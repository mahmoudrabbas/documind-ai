"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, DashboardPage, DashboardPageHeader, DashboardPanel } from "@/components/ui";
import { getFailedProcessingJobs } from "@/services/processingProgress.service";
import * as processingProgressService from "@/services/processingProgress.service";
import type { ProcessingRunView } from "@/types/api/processingProgress.types";
import { ProcessingStatusBadge } from "@/components/documents/ProcessingStatusBadge";
import { ProcessingTimeline } from "@/components/documents/ProcessingTimeline";
import { RetryConfirmDialog, ReprocessConfirmDialog } from "@/components/documents/ProcessingConfirmDialogs";
import { ApiError } from "@/lib/api-client";

function getSafeErrorDisplay(errorCode: string | null, errorMessage: string | null): { title: string; description: string; retryable: boolean } {
  if (!errorCode) {
    return { title: "Unknown error", description: errorMessage || "An unknown error occurred.", retryable: true };
  }
  const map: Record<string, { title: string; description: string; retryable: boolean }> = {
    extraction_failed: { title: "Text extraction failed", description: "The document could not be parsed.", retryable: true },
    ocr_failed: { title: "OCR processing failed", description: "Text recognition could not complete.", retryable: true },
    ocr_timeout: { title: "OCR timed out", description: "The OCR service took too long.", retryable: true },
    quality_review_required: { title: "Quality review required", description: "Human review needed.", retryable: false },
    encrypted_document: { title: "Encrypted document", description: "Cannot process encrypted files.", retryable: false },
    unsupported_format: { title: "Unsupported format", description: "File format not supported.", retryable: false },
    file_not_found: { title: "File not found", description: "Source file could not be located.", retryable: false },
    quota_exceeded: { title: "Quota exceeded", description: "Processing quota reached.", retryable: false },
    resource_limit: { title: "Resource limit", description: "System resource limit reached.", retryable: true },
  };
  return map[errorCode] || { title: errorCode.replace(/_/g, " "), description: errorMessage || "Unexpected error.", retryable: true };
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

export default function CompanyFailedProcessingPage() {
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
      const res = await getFailedProcessingJobs({ page, limit });
      setRuns(res.data.runs);
      setTotal(res.data.pagination.totalRecords);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load failed processing jobs");
    } finally {
      setLoading(false);
    }
  }, [page]);

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
      setRetryActionError(err instanceof Error ? err.message : "Failed to retry");
    } finally {
      setIsRetrying(false);
    }
  }, [load]);

  const handleReprocess = useCallback(async (run: ProcessingRunView) => {
    setIsReprocessing(true);
    setReprocessActionError(null);
    try {
      await processingProgressService.reprocessDocument(run.documentId);
      setReprocessDialogRun(null);
      await load();
    } catch (err) {
      setReprocessActionError(err instanceof Error ? err.message : "Failed to reprocess");
    } finally {
      setIsReprocessing(false);
    }
  }, [load]);

  return (
    <DashboardPage>
      <DashboardPageHeader
        guideId="page-heading-processing-failed"
        title="Failed Processing Jobs"
        description="Documents that failed during processing. Retry or reprocess to resolve issues."
      />

      {loading && (
        <DashboardPanel>
          <div className="space-y-3" role="status">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
            <span className="sr-only">Loading</span>
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
              Retry
            </button>
          </div>
        </DashboardPanel>
      )}

      {!loading && !error && runs.length === 0 && (
        <DashboardPanel>
          <p className="text-center text-sm text-slate-500 py-8">
            No failed processing jobs. All documents are processing successfully.
          </p>
        </DashboardPanel>
      )}

      {!loading && !error && runs.length > 0 && (
        <>
          <DashboardPanel padding="none">
            <div className="max-w-full overflow-x-auto" data-guide-id="processing-failed-table">
              <table className="w-full border-collapse text-start text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Document
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Failed Stage
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Error
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Duration
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Retries
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Failed At
                    </th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {runs.map((run) => {
                    const errorDisplay = getSafeErrorDisplay(run.errorCode, run.errorMessage);
                    return (
                      <tr key={run.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                            className="text-sm font-medium text-blue-600 hover:underline text-left"
                          >
                            {run.documentId.slice(0, 12)}...
                          </button>
                          <p className="text-xs text-slate-400 mt-0.5">v{run.documentVersion}</p>
                        </td>
                        <td className="px-4 py-4">
                          <ProcessingStatusBadge status={run.status} />
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          {run.currentStage
                            ? run.currentStage.replace(/_/g, " ")
                            : "—"}
                        </td>
                        <td className="px-4 py-4 max-w-[220px]">
                          <p className="text-sm font-medium text-red-600">{errorDisplay.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate" title={errorDisplay.description}>
                            {errorDisplay.description}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-500">
                          {formatDuration(run.durationMs)}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-500">
                          {run.retryCount} / {run.maxRetries}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-500">
                          {run.failedAt
                            ? new Date(run.failedAt).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              data-guide-id="processing-failed-retry"
                              onClick={() => setRetryDialogRun(run)}
                            >
                              <span className="material-symbols-outlined me-1 text-[14px]">refresh</span>
                              Retry
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              data-guide-id="processing-failed-reprocess"
                              onClick={() => setReprocessDialogRun(run)}
                            >
                              <span className="material-symbols-outlined me-1 text-[14px]">replay</span>
                              Reprocess
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DashboardPanel>

          {expandedRunId && (
            <DashboardPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Processing Timeline</h3>
                <button
                  type="button"
                  onClick={() => setExpandedRunId(null)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Close
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
                Previous
              </Button>
              <span className="text-sm text-slate-500">
                Page {page} of {Math.ceil(total / limit)}
              </span>
              <Button
                variant="secondary"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / limit)}
              >
                Next
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
