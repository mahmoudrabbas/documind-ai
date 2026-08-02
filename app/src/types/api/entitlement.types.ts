/**
 * Entitlement contract types.
 *
 * Matches the backend GET /entitlement/usage response:
 * `{ success: true, data: { current, limit, periodStart, periodEnd } }`
 * where `current` and `limit` are flat records keyed by counter dimension.
 */

export interface EntitlementUsageResponse {
  current: Record<string, number>;
  limit: Record<string, number>;
  actual?: {
    documents: number;
    storageBytes: number;
    questions: number;
  };
  periodStart: string;
  periodEnd: string | null;
}

export interface QuotaOverrideInput {
  dimension: string;
  limit: number;
  reason: string;
}

export interface QuotaOverride extends QuotaOverrideInput {
  tenantId: string;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}

/**
 * Report returned by POST /super-admin/entitlement/reconcile after
 * running a quota reconciliation pass (dry-run or execute).
 */
export interface ReconciliationRunReport {
  mode: "dry-run" | "execute";
  timestamp: string;
  totalTenants: number;
  totalDiscrepancies: number;
  totalFixed: number;
  reports: Array<{
    tenantId: string;
    tenantName?: string;
    dimension: string;
    authoritative: number;
    current: number;
    discrepancy: number;
    fixed: boolean;
  }>;
}
