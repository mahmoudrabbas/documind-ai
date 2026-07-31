import { apiClient } from "@/lib/api-client";
import type {
  EntitlementUsageResponse,
  QuotaOverrideInput,
  QuotaOverride,
  ReconciliationRunReport,
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
  page = 1,
  pageSize = 20,
  tenantId?: string,
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  search.set("page", String(page));
  search.set("pageSize", String(pageSize));
  if (tenantId) search.set("tenantId", tenantId);
  return apiClient<
    Success<{
      overrides: QuotaOverride[];
      pagination: { page: number; pageSize: number; totalPages: number; totalRecords: number };
    }>
  >(`/super-admin/entitlement/overrides?${search.toString()}`, { signal });
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

/**
 * Run a quota reconciliation pass.
 *
 * `dry-run` computes discrepancies without fixing anything; `execute`
 * applies authoritative limits to tenant counters. The backend endpoint is
 * being added in parallel and may 404 until it lands.
 */
export function runReconciliation(
  mode: "dry-run" | "execute",
  tenantId?: string,
  signal?: AbortSignal,
) {
  return apiClient<Success<ReconciliationRunReport>>(
    "/super-admin/entitlement/reconcile",
    {
      method: "POST",
      body: { mode, ...(tenantId ? { tenantId } : {}) },
      signal,
    },
  );
}
