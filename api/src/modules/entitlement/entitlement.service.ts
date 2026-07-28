import type {
  EntitlementDimension,
  CheckResult,
  ConsumeResult,
} from "./entitlement.types.js";
import type { QuotaCounterPort } from "./ports/quota-counter.port.js";
import type { EntitlementProviderPort } from "./ports/entitlement-provider.port.js";
import type { EntitlementSnapshot } from "../billing/ports/entitlement-snapshot.port.js";
import { AppError } from "../../common/errors/AppError.js";
import { MongoQuotaCounter } from "./adapters/mongo-quota-counter.js";
import { MongoEntitlementProvider } from "./adapters/mongo-entitlement-provider.js";

// Error codes (will be added to a shared constant file in a future task)
const ENTITLEMENT_UNAVAILABLE = "ENTITLEMENT_UNAVAILABLE";

export class EntitlementService {
  constructor(
    private readonly counter: QuotaCounterPort,
    private readonly provider: EntitlementProviderPort,
  ) {}

  /**
   * Check if a dimension is within limits without consuming.
   */
  async check(
    tenantId: string,
    dimension: EntitlementDimension,
  ): Promise<CheckResult> {
    const snapshot = await this.getSnapshotOrThrow(tenantId);
    const limit = this.getLimit(snapshot, dimension);
    const periodKey = await this.getCounterPeriodKey(tenantId);
    const current = await this.counter.getUsage(tenantId, dimension, periodKey);

    return {
      allowed: current < limit,
      current,
      limit,
      warning: current >= limit * 0.8,
    };
  }

  /**
   * Atomically consume quota. Idempotent on requestId.
   */
  async consume(
    tenantId: string,
    dimension: EntitlementDimension,
    amount: number,
    requestId?: string,
  ): Promise<ConsumeResult> {
    // Idempotency check: if requestId is provided and the gate already exists,
    // return the current state without incrementing again.
    if (requestId) {
      const exists = await this.counter.getIdempotencyGate(
        tenantId,
        dimension,
        requestId,
      );
      if (exists) {
        const snapshot = await this.getSnapshotOrThrow(tenantId);
        const limit = this.getLimit(snapshot, dimension);
        const periodStart = await this.getCounterPeriodKey(tenantId);
        const current = await this.counter.getUsage(tenantId, dimension, periodStart);
        return {
          committed: true,
          current,
          limit,
          remaining: Math.max(0, limit - current),
        };
      }
    }

    const snapshot = await this.getSnapshotOrThrow(tenantId);
    const limit = this.getLimit(snapshot, dimension);
    const periodStart = await this.getCounterPeriodKey(tenantId);

    const result = await this.counter.checkAndConsume(
      tenantId,
      dimension,
      periodStart,
      amount,
      limit,
    );

    // Persist idempotency gate when consumption succeeds and requestId was given
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
   * Reserve quota (2-phase commit: reserve → commit or release).
   *
   * For the initial implementation this delegates to consume directly.
   * A dedicated reservation store (e.g. Redis) can be added later.
   */
  async reserve(
    tenantId: string,
    dimension: EntitlementDimension,
    amount: number,
    _ttlSeconds: number,
  ): Promise<{ reservationId: string } | null> {
    const result = await this.consume(tenantId, dimension, amount);
    if (result.committed) {
      return { reservationId: `direct_${Date.now()}` };
    }
    return null;
  }

  /**
   * Commit a reservation (finalize the consume).
   *
   * Direct reservations are already consumed, so this is a no-op that
   * returns the current usage state.
   */
  async commit(
    tenantId: string,
    dimension: EntitlementDimension,
    _reservationId: string,
    _requestId?: string,
  ): Promise<ConsumeResult> {
    const snapshot = await this.getSnapshotOrThrow(tenantId);
    const limit = this.getLimit(snapshot, dimension);
    const periodStart = await this.getCounterPeriodKey(tenantId);
    const current = await this.counter.getUsage(tenantId, dimension, periodStart);

    return {
      committed: true,
      current,
      limit,
      remaining: Math.max(0, limit - current),
    };
  }

  /**
   * Release a reservation (decrement the counter).
   *
   * Direct reservations cannot be reliably released because the consume
   * is final. A dedicated reservation store would enable proper TTL-based
   * releases in a future iteration.
   */
  async release(
    _tenantId: string,
    _dimension: EntitlementDimension,
    _reservationId: string,
  ): Promise<void> {
    // No-op for direct consumption pattern
  }

  /**
   * Get all usage dimensions for a tenant in the current period.
   */
  async getUsage(
    tenantId: string,
  ): Promise<Record<EntitlementDimension, number>> {
    const periodStart = await this.getCounterPeriodKey(tenantId);
    return this.counter.getAllUsage(tenantId, periodStart);
  }

  /**
   * Get the full entitlement snapshot for a tenant.
   *
   * Returns null when the tenant has no active subscription — callers that
   * require entitlements should use `check` or `consume` instead, which
   * throw when the snapshot is unavailable.
   */
  async getEntitlementSnapshot(
    tenantId: string,
  ): Promise<EntitlementSnapshot | null> {
    return this.provider.getSnapshot(tenantId);
  }

  /**
   * Get the effective limit for a dimension (derived from the entitlement snapshot).
   */
  async getEffectiveLimit(
    tenantId: string,
    dimension: EntitlementDimension,
  ): Promise<number> {
    const snapshot = await this.getSnapshotOrThrow(tenantId);
    return this.getLimit(snapshot, dimension);
  }

  /**
   * Get the ISO date string of the period start.
   */
  async getPeriodStart(tenantId: string): Promise<string> {
    const range = await this.provider.getPeriodRange(tenantId);
    return range.periodStart.toISOString();
  }

  /**
   * Get the ISO date string of the period end.
   */
  async getPeriodReset(tenantId: string): Promise<string> {
    const range = await this.provider.getPeriodRange(tenantId);
    return range.periodEnd?.toISOString() ?? new Date().toISOString();
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Get the counter period key (YYYY-MM) for a tenant's current billing period.
   */
  private async getCounterPeriodKey(tenantId: string): Promise<string> {
    const range = await this.provider.getPeriodRange(tenantId);
    const start = range.periodStart;
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  }

  private async getSnapshotOrThrow(
    tenantId: string,
  ): Promise<EntitlementSnapshot> {
    const snapshot = await this.provider.getSnapshot(tenantId);
    if (!snapshot) {
      throw new AppError(
        503,
        ENTITLEMENT_UNAVAILABLE,
        "Entitlement information unavailable",
      );
    }
    return snapshot;
  }

  private getLimit(
    snapshot: EntitlementSnapshot,
    dimension: EntitlementDimension,
  ): number {
    // Capability keys are boolean/feature gates; return a sentinel so they
    // never appear exhausted.
    if (dimension === "allowedModels" || dimension === "retentionDays") {
      return Number.MAX_SAFE_INTEGER;
    }

    // Counter dimensions map 1:1 to numeric fields on EntitlementSnapshot.
    return snapshot[dimension as keyof EntitlementSnapshot] as number;
  }


}

// ── Singleton accessor ────────────────────────────────────────────────────

let _instance: EntitlementService | null = null;

export function getEntitlementService(): EntitlementService {
  if (!_instance) {
    _instance = new EntitlementService(
      new MongoQuotaCounter(),
      new MongoEntitlementProvider(),
    );
  }
  return _instance;
}
