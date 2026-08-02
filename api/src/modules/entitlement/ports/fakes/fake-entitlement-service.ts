import type { CapabilityKey, EntitlementDimension, CheckResult, ConsumeResult } from "../../entitlement.types.js";
import type { EntitlementSnapshot } from "../../../billing/ports/entitlement-snapshot.port.js";
import { FakeQuotaCounter } from "./fake-quota-counter.js";
import { FakeReservationStore } from "./fake-reservation-store.js";

/**
 * In-memory fake implementation of the entitlement service for tests.
 *
 * Uses a FakeQuotaCounter internally for atomic counter operations.
 * Supports configurable snapshot overrides per tenant via `setSnapshot()`.
 * Call `reset()` in `beforeEach` / `afterEach` for test isolation.
 *
 * Capability keys (`allowedModels`, `retentionDays`) always return a large
 * limit (Number.MAX_SAFE_INTEGER) for `check`/`consume` — the fake assumes
 * these are always enabled as counters. `checkCapability` enforces the same
 * snapshot semantics as the real service (model membership / retention cap).
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
  private readonly reservationStore: FakeReservationStore;
  private readonly snapshots = new Map<string, EntitlementSnapshot>();
  private readonly defaultSnapshot: EntitlementSnapshot;

  constructor(defaultSnapshot?: EntitlementSnapshot) {
    this.counter = new FakeQuotaCounter();
    this.reservationStore = new FakeReservationStore();
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
    this.reservationStore.reset();
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

  /**
   * Expose the underlying FakeReservationStore for test assertions
   * (dumping outstanding reservations).
   */
  getReservationStore(): FakeReservationStore {
    return this.reservationStore;
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

  /**
   * Reserve quota atomically (reserve-then-commit pattern).
   *
   * Mirrors the real service's store-backed path: claims the amount in the
   * reservation store, then consumes it from the counter. On success returns
   * `{ reservationId }`; when the limit would be exceeded the claim is rolled
   * back and `null` is returned.
   */
  async reserve(
    tenantId: string,
    dimension: EntitlementDimension,
    amount: number,
    ttlSeconds: number,
  ): Promise<{ reservationId: string } | null> {
    const snapshot = this.getSnapshot(tenantId);
    const limit = this.getLimit(snapshot, dimension);
    const periodStart = this.getCurrentPeriodStart();

    const reservation = await this.reservationStore.reserve(
      tenantId,
      dimension,
      amount,
      ttlSeconds,
    );

    if (reservation) {
      const result = await this.counter.checkAndConsume(
        tenantId,
        dimension,
        periodStart,
        amount,
        limit,
      );

      if (result.success) {
        return { reservationId: reservation.reservationId };
      }

      // Over limit — roll back the claim so no quota is left dangling.
      await this.reservationStore.release(
        tenantId,
        dimension,
        reservation.reservationId,
      );
    }

    return null;
  }

  /**
   * Commit a reservation (finalize with the real amount).
   *
   * Mirrors the real service: settles the store claim and adjusts the held
   * quota to `realAmount` (defaults to the reserved amount) — a shortfall is
   * consumed, a surplus is refunded. Idempotent on `requestId` when provided.
   */
  async commit(
    tenantId: string,
    dimension: EntitlementDimension,
    reservationId: string,
    realAmount?: number,
    requestId?: string,
  ): Promise<ConsumeResult> {
    const snapshot = this.getSnapshot(tenantId);
    const limit = this.getLimit(snapshot, dimension);
    const periodStart = this.getCurrentPeriodStart();

    const reserved = await this.reservationStore.commit(
      tenantId,
      dimension,
      reservationId,
    );

    if (reserved <= 0) {
      // Reservation not found (already settled/expired) — return current state.
      const current = await this.counter.getUsage(
        tenantId,
        dimension,
        periodStart,
      );
      return {
        committed: true,
        current,
        limit,
        remaining: Math.max(0, limit - current),
      };
    }

    const delta = (realAmount ?? reserved) - reserved;

    if (delta > 0) {
      const result = await this.counter.checkAndConsume(
        tenantId,
        dimension,
        periodStart,
        delta,
        limit,
      );
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

    if (delta < 0) {
      await this.counter.release(tenantId, dimension, periodStart, -delta);
    }

    const current = await this.counter.getUsage(
      tenantId,
      dimension,
      periodStart,
    );
    return {
      committed: true,
      current,
      limit,
      remaining: Math.max(0, limit - current),
    };
  }

  /**
   * Release a reservation (refund the held quota).
   *
   * Mirrors the real service: settles the store claim and refunds the reserved
   * amount to the counter.
   */
  async release(
    tenantId: string,
    dimension: EntitlementDimension,
    reservationId: string,
  ): Promise<void> {
    const reserved = await this.reservationStore.release(
      tenantId,
      dimension,
      reservationId,
    );

    if (reserved > 0) {
      const periodStart = this.getCurrentPeriodStart();
      await this.counter.release(tenantId, dimension, periodStart, reserved);
    }
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

  async checkCapability(
    tenantId: string,
    capability: CapabilityKey,
    value: unknown,
  ): Promise<CheckResult> {
    const snapshot = this.getSnapshot(tenantId);

    if (capability === "allowedModels") {
      const allowed =
        typeof value === "string" && snapshot.supportedModels.includes(value);
      return {
        allowed,
        current: 0,
        limit: snapshot.supportedModels.length,
        warning: false,
      };
    }

    // capability === "retentionDays"
    const requested = typeof value === "number" ? value : 0;
    const allowed =
      typeof value === "number" && requested <= snapshot.retentionDays;
    return {
      allowed,
      current: requested,
      limit: snapshot.retentionDays,
      warning: false,
    };
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
