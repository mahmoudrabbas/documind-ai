import { api, uploadFile } from "@/lib/api-client";
import type {
  DocumentListResponse,
  SingleDocumentResponse,
  DeleteDocumentResponse,
  DocumentVersionsResponse,
  DocumentExtractionStatusResponse,
} from "@/types/api/documents.types";

export async function listDocuments(
  page = 1,
  pageSize = 20,
  filters?: {
    status?: string;
    search?: string;
    category?: string;
    classification?: string;
    isArchived?: boolean;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  },
): Promise<DocumentListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.classification) params.set("classification", filters.classification);
  if (filters?.isArchived !== undefined) params.set("isArchived", String(filters.isArchived));
  if (filters?.sortBy) params.set("sortBy", filters.sortBy);
  if (filters?.sortOrder) params.set("sortOrder", filters.sortOrder);

  return api.get<DocumentListResponse>(`/documents?${params.toString()}`);
}

export async function uploadDocument(
  file: File,
  metadata: { title: string; description?: string; tags?: string },
  onProgress?: (progress: number) => void,
): Promise<SingleDocumentResponse> {
  return uploadFile<SingleDocumentResponse>(
    "/documents",
    file,
    {
      title: metadata.title,
      description: metadata.description ?? "",
      tags: metadata.tags ?? "",
    },
    onProgress,
  );
}

export async function getDocument(
  id: string,
): Promise<SingleDocumentResponse> {
  return api.get<SingleDocumentResponse>(`/documents/${id}`);
}

export async function updateDocumentMetadata(
  id: string,
  data: {
    title?: string;
    description?: string;
    tags?: string[];
    category?: string;
    department?: string;
    classification?: string;
    versionLabel?: string;
  },
): Promise<SingleDocumentResponse> {
  return api.patch<SingleDocumentResponse>(`/documents/${id}`, data);
}

export async function deleteDocument(
  id: string,
): Promise<DeleteDocumentResponse> {
  return api.delete<DeleteDocumentResponse>(`/documents/${id}`);
}

export async function downloadDocument(id: string): Promise<void> {
  const token = (await import("@/lib/auth-tokens")).getAccessToken();
  const baseUrl = (await import("@/constants/api")).API_BASE_URL;
  const response = await fetch(`${baseUrl}/documents/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Download failed");
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const fileNameMatch = disposition.match(/filename="?(.+?)"?$/);
  const fileName = fileNameMatch?.[1] ?? "download";

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function replaceDocument(
  id: string,
  file: File,
  changeDescription?: string,
  onProgress?: (progress: number) => void,
): Promise<SingleDocumentResponse> {
  return uploadFile<SingleDocumentResponse>(
    `/documents/${id}/replace`,
    file,
    { changeDescription: changeDescription ?? "" },
    onProgress,
  );
}

export async function archiveDocument(
  id: string,
): Promise<SingleDocumentResponse> {
  return api.post<SingleDocumentResponse>(`/documents/${id}/archive`);
}

export async function restoreDocument(
  id: string,
): Promise<SingleDocumentResponse> {
  return api.post<SingleDocumentResponse>(`/documents/${id}/restore`);
}

export async function permanentDeleteDocument(
  id: string,
): Promise<DeleteDocumentResponse> {
  return api.delete<DeleteDocumentResponse>(`/documents/${id}/permanent`);
}

export interface RetriggerExtractionResponse {
  message: string;
  jobId: string;
  idempotencyKey: string;
}

export async function listDocumentVersions(
  id: string,
): Promise<DocumentVersionsResponse> {
  return api.get<DocumentVersionsResponse>(`/documents/${id}/versions`);
}

export async function getDocumentExtractionStatus(
  id: string,
  version?: number,
): Promise<DocumentExtractionStatusResponse> {
  const query = version ? `?version=${version}` : "";
  return api.get<DocumentExtractionStatusResponse>(`/documents/${id}/extraction${query}`);
}

export async function retriggerDocumentExtraction(
  id: string,
  version?: number,
): Promise<RetriggerExtractionResponse> {
  const body = version ? { version } : {};
  return api.post<RetriggerExtractionResponse>(`/documents/${id}/extraction/retrigger`, body);
}

