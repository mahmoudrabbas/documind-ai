"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import * as processingProgressService from "@/services/processingProgress.service";
import type {
  ProcessingRunView,
} from "@/types/api/processingProgress.types";
import { ApiError } from "@/lib/api-client";

export interface UseProcessingProgressResult {
  /** Active run for the document (or null if none). */
  currentRun: ProcessingRunView | null;
  /** Historical runs for the document. */
  history: ProcessingRunView[];
  /** Failed processing runs (company admin dashboard). */
  failedRuns: ProcessingRunView[];
  totalFailed: number;
  isLoadingStatus: boolean;
  isLoadingHistory: boolean;
  isLoadingFailed: boolean;
  isInitiating: boolean;
  isRetrying: boolean;
  isReprocessing: boolean;
  isCanceling: boolean;
  error: string | null;

  /** Fetch the active run status for a document. */
  fetchStatus: (documentId: string, version?: number) => Promise<void>;
  /** Fetch historical runs for a document. */
  fetchHistory: (documentId: string, options?: { page?: number; limit?: number }) => Promise<void>;
  /** Initiate processing for a document. */
  initiateProcessing: (documentId: string, version?: number) => Promise<void>;
  /** Retry the current run from its current state (retry failed stages). */
  retryProcessing: (documentId: string, options?: {
    version?: number;
    stageName?: string;
    resetFailedStages?: boolean;
  }) => Promise<void>;
  /** Reprocess the document from scratch or from a specific stage. */
  reprocessDocument: (documentId: string, options?: {
    version?: number;
    fromStage?: string;
  }) => Promise<void>;
  /** Cancel the current active run. */
  cancelProcessing: (documentId: string, version?: number) => Promise<void>;
  /** Fetch failed processing jobs (company admin). */
  fetchFailed: (options?: { page?: number; limit?: number; tenantId?: string }) => Promise<void>;
}

const ACTIVE_STATUSES = new Set(["queued", "running", "paused"]);
const POLL_INTERVAL_MS = 3000;

export function useProcessingProgress(): UseProcessingProgressResult {
  const [currentRun, setCurrentRun] = useState<ProcessingRunView | null>(null);
  const [history, setHistory] = useState<ProcessingRunView[]>([]);
  const [failedRuns, setFailedRuns] = useState<ProcessingRunView[]>([]);
  const [totalFailed, setTotalFailed] = useState(0);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingFailed, setIsLoadingFailed] = useState(false);
  const [isInitiating, setIsInitiating] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeDocRef = useRef<{ documentId: string; version?: number } | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    activeDocRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const fetchStatus = useCallback(async (documentId: string, version?: number) => {
    setIsLoadingStatus(true);
    setError(null);
    try {
      const res = await processingProgressService.getProcessingStatus(documentId, version);
      setCurrentRun(res.data.run);
      activeDocRef.current = { documentId, version };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setCurrentRun(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load processing status");
      }
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  const fetchHistory = useCallback(async (documentId: string, options?: { page?: number; limit?: number }) => {
    setIsLoadingHistory(true);
    setError(null);
    try {
      const res = await processingProgressService.getProcessingHistory(documentId, options);
      setHistory(res.data.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load processing history");
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const initiateProcessing = useCallback(async (documentId: string, version?: number) => {
    setIsInitiating(true);
    setError(null);
    try {
      const res = await processingProgressService.initiateProcessing(documentId, { version });
      if (res.data.runId) {
        await fetchStatus(documentId, version);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate processing");
    } finally {
      setIsInitiating(false);
    }
  }, [fetchStatus]);

  const retryProcessing = useCallback(async (documentId: string, options?: {
    version?: number;
    stageName?: string;
    resetFailedStages?: boolean;
  }) => {
    setIsRetrying(true);
    setError(null);
    try {
      await processingProgressService.retryProcessing(documentId, options);
      await fetchStatus(documentId, options?.version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry processing");
    } finally {
      setIsRetrying(false);
    }
  }, [fetchStatus]);

  const reprocessDocument = useCallback(async (documentId: string, options?: {
    version?: number;
    fromStage?: string;
  }) => {
    setIsReprocessing(true);
    setError(null);
    try {
      await processingProgressService.reprocessDocument(documentId, options);
      await fetchStatus(documentId, options?.version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reprocess document");
    } finally {
      setIsReprocessing(false);
    }
  }, [fetchStatus]);

  const cancelProcessing = useCallback(async (documentId: string, version?: number) => {
    setIsCanceling(true);
    setError(null);
    try {
      await processingProgressService.cancelProcessing(documentId, { version });
      await fetchStatus(documentId, version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel processing");
    } finally {
      setIsCanceling(false);
    }
  }, [fetchStatus]);

  const fetchFailed = useCallback(async (options?: { page?: number; limit?: number; tenantId?: string }) => {
    setIsLoadingFailed(true);
    setError(null);
    try {
      const res = await processingProgressService.getFailedProcessingJobs(options);
      setFailedRuns(res.data.runs);
      setTotalFailed(res.data.pagination.totalRecords);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load failed processing jobs");
    } finally {
      setIsLoadingFailed(false);
    }
  }, []);

  // Auto-poll when a run is in an active state
  useEffect(() => {
    if (currentRun && ACTIVE_STATUSES.has(currentRun.status) && activeDocRef.current) {
      const { documentId, version } = activeDocRef.current;
      pollingRef.current = setInterval(() => {
        void fetchStatus(documentId, version);
      }, POLL_INTERVAL_MS);
    } else {
      stopPolling();
    }
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRun?.status, fetchStatus, stopPolling]);

  return {
    currentRun,
    history,
    failedRuns,
    totalFailed,
    isLoadingStatus,
    isLoadingHistory,
    isLoadingFailed,
    isInitiating,
    isRetrying,
    isReprocessing,
    isCanceling,
    error,
    fetchStatus,
    fetchHistory,
    initiateProcessing,
    retryProcessing,
    reprocessDocument,
    cancelProcessing,
    fetchFailed,
  };
}
