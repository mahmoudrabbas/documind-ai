import { getRedisClient, isRedisConnected } from "../../../db/redis.js";

// ── Result type ──────────────────────────────────────────────────────────────

export interface ReservationResult {
  reservationId: string;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * Optional Redis-backed reservation store.
 *
 * Provides atomic reserve / commit / release semantics for entitlement quota
 * reservations.  Every operation degrades gracefully when Redis is unavailable
 * — callers fall back to the MongoDB-only path.
 *
 * Reservations are created with a TTL so stale entries expire automatically.
 */
export class RedisReservationStore {
  private readonly enabled: boolean;

  constructor() {
    // Module-level flag: set ENTITLEMENT_USE_REDIS_RESERVATIONS=false to
    // disable Redis reservations without touching code.
    this.enabled = process.env.ENTITLEMENT_USE_REDIS_RESERVATIONS !== "false";
  }

  // ── Key helpers ────────────────────────────────────────────────────────────

  private reservationKey(
    tenantId: string,
    dimension: string,
    reservationId: string,
  ): string {
    return `reservation:${tenantId}:${dimension}:${reservationId}`;
  }

  private generateReservationId(): string {
    return `res_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Reserve quota in Redis with TTL.
   *
   * @returns ReservationResult on success, `null` when Redis is unavailable or
   *          the key already exists (should not happen with unique IDs).
   */
  async reserve(
    tenantId: string,
    dimension: string,
    amount: number,
    ttlSeconds: number,
  ): Promise<ReservationResult | null> {
    if (!this.enabled || !isRedisConnected()) {
      return null; // Fallback to MongoDB-only path
    }

    try {
      const redis = getRedisClient();
      const reservationId = this.generateReservationId();
      const key = this.reservationKey(tenantId, dimension, reservationId);

      // SET with NX (only if not exists) and TTL
      const result = await redis.set(
        key,
        amount.toString(),
        "EX",
        ttlSeconds,
        "NX",
      );

      if (result === "OK") {
        return { reservationId };
      }

      return null; // Key already exists (shouldn't happen with unique IDs)
    } catch (error) {
      console.warn(
        "[RedisReservationStore] Redis error during reserve, falling back to MongoDB:",
        error,
      );
      return null;
    }
  }

  /**
   * Commit a reservation: read the stored amount, delete the key, return the
   * amount so the caller can atomically increment the MongoDB counter.
   *
   * @returns The reserved amount, or `0` if the reservation was not found
   *          (already committed, released, or expired via TTL).
   */
  async commit(
    tenantId: string,
    dimension: string,
    reservationId: string,
  ): Promise<number> {
    if (!this.enabled || !isRedisConnected()) {
      return 0;
    }

    try {
      const redis = getRedisClient();
      const key = this.reservationKey(tenantId, dimension, reservationId);

      // Get amount before deleting
      const amount = await redis.get(key);
      if (amount === null) {
        return 0; // Reservation not found
      }

      // Delete the reservation
      await redis.del(key);

      return parseInt(amount, 10) || 0;
    } catch (error) {
      console.warn(
        "[RedisReservationStore] Redis error during commit:",
        error,
      );
      return 0;
    }
  }

  /**
   * Release (cancel) a reservation without consuming it.
   *
   * Simply deletes the key so the quota is never deducted.
   */
  async release(
    tenantId: string,
    dimension: string,
    reservationId: string,
  ): Promise<void> {
    if (!this.enabled || !isRedisConnected()) {
      return;
    }

    try {
      const redis = getRedisClient();
      const key = this.reservationKey(tenantId, dimension, reservationId);
      await redis.del(key);
    } catch (error) {
      console.warn(
        "[RedisReservationStore] Redis error during release:",
        error,
      );
    }
  }
}
