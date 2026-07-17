import type { PackageEntitlement } from "../billing.types.js";

/**
 * Read-only view of a tenant's current entitlement snapshot, consumed by
 * quota enforcement (Issue 25). This type merges the core PackageEntitlement
 * fields with additional plan-level metadata that governs feature access.
 */
export interface EntitlementSnapshot {
  employees: number;
  admins: number;
  documents: number;
  storageMb: number;
  fileSizeMb: number;
  queriesPerMonth: number;
  tokensPerMonth: number;
  ocrPagesPerMonth: number;
  supportedModels: string[];
  analyticsLevel: "basic" | "advanced" | "enterprise";
  retentionDays: number;
  supportLevel: "community" | "standard" | "priority" | "dedicated";
}

/**
 * Build an EntitlementSnapshot from a PackageEntitlement plus plan-level
 * overrides. This is the single point of derivation — every adapter and
 * service should call this to ensure a consistent mapping.
 */
export function entitlementSnapshotFrom(
  base: PackageEntitlement,
  overrides?: {
    supportedModels?: string[];
    analyticsLevel?: "basic" | "advanced" | "enterprise";
    retentionDays?: number;
    supportLevel?: "community" | "standard" | "priority" | "dedicated";
  },
): EntitlementSnapshot {
  return {
    employees: base.employees,
    admins: base.admins,
    documents: base.documents,
    storageMb: base.storageMb,
    fileSizeMb: base.fileSizeMb,
    queriesPerMonth: base.queriesPerMonth,
    tokensPerMonth: base.tokensPerMonth,
    ocrPagesPerMonth: base.ocrPagesPerMonth,
    supportedModels: overrides?.supportedModels ?? ["basic"],
    analyticsLevel: overrides?.analyticsLevel ?? "basic",
    retentionDays: overrides?.retentionDays ?? 90,
    supportLevel: overrides?.supportLevel ?? "community",
  };
}
