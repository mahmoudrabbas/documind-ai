import type { EntitlementSnapshot } from "./entitlement-snapshot.port.js";
import type { SubscriptionStatus } from "../billing.types.js";

// ── Port types ───────────────────────────────────────────────────────────────

export interface ProvisionResult {
  subscriptionId: string;
  tenantId: string;
  packageId: string;
  status: SubscriptionStatus;
}

export interface ProviderEventEnvelope {
  /** Idempotency key — processing an eventId more than once is a no-op */
  eventId: string;
  /** e.g. "invoice.paid", "subscription.canceled" */
  eventType: string;
  /** e.g. "stripe", "paypal" */
  provider: string;
  /** When the provider issued the event */
  timestamp: Date;
  /** Arbitrary provider-specific payload */
  payload: Record<string, unknown>;
}

export interface SynchronizationResult {
  newStatus: SubscriptionStatus;
  entitlementChanged: boolean;
  errors: string[];
}

// ── Port interface ───────────────────────────────────────────────────────────

export interface SubscriptionProvisioningPort {
  /**
   * Create a local subscription record for a tenant.
   * Returns the resulting provision record.
   */
  provision(tenantId: string, packageId: string): Promise<ProvisionResult>;

  /**
   * Get the current entitlement snapshot for a tenant.
   * Returns null when the tenant has no subscription.
   */
  getEntitlement(tenantId: string): Promise<EntitlementSnapshot | null>;

  /**
   * Direct / forced state transition, intended for Super Admin overrides.
   * Returns the new status after transition.
   */
  transition(
    tenantId: string,
    targetState: SubscriptionStatus,
  ): Promise<SubscriptionStatus>;

  /**
   * FR-PAY-004: Process a verified provider webhook event.
   * Maps eventType to a local subscription state transition.
   * Idempotent on eventId — duplicate events are silently skipped.
   */
  processProviderEvent(
    event: ProviderEventEnvelope,
  ): Promise<SynchronizationResult>;
}
