import { apiClient } from "@/lib/api-client";
import type {
  GlobalSettings,
  GlobalSettingsPatch,
  Pagination,
  PlatformAuditLog,
  PlatformJob,
  PlatformPackage,
  PackageCreateInput,
  PackageImpactPreview,
  PackageLifecycleAction,
  PackageLifecycleInput,
  PackageVersionInput,
  PlatformSubscription,
  PlatformSubscriptionDetail,
  SubscriptionImpactPreview,
  SubscriptionOperationAction,
  SubscriptionProvisionInput,
  SubscriptionUpdateInput,
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
export const createPackage = (body: PackageCreateInput) =>
  apiClient<Success<PlatformPackage>>("/platform/packages", {
    method: "POST",
    body: { ...body },
  });
export const updatePackage = (id: string, body: PackageVersionInput) =>
  apiClient<Success<PlatformPackage>>(
    `/platform/packages/${encodeURIComponent(id)}`,
    { method: "PATCH", body },
  );
export const createPackageVersion = (id: string, body: PackageVersionInput) =>
  apiClient<Success<PlatformPackage>>(
    `/platform/packages/${encodeURIComponent(id)}/versions`,
    { method: "POST", body: { ...body } },
  );
export const previewPackageImpact = (
  id: string,
  action: PackageLifecycleAction,
  signal?: AbortSignal,
) =>
  apiClient<Success<PackageImpactPreview>>(
    `/platform/packages/${encodeURIComponent(id)}/impact?action=${action}`,
    { signal },
  );
export const archivePackage = (id: string, body: PackageLifecycleInput) =>
  apiClient<Success<PlatformPackage>>(
    `/platform/packages/${encodeURIComponent(id)}/archive`,
    { method: "POST", body: { ...body } },
  );
export const activatePackage = (id: string, body: PackageLifecycleInput) =>
  apiClient<Success<PlatformPackage>>(
    `/platform/packages/${encodeURIComponent(id)}/activate`,
    { method: "POST", body: { ...body } },
  );
export const listSubscriptions = (
  params: { page: number; pageSize: number; search?: string; status?: string },
  signal?: AbortSignal,
) => {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.search) search.set("search", params.search);
  if (params.status) search.set("status", params.status);
  const qs = search.toString();
  return apiClient<Success<{ subscriptions: PlatformSubscription[]; pagination: Pagination }>>(
    `/platform/subscriptions${qs ? `?${qs}` : ""}`,
    { signal },
  );
};
export const updateSubscription = (
  tenantId: string,
  body: SubscriptionUpdateInput,
  idempotencyKey: string,
) =>
  apiClient<Success<PlatformSubscription>>(
    `/platform/subscriptions/${encodeURIComponent(tenantId)}`,
    { method: "PATCH", body: { ...body }, headers: { "Idempotency-Key": idempotencyKey } },
  );
export const getSubscriptionDetail = (tenantId: string, signal?: AbortSignal) =>
  apiClient<Success<PlatformSubscriptionDetail>>(
    `/platform/subscriptions/${encodeURIComponent(tenantId)}`,
    { signal },
  );
export const previewSubscriptionImpact = (
  tenantId: string,
  input: { action: SubscriptionOperationAction; packageId?: string; targetStatus?: string; expectedVersion: number },
  signal?: AbortSignal,
) => {
  const query = new URLSearchParams({ action: input.action, expectedVersion: String(input.expectedVersion) });
  if (input.packageId) query.set("packageId", input.packageId);
  if (input.targetStatus) query.set("targetStatus", input.targetStatus.toLowerCase());
  return apiClient<Success<SubscriptionImpactPreview>>(
    `/platform/subscriptions/${encodeURIComponent(tenantId)}/impact?${query}`,
    { signal },
  );
};
export const provisionSubscription = (
  tenantId: string,
  body: SubscriptionProvisionInput,
  idempotencyKey: string,
) => apiClient<Success<PlatformSubscription>>(
  `/platform/subscriptions/${encodeURIComponent(tenantId)}`,
  { method: "POST", body: { ...body }, headers: { "Idempotency-Key": idempotencyKey } },
);
export const listPlatformUsers = (
  params: { page: number; pageSize: number },
  signal?: AbortSignal,
) => {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  const qs = search.toString();
  return apiClient<Success<{ users: PlatformUser[]; pagination: Pagination }>>(
    `/platform/users${qs ? `?${qs}` : ""}`,
    { signal },
  );
};
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
export const listPlatformJobs = (
  params: { page: number; pageSize: number },
  signal?: AbortSignal,
) => {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  const qs = search.toString();
  return apiClient<Success<{ jobs: PlatformJob[]; pagination: Pagination }>>(
    `/platform/jobs${qs ? `?${qs}` : ""}`,
    { signal },
  );
};
export const getPlatformHealth = (signal?: AbortSignal) =>
  apiClient<
    Success<{
      status: string;
      services: Array<{ name: string; status: string }>;
      checkedAt: string;
    }>
  >("/platform/system-health", { signal });
export const listPlatformAudit = (
  params: { page: number; pageSize: number },
  signal?: AbortSignal,
) => {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  const qs = search.toString();
  return apiClient<Success<{ logs: PlatformAuditLog[]; pagination: Pagination }>>(
    `/platform/audit${qs ? `?${qs}` : ""}`,
    { signal },
  );
};
export const getGlobalSettings = (signal?: AbortSignal) =>
  apiClient<Success<GlobalSettings>>("/platform/settings", { signal });

export const updateGlobalSettings = (body: GlobalSettingsPatch) =>
  apiClient<Success<GlobalSettings>>("/platform/settings", {
    method: "PATCH",
    body,
  });

export const getAiConfiguration = (signal?: AbortSignal) =>
  apiClient<Success<Record<string, string | number | boolean | null>>>(
    "/platform/ai-configuration",
    { signal },
  );

export const updateAiConfiguration = (
  body: Record<string, unknown>,
) =>
  apiClient<Success<Record<string, string | number | boolean | null>>>(
    "/platform/ai-configuration",
    { method: "PATCH", body },
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
    `/retrieval/debug?q=${encodeURIComponent(params.queryText)}${params.topK ? `&topK=${params.topK}` : ""}${params.method ? `&method=${params.method}` : ""}`,
    { signal },
  );
