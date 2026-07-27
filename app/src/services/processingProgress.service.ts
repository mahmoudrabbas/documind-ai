import { api } from "@/lib/api-client";
import type {
  ProcessingStatusResponse,
  ProcessingHistoryResponse,
  ProcessingFailedResponse,
  ProcessingInitiateResponse,
  ProcessingActionResponse,
} from "@/types/api/processingProgress.types";

export async function getProcessingStatus(
  documentId: string,
  version?: number,
): Promise<ProcessingStatusResponse> {
  const query = version ? `?version=${version}` : "";
  return api.get<ProcessingStatusResponse>(
    `/documents/${documentId}/processing/status${query}`,
  );
}

export async function getProcessingHistory(
  documentId: string,
  options?: { page?: number; limit?: number },
): Promise<ProcessingHistoryResponse> {
  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString() ? `?${params.toString()}` : "";
  return api.get<ProcessingHistoryResponse>(
    `/documents/${documentId}/processing/history${query}`,
  );
}

export async function initiateProcessing(
  documentId: string,
  options?: { version?: number },
): Promise<ProcessingInitiateResponse> {
  return api.post<ProcessingInitiateResponse>(
    `/documents/${documentId}/processing/initiate`,
    { version: options?.version },
  );
}

export async function retryProcessing(
  documentId: string,
  options?: {
    version?: number;
    stageName?: string;
    resetFailedStages?: boolean;
  },
): Promise<ProcessingActionResponse> {
  return api.post<ProcessingActionResponse>(
    `/documents/${documentId}/processing/retry`,
    {
      version: options?.version,
      stageName: options?.stageName,
      resetFailedStages: options?.resetFailedStages,
    },
  );
}

export async function reprocessDocument(
  documentId: string,
  options?: {
    version?: number;
    fromStage?: string;
  },
): Promise<ProcessingActionResponse> {
  return api.post<ProcessingActionResponse>(
    `/documents/${documentId}/processing/reprocess`,
    {
      version: options?.version,
      fromStage: options?.fromStage,
    },
  );
}

export async function cancelProcessing(
  documentId: string,
  options?: { version?: number },
): Promise<ProcessingActionResponse> {
  return api.post<ProcessingActionResponse>(
    `/documents/${documentId}/processing/cancel`,
    { version: options?.version },
  );
}

export async function getFailedProcessingJobs(
  options?: {
    page?: number;
    limit?: number;
    tenantId?: string;
  },
): Promise<ProcessingFailedResponse> {
  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.tenantId) params.set("tenantId", options.tenantId);
  const query = params.toString() ? `?${params.toString()}` : "";
  return api.get<ProcessingFailedResponse>(
    `/documents/processing/failed${query}`,
  );
}

export async function getAllFailedProcessingJobs(
  options?: {
    page?: number;
    limit?: number;
  },
): Promise<ProcessingFailedResponse> {
  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.limit) params.set("limit", String(options.limit));
  const query = params.toString() ? `?${params.toString()}` : "";
  return api.get<ProcessingFailedResponse>(
    `/documents/processing/failed/all${query}`,
  );
}
