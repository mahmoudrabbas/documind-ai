import { apiClient } from "@/lib/api-client";
import type {
  Pagination,
  PlatformAuditLog,
  PlatformJob,
  PlatformPackage,
  PlatformSubscription,
  PlatformUser,
  RetrievalDebugResult,
} from "@/types/api/super-admin.types";

type Success<T> = { success: true; data: T };
export const getPlatformOverview = (signal?: AbortSignal) =>
  apiClient<
    Success<{
      metrics: Record<string, number>;
      recentAudit: PlatformAuditLog[];
    }>
  >("/platform/overview", { signal });
export const listPackages = (signal?: AbortSignal) =>
  apiClient<Success<PlatformPackage[]>>("/platform/packages", { signal });
export const getPackage = (id: string, signal?: AbortSignal) =>
  apiClient<Success<PlatformPackage>>(
    `/platform/packages/${encodeURIComponent(id)}`,
    { signal },
  );
export const createPackage = (body: Record<string, unknown>) =>
  apiClient<Success<PlatformPackage>>("/platform/packages", {
    method: "POST",
    body,
  });
export const updatePackage = (id: string, body: Record<string, unknown>) =>
  apiClient<Success<PlatformPackage>>(
    `/platform/packages/${encodeURIComponent(id)}`,
    { method: "PATCH", body },
  );
export const listSubscriptions = (signal?: AbortSignal) =>
  apiClient<Success<PlatformSubscription[]>>("/platform/subscriptions", {
    signal,
  });
export const updateSubscription = (
  tenantId: string,
  body: Record<string, unknown>,
) =>
  apiClient<Success<PlatformSubscription>>(
    `/platform/subscriptions/${encodeURIComponent(tenantId)}`,
    { method: "PATCH", body },
  );
export const listPlatformUsers = (signal?: AbortSignal) =>
  apiClient<Success<{ users: PlatformUser[]; pagination: Pagination }>>(
    "/platform/users?page=1&pageSize=100",
    { signal },
  );
export const getPlatformUsage = (signal?: AbortSignal) =>
  apiClient<
    Success<{
      byTenant: Array<{
        tenantId: string;
        tenantName: string;
        questions: number;
        estimatedCost: number;
      }>;
      byDay: Array<{ _id: string; questions: number }>;
      storage: { storageBytes: number; documents: number };
    }>
  >("/platform/usage", { signal });
export const listPlatformJobs = (signal?: AbortSignal) =>
  apiClient<Success<{ jobs: PlatformJob[]; pagination: Pagination }>>(
    "/platform/jobs?page=1&pageSize=100",
    { signal },
  );
export const getPlatformHealth = (signal?: AbortSignal) =>
  apiClient<
    Success<{
      status: string;
      services: Array<{ name: string; status: string }>;
      checkedAt: string;
    }>
  >("/platform/system-health", { signal });
export const listPlatformAudit = (signal?: AbortSignal) =>
  apiClient<Success<{ logs: PlatformAuditLog[]; pagination: Pagination }>>(
    "/platform/audit?page=1&pageSize=100",
    { signal },
  );
export const getPlatformSetting = (
  key: "ai-configuration" | "settings",
  signal?: AbortSignal,
) =>
  apiClient<Success<Record<string, string | number | boolean | null>>>(
    `/platform/${key}`,
    { signal },
  );
export const updatePlatformSetting = (
  key: "ai-configuration" | "settings",
  body: Record<string, unknown>,
) =>
  apiClient<Success<Record<string, string | number | boolean | null>>>(
    `/platform/${key}`,
    { method: "PATCH", body },
  );
export const searchRetrievalDebug = (
  params: { queryText: string; topK?: number; method?: string },
  signal?: AbortSignal,
) =>
  apiClient<Success<RetrievalDebugResult>>(
    `/retrieval/debug?queryText=${encodeURIComponent(params.queryText)}${params.topK ? `&topK=${params.topK}` : ""}${params.method ? `&method=${params.method}` : ""}`,
    { signal },
  );
