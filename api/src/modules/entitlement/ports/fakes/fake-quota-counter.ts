import type { QuotaCounterPort } from "../quota-counter.port.js";
import type { EntitlementDimension } from "../../entitlement.types.js";

/**
 * In-memory fake implementation of QuotaCounterPort for tests.
 *
 * Storage:
 * - `counters`: Maps `"tenantId:dimension:periodStart"` to a numeric count.
 * - `idempotencyGates`: Set of `"tenantId:dimension:requestId"` strings
 *   representing requests that have already been processed.
 *
 * Call `reset()` in `beforeEach` / `afterEach` for test isolation.
 *
 * @example
 * ```ts
 * const counter = new FakeQuotaCounter();
 * counter._seed("t1", "queriesPerMonth", "2026-01", 10);
 *
 * const result = await counter.checkAndConsume("t1", "queriesPerMonth", "2026-01", 5, 100);
 * // => { success: true, current: 15 }
 * ```
 */
export class FakeQuotaCounter implements QuotaCounterPort {
  // ── Internal state ─────────────────────────────────────────────────────

  /**
   * Counter storage.
   * Key format: `"${tenantId}:${dimension}:${periodStart}"`
   */
  private readonly counters = new Map<string, number>();

  /**
   * Idempotency gate storage.
   * Key format: `"${tenantId}:${dimension}:${requestId}"`
   */
  private readonly idempotencyGates = new Set<string>();

  // ── Lifecycle helpers for tests ─────────────────────────────────────────

  /** Reset all internal state. Call in beforeEach / afterEach. */
  reset(): void {
    this.counters.clear();
    this.idempotencyGates.clear();
  }

  /**
   * Seed a counter value directly (convenience for test setup).
   * Skips quota checks — useful for arranging pre-existing usage.
   */
  _seed(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    value: number,
  ): void {
    this.counters.set(this.counterKey(tenantId, dimension, periodStart), value);
  }

  /**
   * Expose stored counters for test assertions.
   * Returns a shallow copy to prevent mutation.
   */
  _dumpCounters(): Map<string, number> {
    return new Map(this.counters);
  }

  /**
   * Expose stored idempotency gates for test assertions.
   * Returns a shallow copy to prevent mutation.
   */
  _dumpGates(): Set<string> {
    return new Set(this.idempotencyGates);
  }

  /**
   * Check whether a specific counter key exists (convenience for assertions).
   */
  _hasCounter(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
  ): boolean {
    return this.counters.has(this.counterKey(tenantId, dimension, periodStart));
  }

  // ── Key helpers ─────────────────────────────────────────────────────────

  private counterKey(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
  ): string {
    return `${tenantId}:${dimension}:${periodStart}`;
  }

  private gateKey(
    tenantId: string,
    dimension: EntitlementDimension,
    requestId: string,
  ): string {
    return `${tenantId}:${dimension}:${requestId}`;
  }

  // ── Port implementation ─────────────────────────────────────────────────

  async checkAndConsume(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    amount: number,
    limit: number,
  ): Promise<{ success: boolean; current: number }> {
    const key = this.counterKey(tenantId, dimension, periodStart);
    const current = this.counters.get(key) ?? 0;

    if (current + amount <= limit) {
      this.counters.set(key, current + amount);
      return { success: true, current: current + amount };
    }

    return { success: false, current };
  }

  async release(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    amount: number,
  ): Promise<void> {
    const key = this.counterKey(tenantId, dimension, periodStart);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, Math.max(0, current - amount));
  }

  async getUsage(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
  ): Promise<number> {
    const key = this.counterKey(tenantId, dimension, periodStart);
    return this.counters.get(key) ?? 0;
  }

  async getAllUsage(
    tenantId: string,
    periodStart: string,
  ): Promise<Record<EntitlementDimension, number>> {
    const prefix = `${tenantId}:`;
    const suffix = `:${periodStart}`;

    const usage: Record<string, number> = {};

    for (const [key, value] of this.counters.entries()) {
      if (key.startsWith(prefix) && key.endsWith(suffix)) {
        const dimension = key.slice(
          prefix.length,
          key.length - suffix.length,
        ) as EntitlementDimension;
        usage[dimension] = value;
      }
    }

    return usage as Record<EntitlementDimension, number>;
  }

  async resetPeriod(
    tenantId: string,
    oldPeriodStart: string,
    newPeriodStart: string,
  ): Promise<void> {
    const oldPrefix = `${tenantId}:`;
    const oldSuffix = `:${oldPeriodStart}`;

    for (const key of this.counters.keys()) {
      if (key.startsWith(oldPrefix) && key.endsWith(oldSuffix)) {
        const dimension = key.slice(
          oldPrefix.length,
          key.length - oldSuffix.length,
        );
        const newKey = `${tenantId}:${dimension}:${newPeriodStart}`;
        if (!this.counters.has(newKey)) {
          this.counters.set(newKey, 0);
        }
      }
    }
  }

  async getIdempotencyGate(
    tenantId: string,
    dimension: EntitlementDimension,
    requestId: string,
  ): Promise<boolean> {
    return this.idempotencyGates.has(
      this.gateKey(tenantId, dimension, requestId),
    );
  }

  async createIdempotencyGate(
    tenantId: string,
    dimension: EntitlementDimension,
    requestId: string,
  ): Promise<boolean> {
    const key = this.gateKey(tenantId, dimension, requestId);
    if (this.idempotencyGates.has(key)) {
      return false; // Already exists
    }
    this.idempotencyGates.add(key);
    return true;
  }

  async set(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    value: number,
  ): Promise<void> {
    const key = this.counterKey(tenantId, dimension, periodStart);
    this.counters.set(key, Math.max(0, value));
  }

  async ensureAtLeast(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    value: number,
  ): Promise<number> {
    const current = await this.getUsage(tenantId, dimension, periodStart);
    const next = Math.max(current, value);
    await this.set(tenantId, dimension, periodStart, next);
    return next;
  }
}
