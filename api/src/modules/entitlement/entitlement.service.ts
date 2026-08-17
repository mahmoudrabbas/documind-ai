import type {
  CapabilityKey,
  EntitlementDimension,
  CheckResult,
  ConsumeResult,
} from "./entitlement.types.js";
import type { QuotaCounterPort } from "./ports/quota-counter.port.js";
import type { EntitlementProviderPort } from "./ports/entitlement-provider.port.js";
import type { ReservationStorePort } from "./ports/reservation-store.port.js";
import type { EntitlementSnapshot } from "../billing/ports/entitlement-snapshot.port.js";
import { AppError } from "../../common/errors/AppError.js";
import mongoose from "mongoose";
import QuotaOverrideModel from "../../db/models/quotaOverride.model.js";
import { MongoQuotaCounter } from "./adapters/mongo-quota-counter.js";
import { MongoEntitlementProvider } from "./adapters/mongo-entitlement-provider.js";
import { RedisReservationStore } from "./adapters/redis-reservation-store.js";

// Error codes (will be added to a shared constant file in a future task)
const ENTITLEMENT_UNAVAILABLE = "ENTITLEMENT_UNAVAILABLE";

/** Prefix for reservation IDs created by the direct-consume fallback path. */
const DIRECT_RESERVATION_PREFIX = "direct_";

type SnapshotReconciler = (tenantId: string) => Promise<void>;

export class EntitlementService {
  constructor(
    private readonly counter: QuotaCounterPort,
    private readonly provider: EntitlementProviderPort,
    private readonly reservationStore?: ReservationStorePort,
    private readonly snapshotReconciler?: SnapshotReconciler,
  ) {}

  private async reconcileSnapshotUsage(
    tenantId: string,
    dimension: EntitlementDimension,
  ): Promise<void> {
    if (
      dimension !== "employees" &&
      dimension !== "admins" &&
      dimension !== "documents" &&
      dimension !== "storageMb" &&
      dimension !== "queriesPerMonth"
    ) {
      return;
    }

    try {
      if (this.snapshotReconciler) {
        await this.snapshotReconciler(tenantId);
        return;
      }

      const { getReconciliationService } = await import(
        "./reconciliation.service.js"
      );
      await getReconciliationService().reconcileAtLeast(tenantId, dimension);
    } catch {
      // Reconciliation is best-effort here. The quota counter remains the
      // atomic enforcement point for the request.
    }
  }

  /**
   * Check if a dimension is within limits without consuming.
   */
  async check(
    tenantId: string,
    dimension: EntitlementDimension,
  ): Promise<CheckResult> {
    const snapshot = await this.getSnapshotOrThrow(tenantId);
    const limit = await this.getLimit(tenantId, snapshot, dimension);
    const periodKey = await this.getCounterPeriodKey(tenantId);

    await this.reconcileSnapshotUsage(tenantId, dimension);

    const current = await this.counter.getUsage(tenantId, dimension, periodKey);

    return {
      allowed: current < limit,
      current,
      limit,
      warning: current >= limit * 0.8,
    };
  }

  /**
   * Check a capability-gated value against the tenant snapshot.
   *
   * Unlike `check`/`consume` (counter dimensions), capability keys are not
   * counted resources — they are enforced directly from snapshot metadata:
   *
   * - "allowedModels": `value` is a model name; allowed when it appears in
   *   `snapshot.supportedModels`. Non-string values are treated as not-allowed.
   * - "retentionDays": `value` is the requested retention period in days;
   *   allowed when it does not exceed `snapshot.retentionDays`.
   *
   * @throws AppError(503, "ENTITLEMENT_UNAVAILABLE") when no snapshot exists.
   */
  async checkCapability(
    tenantId: string,
    capability: CapabilityKey,
    value: unknown,
  ): Promise<CheckResult> {
    const snapshot = await this.getSnapshotOrThrow(tenantId);

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
        const limit = await this.getLimit(tenantId, snapshot, dimension);
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
    const limit = await this.getLimit(tenantId, snapshot, dimension);
    const periodStart = await this.getCounterPeriodKey(tenantId);

    await this.reconcileSnapshotUsage(tenantId, dimension);

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
   * When a reservation store is available, the amount is claimed atomically
   * (check-and-take against the counter) and a reservationId is returned for
   * later settlement via `commit` (adjust to the real amount) or `release`
   * (refund the held quota).
   *
   * When no store is available (or it degrades), falls back to a direct
   * consume — the reservation IS the consumption, and IDs carry the
   * `direct_` prefix so `commit`/`release` treat them as final.
   *
   * @returns `{ reservationId }` on success, `null` when the limit would be
   *          exceeded.
   */
  async reserve(
    tenantId: string,
    dimension: EntitlementDimension,
    amount: number,
    ttlSeconds: number,
  ): Promise<{ reservationId: string } | null> {
    const snapshot = await this.getSnapshotOrThrow(tenantId);
    const limit = await this.getLimit(tenantId, snapshot, dimension);
    const periodStart = await this.getCounterPeriodKey(tenantId);

    if (this.reservationStore) {
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
        return null;
      }
    }

    // Fallback: no usable reservation store — direct consume.
    const result = await this.consume(tenantId, dimension, amount);
    if (result.committed) {
      return { reservationId: `${DIRECT_RESERVATION_PREFIX}${Date.now()}` };
    }
    return null;
  }

