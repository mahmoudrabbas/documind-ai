import type { EntitlementDimension } from "../entitlement.types.js";

/**
 * Atomic counter port for quota enforcement.
 *
 * Every counter is keyed by the compound (tenantId, dimension, periodStart)
 * triple.  Idempotency gates live in a SEPARATE collection, NOT embedded in
 * the counter document, so the two concerns can be scaled independently.
 */
export interface QuotaCounterPort {
  /**
   * Atomically check and consume quota. Increments counter if
   * value + amount <= limit. Returns success with current value,
   * or failure without incrementing.
   */
  checkAndConsume(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    amount: number,
    limit: number,
  ): Promise<{ success: boolean; current: number }>;

  /**
   * Atomically release (decrement) quota. Floor at 0.
   */
  release(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    amount: number,
  ): Promise<void>;

  /**
   * Get current usage for a specific dimension.
   */
  getUsage(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
  ): Promise<number>;

  /**
   * Get all usage dimensions for a tenant.
   */
  getAllUsage(
    tenantId: string,
    periodStart: string,
  ): Promise<Record<EntitlementDimension, number>>;

  /**
   * Reset counters for a new billing period.
   * Creates new counter documents with the new periodStart.
   */
  resetPeriod(
    tenantId: string,
    oldPeriodStart: string,
    newPeriodStart: string,
  ): Promise<void>;

  /**
   * Set a counter value directly (admin / reconciliation use).
   * Overwrites any existing value for the given key.
   */
  set(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    value: number,
  ): Promise<void>;

  /**
   * Check if a request has already been processed (idempotency gate).
   */
  getIdempotencyGate(
    tenantId: string,
    dimension: EntitlementDimension,
    requestId: string,
  ): Promise<boolean>;

  /**
   * Create an idempotency gate. Returns false if gate already exists.
   */
  createIdempotencyGate(
    tenantId: string,
    dimension: EntitlementDimension,
    requestId: string,
  ): Promise<boolean>;
}
