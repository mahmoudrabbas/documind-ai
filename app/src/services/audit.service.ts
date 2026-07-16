import { apiClient } from "@/lib/api-client";
import type { AuditAction, AuditOutcome } from "../types/api/audit.types";

export interface AuditQueryFilter {
  page?: number;
  pageSize?: number;
  action?: string;
  actorId?: string;
  actorEmail?: string;
  resourceType?: string;
  resourceId?: string;
  dateFrom?: string;
  dateTo?: string;
  outcome?: string;
  tenantId?: string;
}

export interface AuditLog {
  _id: string;
  tenantId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  outcome: AuditOutcome;
  changes: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  traceId?: string;
  requestId?: string;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  pagination: {
    page: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
}

export const getAuditLogs = async (filter: AuditQueryFilter = {}, signal?: AbortSignal) => {
  const searchParams = new URLSearchParams();
  Object.entries(filter).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  });

  return apiClient<AuditLogsResponse>(`/audit/logs?${searchParams.toString()}`, { signal });
};

export const exportAuditLogs = async (filter: AuditQueryFilter = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(filter).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  });

  return apiClient<{ logs: AuditLog[] }>(`/audit/export?${searchParams.toString()}`);
};