  /**
   * Commit a reservation (finalize with the real amount).
   *
   * For store-backed reservations the held quota is adjusted to `realAmount`
   * (defaults to the reserved amount): a shortfall is consumed, a surplus is
   * refunded. Idempotent on `requestId` when provided.
   *
   * Direct reservations were fully consumed at reserve time — this is a
   * no-op that returns the current usage state.
   */
  async commit(
    tenantId: string,
    dimension: EntitlementDimension,
    reservationId: string,
    realAmount?: number,
    requestId?: string,
  ): Promise<ConsumeResult> {
    // Re-validate serviceability before settling: the subscription may have
    // become non-serviceable (status/payment state) while the claim was held.
    // getSnapshot applies isServiceableStatus + isServiceablePaymentState and
    // returns null for dead subscriptions — release the claim and fail closed.
    const snapshot = await this.provider.getSnapshot(tenantId);
    if (!snapshot) {
      await this.release(tenantId, dimension, reservationId);
      throw new AppError(
        503,
        ENTITLEMENT_UNAVAILABLE,
        "Entitlement information unavailable",
      );
    }
    const limit = await this.getLimit(tenantId, snapshot, dimension);
    const periodStart = await this.getCounterPeriodKey(tenantId);

    if (reservationId.startsWith(DIRECT_RESERVATION_PREFIX)) {
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

    const reserved = this.reservationStore
      ? await this.reservationStore.commit(tenantId, dimension, reservationId)
      : 0;

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

    const current = await this.counter.getUsage(tenantId, dimension, periodStart);
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
   * Store-backed reservations refund their reserved amount to the counter.
   * Direct reservations cannot be released — the consume is final.
   */
  async release(
    tenantId: string,
    dimension: EntitlementDimension,
    reservationId: string,
  ): Promise<void> {
    if (reservationId.startsWith(DIRECT_RESERVATION_PREFIX)) {
      return;
    }

    const reserved = this.reservationStore
      ? await this.reservationStore.release(tenantId, dimension, reservationId)
      : 0;

    if (reserved > 0) {
      const periodStart = await this.getCounterPeriodKey(tenantId);
      await this.counter.release(tenantId, dimension, periodStart, reserved);
    }
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
    return this.getLimit(tenantId, snapshot, dimension);
  }

  /**
   * Get the ISO date string of the period start.
   */
  async getPeriodStart(tenantId: string): Promise<string> {
    const range = await this.provider.getPeriodRange(tenantId);
    return range.periodStart.toISOString();
  }

  /**
   * Get the ISO date string of the period end (the next quota reset boundary).
   *
   * Throws ENTITLEMENT_UNAVAILABLE when the subscription has no valid period
   * end rather than silently returning "now" as a reset boundary. Callers that
   * treat the reset as informational (e.g. the middleware's
   * `resolvePeriodReset`) already catch this and degrade to null.
   */
  async getPeriodReset(tenantId: string): Promise<string> {
    const range = await this.provider.getPeriodRange(tenantId);
    if (!range.periodEnd) {
      throw new AppError(
        503,
        ENTITLEMENT_UNAVAILABLE,
        "Entitlement period end is unavailable",
      );
    }
    return range.periodEnd.toISOString();
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Get the counter period key (YYYY-MM) for a tenant's current billing period.
   */
  async getCounterPeriodKey(tenantId: string): Promise<string> {
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

  private async getLimit(
    tenantId: string,
    snapshot: EntitlementSnapshot,
    dimension: EntitlementDimension,
  ): Promise<number> {
    // Capability keys are boolean/feature gates; return a sentinel so they
    // never appear exhausted. Quota overrides do not cover them — they are
    // absent from the QuotaOverride dimension enum.
    if (dimension === "allowedModels" || dimension === "retentionDays") {
      return Number.MAX_SAFE_INTEGER;
    }

    // An enabled admin-set override for (tenantId, dimension) wins over the
    // plan snapshot. Consulted on every call — no caching, so changes take
    // effect immediately. Dimensions outside the model enum match nothing
    // and fall back to the snapshot value.
    const override = await QuotaOverrideModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      dimension,
      enabled: true,
    }).lean();

    if (override) {
      return override.limit;
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
      new RedisReservationStore(),
    );
  }
  return _instance;
}
