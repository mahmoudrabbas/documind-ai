import { apiClient } from "@/lib/api-client";
import { PAGE_SIZES, TENANT_PLANS, TENANT_STATUSES, type PlatformTenant, type TenantListQuery, type TenantListResponse, type TenantPlan } from "@/types/api/platform.types";

const DEFAULT_QUERY: TenantListQuery = { page: 1, pageSize: 20, search: "", status: "", plan: "" };

export function parseTenantListQuery(params: URLSearchParams): TenantListQuery {
  const pageValue = Number(params.get("page"));
  const sizeValue = Number(params.get("pageSize"));
  const status = params.get("status") ?? "";
  const plan = params.get("plan") ?? "";
  const search = (params.get("search") ?? "").trim().slice(0, 120);
  return {
    page: Number.isSafeInteger(pageValue) && pageValue > 0 && pageValue <= 1_000_000 ? pageValue : 1,
    pageSize: PAGE_SIZES.includes(sizeValue as TenantListQuery["pageSize"]) ? sizeValue as TenantListQuery["pageSize"] : 20,
    search,
    status: TENANT_STATUSES.some((value) => value === status) ? status as TenantListQuery["status"] : "",
    plan: TENANT_PLANS.includes(plan as TenantPlan) ? plan as TenantPlan : "",
  };
}

export function buildTenantListSearch(query: TenantListQuery): string {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.plan) params.set("plan", query.plan);
  return params.toString();
}

export function listTenants(query: TenantListQuery, signal?: AbortSignal) {
  return apiClient<TenantListResponse>(`/platform/tenants?${buildTenantListSearch(query)}`, { signal });
}

export function updateTenant(id: string, update: { status?: "active" | "trial" | "suspended"; plan?: TenantPlan }) {
  return apiClient<{ success: true; data: PlatformTenant }>(`/platform/tenants/${encodeURIComponent(id)}`, { method: "PATCH", body: update });
}

export { DEFAULT_QUERY };
