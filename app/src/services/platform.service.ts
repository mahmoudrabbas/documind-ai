import { apiClient } from "@/lib/api-client";
import {
  PAGE_SIZES,
  TENANT_PLANS,
  TENANT_STATUSES,
  type PlatformTenant,
  type TenantDetailView,
  type TenantLifecyclePreview,
  type TenantLifecycleResult,
  type TenantListQuery,
  type TenantListResponse,
  type TenantPlan,
} from "@/types/api/platform.types";

const DEFAULT_QUERY: TenantListQuery = {
  page: 1,
  pageSize: 20,
  search: "",
  status: "",
  plan: "",
  packageId: "",
};

export function parseTenantListQuery(params: URLSearchParams): TenantListQuery {
  const pageValue = Number(params.get("page"));
  const sizeValue = Number(params.get("pageSize"));
  const status = params.get("status") ?? "";
  const plan = params.get("plan") ?? "";
  const packageId = params.get("packageId") ?? "";
  const search = (params.get("search") ?? "").trim().slice(0, 120);
  return {
    page:
      Number.isSafeInteger(pageValue) && pageValue > 0 && pageValue <= 1_000_000
        ? pageValue
        : 1,
    pageSize: PAGE_SIZES.includes(sizeValue as TenantListQuery["pageSize"])
      ? (sizeValue as TenantListQuery["pageSize"])
      : 20,
    search,
    status: TENANT_STATUSES.some((value) => value === status)
      ? (status as TenantListQuery["status"])
      : "",
    plan: TENANT_PLANS.includes(plan as TenantPlan) ? (plan as TenantPlan) : "",
    packageId: /^[0-9a-fA-F]{24}$/.test(packageId) ? packageId : "",
  };
}

export function buildTenantListSearch(query: TenantListQuery): string {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.plan) params.set("plan", query.plan);
  if (query.packageId) params.set("packageId", query.packageId);
  return params.toString();
}

export function listTenants(query: TenantListQuery, signal?: AbortSignal) {
  return apiClient<TenantListResponse>(
    `/platform/tenants?${buildTenantListSearch(query)}`,
    { signal },
  );
}

export function getTenantById(id: string, signal?: AbortSignal) {
  return apiClient<{ success: true; data: PlatformTenant }>(
    `/platform/tenants/${encodeURIComponent(id)}`,
    { signal },
  );
}

export function updateTenant(
  id: string,
  update: { status?: "active" | "trial" | "suspended"; plan?: TenantPlan },
) {
  return apiClient<{ success: true; data: PlatformTenant }>(
    `/platform/tenants/${encodeURIComponent(id)}`,
    { method: "PATCH", body: update },
  );
}

export function getTenantDetail(id: string, signal?: AbortSignal) {
  return apiClient<{ success: true; data: TenantDetailView }>(
    `/platform/tenants/${encodeURIComponent(id)}/detail`,
    { signal },
  );
}

export function previewTenantSuspend(id: string, signal?: AbortSignal) {
  return apiClient<{ success: true; data: TenantLifecyclePreview }>(
    `/platform/tenants/${encodeURIComponent(id)}/preview/suspend`,
    { signal },
  );
}

export function previewTenantReinstate(id: string, signal?: AbortSignal) {
  return apiClient<{ success: true; data: TenantLifecyclePreview }>(
    `/platform/tenants/${encodeURIComponent(id)}/preview/reinstate`,
    { signal },
  );
}

export function suspendTenant(id: string, reason: string) {
  return apiClient<{ success: true; data: TenantLifecycleResult }>(
    `/platform/tenants/${encodeURIComponent(id)}/suspend`,
    { method: "POST", body: { reason } },
  );
}

export function reinstateTenant(id: string, reason: string) {
  return apiClient<{ success: true; data: TenantLifecycleResult }>(
    `/platform/tenants/${encodeURIComponent(id)}/reinstate`,
    { method: "POST", body: { reason } },
  );
}

export { DEFAULT_QUERY };
