export interface EntitlementUsage {
  current: number;
  limit: number;
  dimension: string;
  periodReset: string;
}

export interface EntitlementUsageResponse {
  usage: EntitlementUsage[];
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
