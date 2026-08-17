import type { ProcessingRunStatus, ProcessingStageName } from "../../db/models/processingRun.model.js";
import type { ProcessingStageStatus } from "../../db/models/processingStage.model.js";

export interface ProcessingRunView {
  id: string;
  tenantId: string;
  documentId: string;
  documentVersion: number;
  status: ProcessingRunStatus;
  currentStage: ProcessingStageName | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  canceledAt: string | null;
  retryCount: number;
  maxRetries: number;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  traceId: string;
  tenantName?: string | null;
  documentName?: string | null;
  stages: ProcessingStageView[];
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingStageView {
  id: string;
  runId: string;
  documentId: string;
  documentVersion: number;
  stageName: ProcessingStageName;
  status: ProcessingStageStatus;
  attemptNumber: number;
  maxAttempts: number;
  jobId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  artifactVersion: number;
  traceId: string;
  durationMs: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingStatusResponse {
  documentId: string;
  documentVersion: number;
  overallStatus: ProcessingRunStatus | "not_started";
  currentStage: ProcessingStageName | null;
  progress: number;
  run: ProcessingRunView | null;
  error: {
    title: string;
    description: string;
    retryable: boolean;
    errorCode: string | null;
  } | null;
}

export interface ProcessingHistoryResponse {
  documentId: string;
  documentVersion: number;
  runs: ProcessingRunView[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalRecords: number;
  };
}

export interface RetryStageInput {
  stageName?: ProcessingStageName;
}

export interface CancelProcessingInput {
  reason?: string;
}

export interface ProcessingProgressQuery {
  page?: number;
  pageSize?: number;
  status?: ProcessingRunStatus;
}
