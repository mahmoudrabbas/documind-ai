import type { EntitlementDimension, CheckResult, ConsumeResult } from "../../entitlement.types.js";
import type { EntitlementSnapshot } from "../../../billing/ports/entitlement-snapshot.port.js";
import { FakeQuotaCounter } from "./fake-quota-counter.js";

/**
 * In-memory fake implementation of the entitlement service for tests.
 *
 * Uses a FakeQuotaCounter internally for atomic counter operations.
 * Supports configurable snapshot overrides per tenant via `setSnapshot()`.
 * Call `reset()` in `beforeEach` / `afterEach` for test isolation.
 *
 * Capability keys (`allowedModels`, `retentionDays`) always return a large
 * limit (Number.MAX_SAFE_INTEGER) — the fake assumes these are always enabled.
 *
 * @example
 * ```ts
 * const service = new FakeEntitlementService();
 *
 * // Configure a custom snapshot for a tenant
 * service.setSnapshot("tenant-1", {
 *   employees: 100,
 *   admins: 10,
 *   documents: 1000,
 *   storageMb: 10240,
 *   fileSizeMb: 50,
 *   queriesPerMonth: 5000,
 *   tokensPerMonth: 100000,
 *   ocrPagesPerMonth: 500,
 *   supportedModels: ["basic", "standard"],
 *   analyticsLevel: "basic",
 *   retentionDays: 90,
 *   supportLevel: "standard",
 * });
 *
 * // Check quota
 * const result = await service.check("tenant-1", "documents");
 * // => { allowed: true, current: 0, limit: 1000 }
 * ```
 */
export class FakeEntitlementService {
  private readonly counter: FakeQuotaCounter;
  private readonly snapshots = new Map<string, EntitlementSnapshot>();
  private readonly defaultSnapshot: EntitlementSnapshot;

  constructor(defaultSnapshot?: EntitlementSnapshot) {
    this.counter = new FakeQuotaCounter();
    this.defaultSnapshot = defaultSnapshot ?? {
      employees: 10,
      admins: 2,
      documents: 100,
      storageMb: 1024,
      fileSizeMb: 50,
      queriesPerMonth: 1000,
      tokensPerMonth: 100000,
      ocrPagesPerMonth: 500,
      supportedModels: ["basic", "standard"],
      analyticsLevel: "basic",
      retentionDays: 90,
      supportLevel: "community",
    };
  }

  // ── Lifecycle helpers for tests ─────────────────────────────────────────

  /** Reset all internal state. Call in beforeEach / afterEach. */
  reset(): void {
    this.counter.reset();
    this.snapshots.clear();
  }

  /**
   * Set a custom entitlement snapshot for a specific tenant.
   * Overrides the default for subsequent checks and consumption on that tenant.
   */
  setSnapshot(tenantId: string, snapshot: EntitlementSnapshot): void {
    this.snapshots.set(tenantId, snapshot);
  }

  /**
   * Expose the underlying FakeQuotaCounter for test assertions
   * (seeding, dumping counters, checking gates).
   */
  getCounter(): FakeQuotaCounter {
    return this.counter;
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private getSnapshot(tenantId: string): EntitlementSnapshot {
    return this.snapshots.get(tenantId) ?? this.defaultSnapshot;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  async check(
    tenantId: string,
    dimension: EntitlementDimension,
  ): Promise<CheckResult> {
    const snapshot = this.getSnapshot(tenantId);
    const limit = this.getLimit(snapshot, dimension);
    const current = await this.counter.getUsage(
      tenantId,
      dimension,
      this.getCurrentPeriodStart(),
    );

    return {
      allowed: current < limit,
      current,
      limit,
      warning: current >= limit * 0.8,
    };
  }

  async consume(
    tenantId: string,
    dimension: EntitlementDimension,
    amount: number,
    requestId?: string,
  ): Promise<ConsumeResult> {
    // Idempotency check
    if (requestId) {
      const exists = await this.counter.getIdempotencyGate(
        tenantId,
        dimension,
        requestId,
      );
      if (exists) {
        // Return last result without incrementing
        const snapshot = this.getSnapshot(tenantId);
        const limit = this.getLimit(snapshot, dimension);
        const current = await this.counter.getUsage(
          tenantId,
          dimension,
          this.getCurrentPeriodStart(),
        );
        return {
          committed: current >= amount,
          current,
          limit,
          remaining: Math.max(0, limit - current),
        };
      }
    }

    const snapshot = this.getSnapshot(tenantId);
    const limit = this.getLimit(snapshot, dimension);
    const periodStart = this.getCurrentPeriodStart();

    const result = await this.counter.checkAndConsume(
      tenantId,
      dimension,
      periodStart,
      amount,
      limit,
    );

    // Create idempotency gate if requestId provided
    if (requestId && result.success) {
      await this.counter.createIdempotencyGate(
        tenantId,
        dimension,
        requestId,
      );
    }

    return {
      committed: result.success,
      current: result.current,
      limit,
      remaining: Math.max(0, limit - result.current),
    };
  }

  async getUsage(
    tenantId: string,
  ): Promise<Record<EntitlementDimension, number>> {
    return this.counter.getAllUsage(
      tenantId,
      this.getCurrentPeriodStart(),
    );
  }

  async getEntitlementSnapshot(
    tenantId: string,
  ): Promise<EntitlementSnapshot | null> {
    return this.getSnapshot(tenantId);
  }

  async getEffectiveLimit(
    tenantId: string,
    dimension: EntitlementDimension,
  ): Promise<number> {
    const snapshot = this.getSnapshot(tenantId);
    return this.getLimit(snapshot, dimension);
  }

  async getPeriodReset(_tenantId: string): Promise<string> {
    // Return end of current month
    const now = new Date();
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );
    return endOfMonth.toISOString();
  }

  private getLimit(
    snapshot: EntitlementSnapshot,
    dimension: EntitlementDimension,
  ): number {
    // For capability keys, return a large number (always allowed)
    if (dimension === "allowedModels" || dimension === "retentionDays") {
      return Number.MAX_SAFE_INTEGER;
    }
    return snapshot[dimension as keyof EntitlementSnapshot] as number;
  }

  private getCurrentPeriodStart(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
}
