import type { SubscriptionStatus } from "../billing.types.js";
import type { EntitlementSnapshot } from "./entitlement-snapshot.port.js";
import type {
  ProviderEventEnvelope,
  SynchronizationResult,
} from "./provider-event.types.js";

/**
 * Result of a successful provisioning operation.
 */
export interface ProvisionResult {
  subscriptionId: string;
  status: SubscriptionStatus;
  periodEnd: Date;
}

/**
 * Provider-neutral port for subscription lifecycle operations (FR-PAY-001/004).
 *
 * Implementations decouple the billing domain from any specific database
 * (Mongoose, SQL, etc.) or payment provider (Stripe, LemonSqueezy, etc.).
 * Downstream consumers (Issues 10, 25, 29) depend on this interface, not
 * on concrete adapters.
 */
export interface SubscriptionProvisioningPort {
  /**
   * Create a local subscription for a tenant.
   *
   * Idempotent: if a subscription already exists for `tenantId`, the
   * existing record is returned (no duplicate is created).
   */
  provision(tenantId: string, packageId: string): Promise<ProvisionResult>;

  /**
   * Read the tenant's current effective entitlements.
   *
   * Resolves the subscription → package chain and returns a flat snapshot
   * with all limit, model, and support fields.
   */
  getEntitlement(tenantId: string): Promise<EntitlementSnapshot>;

  /**
   * Direct (Super Admin) state transition override.
   *
   * Validates the transition against the {@link LegalTransition} map.
   * Throws if the transition is not allowed from the current status.
   */
  transition(
    tenantId: string,
    targetState: SubscriptionStatus,
  ): Promise<SubscriptionStatus>;

  /**
   * Process a provider webhook event (FR-PAY-004).
   *
   * Maps the event to a target status via {@link ProviderEventTransitionMap},
   * validates the transition against {@link LegalTransition}, applies it,
   * and returns the result.
   *
   * Idempotent on `eventId` — duplicate events are silently skipped with
   * `{ newStatus: null, entitlementChanged: false, errors: [] }`.
   */
  processProviderEvent(
    event: ProviderEventEnvelope,
  ): Promise<SynchronizationResult>;
}

export type {
  ProviderEventEnvelope,
  SynchronizationResult,
} from "./provider-event.types.js";
