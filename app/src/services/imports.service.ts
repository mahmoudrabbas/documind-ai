import { API_BASE_URL, api, uploadFile } from "@/lib/api-client";
import { getAccessToken } from "@/lib/auth-tokens";
import type {
  BatchWithRowsResponse,
  CancelResponse,
  ConfirmImportResponse,
  ListBatchesResponse,
  PreviewResponse,
  RetryResponse,
  SingleBatchResponse,
  UpdateMappingResponse,
} from "@/types/api/imports.types";

function buildApiUrl(path: string): string {
  return `${API_BASE_URL}/${path.replace(/^\//, "")}`;
}

export async function downloadTemplate(): Promise<Blob> {
  const accessToken = getAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  const response = await fetch(buildApiUrl("/imports/template"), {
    method: "GET",
    credentials: "include",
    headers,
  });
  if (!response.ok) throw new Error("Failed to download template");
  return response.blob();
}

export async function uploadImportFile(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<PreviewResponse> {
  return uploadFile<PreviewResponse>("/imports/upload", file, {}, onProgress);
}

export async function updateMapping(
  batchId: string,
  mapping: Record<string, string>,
): Promise<UpdateMappingResponse> {
  return api.put<UpdateMappingResponse>(`/imports/${batchId}/mapping`, mapping);
}

export async function confirmImport(
  batchId: string,
  idempotencyKey: string,
): Promise<ConfirmImportResponse> {
  return api.post<ConfirmImportResponse>(`/imports/${batchId}/confirm`, {
    idempotencyKey,
  });
}

export async function getBatchStatus(batchId: string): Promise<SingleBatchResponse> {
  return api.get<SingleBatchResponse>(`/imports/${batchId}`);
}

export async function getBatchWithRows(batchId: string): Promise<BatchWithRowsResponse> {
  return api.get<BatchWithRowsResponse>(`/imports/${batchId}?includeRows=true`);
}

export async function listBatches(
  page = 1,
  pageSize = 10,
  status?: string,
): Promise<ListBatchesResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (status) params.set("status", status);
  return api.get<ListBatchesResponse>(`/imports?${params.toString()}`);
}

export async function cancelBatch(batchId: string): Promise<CancelResponse> {
  return api.post<CancelResponse>(`/imports/${batchId}/cancel`);
}

export async function retryFailedRows(
  batchId: string,
  rowNumbers?: number[],
): Promise<RetryResponse> {
  return api.post<RetryResponse>(`/imports/${batchId}/retry`, rowNumbers ? { rowNumbers } : {});
}

export function buildExportUrl(batchId: string, format: "csv" | "xlsx", status?: string): string {
  const params = new URLSearchParams({ format });
  if (status) params.set("status", status);
  return buildApiUrl(`/imports/${batchId}/export?${params.toString()}`);
}
