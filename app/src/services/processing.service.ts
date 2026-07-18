import { api } from "@/lib/api-client";
import type {
  OcrTriggerResponse,
  OcrPageResultsResponse,
  DocumentQualityResponse,
  OcrUsageSummaryResponse,
  ReviewQualityResponse,
} from "@/types/api/processing.types";

export async function triggerOcrProcessing(
  documentId: string,
  options?: {
    version?: number;
    language?: "ar" | "en" | "ar+en";
    pageNumbers?: number[];
  },
): Promise<OcrTriggerResponse> {
  return api.post<OcrTriggerResponse>(`/documents/${documentId}/ocr/trigger`, {
    documentId,
    ...options,
  });
}

export async function getOcrPageResults(
  documentId: string,
  version?: number,
): Promise<OcrPageResultsResponse> {
  const query = version ? `?version=${version}` : "";
  return api.get<OcrPageResultsResponse>(`/documents/${documentId}/ocr/pages${query}`);
}

export async function getDocumentQuality(
  documentId: string,
  version?: number,
): Promise<DocumentQualityResponse> {
  const query = version ? `?version=${version}` : "";
  return api.get<DocumentQualityResponse>(`/documents/${documentId}/quality${query}`);
}

export async function assessDocumentQuality(
  documentId: string,
  version?: number,
): Promise<DocumentQualityResponse> {
  const query = version ? `?version=${version}` : "";
  return api.post<DocumentQualityResponse>(`/documents/${documentId}/quality/assess${query}`);
}

export async function reviewDocumentQuality(
  documentId: string,
  decision: "approved" | "rejected" | "retry",
  options?: {
    version?: number;
    notes?: string;
    pageNumbers?: number[];
  },
): Promise<ReviewQualityResponse> {
  const query = options?.version ? `?version=${options.version}` : "";
  return api.post<ReviewQualityResponse>(`/documents/${documentId}/quality/review${query}`, {
    decision,
    notes: options?.notes,
    pageNumbers: options?.pageNumbers,
  });
}

export async function retryOcrPages(
  documentId: string,
  options?: {
    version?: number;
    pageNumbers?: number[];
  },
): Promise<OcrTriggerResponse> {
  return api.post<OcrTriggerResponse>(`/documents/${documentId}/ocr/retry`, {
    pageNumbers: options?.pageNumbers,
    version: options?.version,
  });
}

export async function getOcrUsageSummary(): Promise<OcrUsageSummaryResponse> {
  return api.get<OcrUsageSummaryResponse>("/documents/ocr/usage");
}
