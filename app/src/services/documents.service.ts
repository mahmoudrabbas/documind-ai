import { api, uploadFile } from "@/lib/api-client";
import type {
  DocumentListResponse,
  SingleDocumentResponse,
  DeleteDocumentResponse,
} from "@/types/api/documents.types";

export async function listDocuments(
  page = 1,
  pageSize = 20,
  status?: string,
): Promise<DocumentListResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (status) {
    params.set("status", status);
  }

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
  data: { title?: string; description?: string; tags?: string[] },
): Promise<SingleDocumentResponse> {
  return api.patch<SingleDocumentResponse>(`/documents/${id}`, data);
}

export async function deleteDocument(
  id: string,
): Promise<DeleteDocumentResponse> {
  return api.delete<DeleteDocumentResponse>(`/documents/${id}`);
}
