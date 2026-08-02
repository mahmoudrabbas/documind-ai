import type { ReservationStorePort } from "../reservation-store.port.js";
import type { EntitlementDimension } from "../../entitlement.types.js";

interface StoredReservation {
  tenantId: string;
  dimension: EntitlementDimension;
  amount: number;
}

/**
 * In-memory fake implementation of ReservationStorePort for tests.
 *
 * Storage: a `Map` of `reservationId -> { tenantId, dimension, amount }`.
 * Unlike the Redis adapter there is no TTL expiry — call `reset()` in
 * `beforeEach` / `afterEach` for test isolation.
 *
 * @example
 * ```ts
 * const store = new FakeReservationStore();
 * const res = await store.reserve("t1", "documents", 5, 60);
 * const amount = await store.commit("t1", "documents", res!.reservationId);
 * // => 5
 * ```
 */
export class FakeReservationStore implements ReservationStorePort {
  // ── Internal state ─────────────────────────────────────────────────────

  private readonly reservations = new Map<string, StoredReservation>();

  // ── Lifecycle helpers for tests ─────────────────────────────────────────

  /** Reset all internal state. Call in beforeEach / afterEach. */
  reset(): void {
    this.reservations.clear();
  }

  /**
   * Expose stored reservations for test assertions.
   * Returns a shallow copy to prevent mutation.
   */
  _dumpReservations(): Map<string, StoredReservation> {
    return new Map(this.reservations);
  }

  // ── Key helpers ─────────────────────────────────────────────────────────

  private generateReservationId(): string {
    return `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // ── Port implementation ─────────────────────────────────────────────────

  async reserve(
    tenantId: string,
    dimension: EntitlementDimension,
    amount: number,
    _ttlSeconds: number,
  ): Promise<{ reservationId: string } | null> {
    const reservationId = this.generateReservationId();
    this.reservations.set(reservationId, { tenantId, dimension, amount });
    return { reservationId };
  }

  async commit(
    tenantId: string,
    dimension: EntitlementDimension,
    reservationId: string,
  ): Promise<number> {
    const stored = this.reservations.get(reservationId);
    if (!stored || stored.tenantId !== tenantId || stored.dimension !== dimension) {
      return 0;
    }
    this.reservations.delete(reservationId);
    return stored.amount;
  }

  async release(
    tenantId: string,
    dimension: EntitlementDimension,
    reservationId: string,
  ): Promise<number> {
    const stored = this.reservations.get(reservationId);
    if (!stored || stored.tenantId !== tenantId || stored.dimension !== dimension) {
      return 0;
    }
    this.reservations.delete(reservationId);
    return stored.amount;
  }
}
