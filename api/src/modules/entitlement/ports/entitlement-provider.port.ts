import type { EntitlementSnapshot } from "../../billing/ports/entitlement-snapshot.port.js";

export interface EntitlementProviderPort {
  /**
   * Get the current entitlement snapshot for a tenant.
   * Resolves from subscription → package → entitlements.
   * Returns null when tenant has no subscription.
   */
  getSnapshot(tenantId: string): Promise<EntitlementSnapshot | null>;

  /**
   * Get the billing period range for a tenant.
   * Returns periodStart and optional periodEnd.
   */
  getPeriodRange(
    tenantId: string,
  ): Promise<{ periodStart: Date; periodEnd: Date | null }>;
}
