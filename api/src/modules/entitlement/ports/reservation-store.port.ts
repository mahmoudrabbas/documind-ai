import type { EntitlementDimension } from "../entitlement.types.js";

/**
 * Reservation store port for reserve-then-commit quota semantics.
 *
 * A reservation is a short-lived claim on quota. The flow is:
 *
 * 1. `reserve` — atomically claim `amount` of quota for a dimension. The
 *    caller receives a `reservationId` it must later settle.
 * 2. `commit` — settle the reservation with the REAL amount consumed. The
 *    stored reservation is removed and the reserved amount is returned so
 *    the caller can adjust the counter to the actual usage.
 * 3. `release` — cancel the reservation without consuming. The reserved
 *    amount is returned so the caller can refund the held quota.
 *
 * Implementations must be tolerant of store unavailability: `reserve`
 * returns `null` and `commit`/`release` return `0` when the store cannot
 * be reached, so callers can fall back to a direct consume path.
 */
export interface ReservationStorePort {
  /**
   * Create a reservation claim for `amount` quota with a TTL.
   *
   * @returns `{ reservationId }` on success, `null` when the store is
   *          unavailable or the claim could not be created.
   */
  reserve(
    tenantId: string,
    dimension: EntitlementDimension,
    amount: number,
    ttlSeconds: number,
  ): Promise<{ reservationId: string } | null>;

  /**
   * Settle a reservation: remove the stored claim and return the reserved
   * amount so the caller can adjust the counter to the real usage.
   *
   * @returns The reserved amount, or `0` if the reservation was not found
   *          (already settled, released, or expired via TTL).
   */
  commit(
    tenantId: string,
    dimension: EntitlementDimension,
    reservationId: string,
  ): Promise<number>;

  /**
   * Cancel a reservation without consuming: remove the stored claim and
   * return the reserved amount so the caller can refund the held quota.
   *
   * @returns The released amount, or `0` if the reservation was not found.
   */
  release(
    tenantId: string,
    dimension: EntitlementDimension,
    reservationId: string,
  ): Promise<number>;
}
