import { apiClient } from "@/lib/api-client";
import type {
  EntitlementUsageResponse,
  QuotaOverrideInput,
  QuotaOverride,
} from "@/types/api/entitlement.types";

type Success<T> = { success: true; data: T };

export function getCompanyUsage(signal?: AbortSignal) {
  return apiClient<Success<EntitlementUsageResponse>>("/entitlement/usage", {
    signal,
  });
}

export function getCompanyLimits(signal?: AbortSignal) {
  return apiClient<
    Success<{
      limits: Array<{ dimension: string; limit: number }>;
    }>
  >("/entitlement/limits", { signal });
}

export function listOverrides(
  params: { page?: number; pageSize?: number },
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();
  return apiClient<
    Success<{
      overrides: QuotaOverride[];
      pagination: { page: number; pageSize: number; totalPages: number; totalRecords: number };
    }>
  >(`/super-admin/entitlement/overrides${qs ? `?${qs}` : ""}`, { signal });
}

export function setOverride(tenantId: string, input: QuotaOverrideInput) {
  return apiClient<Success<QuotaOverride>>(
    `/super-admin/entitlement/overrides/${encodeURIComponent(tenantId)}`,
    { method: "PUT", body: input as unknown as Record<string, unknown> },
  );
}

export function removeOverride(tenantId: string, dimension: string) {
  return apiClient<Success<{ removed: boolean }>>(
    `/super-admin/entitlement/overrides/${encodeURIComponent(tenantId)}/${encodeURIComponent(dimension)}`,
    { method: "DELETE" },
  );
}
