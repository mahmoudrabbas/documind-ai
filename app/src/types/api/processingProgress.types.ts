export type ProcessingRunStatus = "queued" | "running" | "paused" | "completed" | "failed" | "canceled";
export type ProcessingStageStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "canceled";

export const PROCESSING_STAGES = [
  "security_scanning",
  "extraction",
  "ocr",
  "quality_review",
  "metadata_review",
  "chunking",
  "embedding",
  "indexing",
  "finalization",
] as const;

export type ProcessingStageName = (typeof PROCESSING_STAGES)[number];

export interface ProcessingStageView {
  stageName: string;
  status: ProcessingStageStatus;
  progress: number | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  durationMs: number | null;
  jobId: string | null;
  attempt: number;
  maxAttempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
}

export interface ProcessingRunView {
  id: string;
  documentId: string;
  tenantId: string;
  documentVersion: number;
  status: ProcessingRunStatus;
  stages: ProcessingStageView[];
  progress: number;
  currentStage: string | null;
  retryCount: number;
  maxRetries: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  durationMs: number | null;
  canceledAt: string | null;
  traceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingStatusResponse {
  success: boolean;
  data: {
    documentId: string;
    documentVersion: number;
    overallStatus: ProcessingRunStatus | "not_started";
    currentStage: string | null;
    progress: number;
    run: ProcessingRunView | null;
    error: {
      title: string;
      description: string;
      retryable: boolean;
      errorCode: string | null;
    } | null;
  };
}

export interface ProcessingHistoryResponse {
  success: boolean;
  data: {
    documentId: string;
    documentVersion: number;
    runs: ProcessingRunView[];
    pagination: {
      page: number;
      pageSize: number;
      totalPages: number;
      totalRecords: number;
    };
  };
}

export interface ProcessingFailedResponse {
  success: boolean;
  data: {
    runs: ProcessingRunView[];
    pagination: {
      page: number;
      pageSize: number;
      totalPages: number;
      totalRecords: number;
    };
  };
}

export interface ProcessingInitiateResponse {
  success: boolean;
  data: {
    runId: string;
    status: ProcessingRunStatus;
    message: string;
  };
}

export interface ProcessingActionResponse {
  success: boolean;
  data: {
    message: string;
    runId?: string;
  };
}
