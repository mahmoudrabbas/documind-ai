import { apiClient } from "@/lib/api-client";
import type {
  KnowledgeGap,
  GapOccurrence,
  GapReevaluation,
  GapMetrics,
  ListGapsQuery,
} from "../types/api/knowledge-gaps.types";

export const getKnowledgeGaps = async (query: ListGapsQuery = {}, signal?: AbortSignal) => {
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  });

  return apiClient<{ gaps: KnowledgeGap[]; total: number }>(`/knowledge-gaps?${searchParams.toString()}`, { signal });
};

export const getKnowledgeGapById = async (id: string, signal?: AbortSignal) => {
  return apiClient<{ gap: KnowledgeGap }>(`/knowledge-gaps/${id}`, { signal });
};

export const assignKnowledgeGap = async (id: string, payload: { assigneeId: string; dueDate?: string | null }) => {
  return apiClient<{ gap: KnowledgeGap }>(`/knowledge-gaps/${id}/assign`, {
    method: "PATCH",
    body: payload as unknown as Record<string, unknown>,
  });
};

export const resolveKnowledgeGap = async (
  id: string,
  payload: { resolutionNotes: string; linkedDocumentIds?: string[] },
) => {
  return apiClient<{ gap: KnowledgeGap }>(`/knowledge-gaps/${id}/resolve`, {
    method: "PATCH",
    body: payload as unknown as Record<string, unknown>,
  });
};

export const dismissKnowledgeGap = async (id: string, payload: { reason: string }) => {
  return apiClient<{ gap: KnowledgeGap }>(`/knowledge-gaps/${id}/dismiss`, {
    method: "PATCH",
    body: payload as unknown as Record<string, unknown>,
  });
};

export const reopenKnowledgeGap = async (id: string) => {
  return apiClient<{ gap: KnowledgeGap }>(`/knowledge-gaps/${id}/reopen`, {
    method: "PATCH",
  });
};

export const mergeKnowledgeGaps = async (payload: { sourceGapIds: string[]; targetGapId: string }) => {
  return apiClient<{ gap: KnowledgeGap }>(`/knowledge-gaps/merge`, {
    method: "POST",
    body: payload as unknown as Record<string, unknown>,
  });
};

export const splitKnowledgeGap = async (id: string, payload: { newTopics: string[] }) => {
  return apiClient<{ gaps: KnowledgeGap[] }>(`/knowledge-gaps/${id}/split`, {
    method: "POST",
    body: payload as unknown as Record<string, unknown>,
  });
};

export const linkGapDocuments = async (id: string, payload: { documentIds: string[] }) => {
  return apiClient<{ gap: KnowledgeGap }>(`/knowledge-gaps/${id}/documents`, {
    method: "PATCH",
    body: payload as unknown as Record<string, unknown>,
  });
};

export const triggerGapReevaluation = async (id: string, documentId: string) => {
  return apiClient<{ reevaluation: GapReevaluation }>(`/knowledge-gaps/${id}/reevaluate`, {
    method: "POST",
    body: { documentId },
  });
};

export const getGapOccurrences = async (id: string, page = 1, pageSize = 20) => {
  return apiClient<{ occurrences: GapOccurrence[]; total: number }>(
    `/knowledge-gaps/${id}/occurrences?page=${page}&pageSize=${pageSize}`,
  );
};

export const getGapReevaluations = async (id: string) => {
  return apiClient<{ reevaluations: GapReevaluation[] }>(`/knowledge-gaps/${id}/reevaluations`);
};

export const getKnowledgeGapMetrics = async () => {
  return apiClient<{ metrics: GapMetrics }>(`/knowledge-gaps/metrics`);
};
