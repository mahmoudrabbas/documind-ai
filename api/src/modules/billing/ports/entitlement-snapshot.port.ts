import type { PackageEntitlements } from "../../../db/models/package.model.js";

/**
 * Flat snapshot of a tenant's effective entitlements at a point in time.
 *
 * Includes ALL FR-PAY-001 granular limits plus model / support / retention
 * information that quota-enforcement services (Issues 25, 29) need without
 * a DB read.
 *
 * The `currentUsage` sub-object is populated by the quota-enforcement
 * service and is **read-only** — it is never written back through this port.
 */
export interface EntitlementSnapshot extends PackageEntitlements {
  /** AI models the tenant is allowed to use. */
  supportedModels: string[];
  /** Analytics reporting tier. */
  analyticsLevel: "basic" | "advanced" | "enterprise";
  /** Document retention period in days. */
  retentionDays: number;
  /** Customer-support response tier. */
  supportLevel: "community" | "standard" | "priority" | "dedicated";

  /**
   * Current usage context — populated by the quota service.
   *
   * @readonly This is a projection; mutations are NOT persisted through
   *           this field.
   */
  currentUsage?: {
    employees: number;
    documents: number;
    storageMb: number;
    queriesThisMonth: number;
  };
}
