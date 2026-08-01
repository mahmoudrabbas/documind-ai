import { describe, it, expect, beforeEach } from "vitest";
import { FakeReservationStore } from "../fake-reservation-store.js";
import type { EntitlementDimension } from "../../../entitlement.types.js";

// ── Constants ────────────────────────────────────────────────────────────────

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";
const DIM_DOCUMENTS: EntitlementDimension = "documents";
const DIM_QUERIES: EntitlementDimension = "queriesPerMonth";

// ── Suite ────────────────────────────────────────────────────────────────────

describe("FakeReservationStore — ReservationStorePort contract", () => {
  let store: FakeReservationStore;

  beforeEach(() => {
    store = new FakeReservationStore();
  });

  // ── reserve ─────────────────────────────────────────────────────────────

  describe("reserve", () => {
    it("creates a claim and returns a reservationId", async () => {
      const reservation = await store.reserve(TENANT_A, DIM_DOCUMENTS, 5, 60);

      expect(reservation).not.toBeNull();
      expect(reservation!.reservationId).toMatch(/^res_/);
      expect(store._dumpReservations().size).toBe(1);
    });

    it("creates independent claims per call", async () => {
      const first = await store.reserve(TENANT_A, DIM_DOCUMENTS, 5, 60);
      const second = await store.reserve(TENANT_A, DIM_DOCUMENTS, 3, 60);

      expect(first!.reservationId).not.toBe(second!.reservationId);
      expect(store._dumpReservations().size).toBe(2);
    });
  });

  // ── commit ──────────────────────────────────────────────────────────────

  describe("commit", () => {
    it("returns the reserved amount and removes the claim", async () => {
      const reservation = await store.reserve(TENANT_A, DIM_DOCUMENTS, 5, 60);

      const amount = await store.commit(
        TENANT_A,
        DIM_DOCUMENTS,
        reservation!.reservationId,
      );

      expect(amount).toBe(5);
      expect(store._dumpReservations().size).toBe(0);
    });

    it("returns 0 for an unknown reservationId", async () => {
      const amount = await store.commit(TENANT_A, DIM_DOCUMENTS, "res_missing");

      expect(amount).toBe(0);
    });

    it("returns 0 when tenant does not match the claim", async () => {
      const reservation = await store.reserve(TENANT_A, DIM_DOCUMENTS, 5, 60);

      const amount = await store.commit(
        TENANT_B,
        DIM_DOCUMENTS,
        reservation!.reservationId,
      );

      expect(amount).toBe(0);
      // Claim preserved for the original tenant
      expect(store._dumpReservations().size).toBe(1);
    });

    it("is idempotent — second commit returns 0", async () => {
      const reservation = await store.reserve(TENANT_A, DIM_DOCUMENTS, 5, 60);

      await store.commit(TENANT_A, DIM_DOCUMENTS, reservation!.reservationId);
      const second = await store.commit(
        TENANT_A,
        DIM_DOCUMENTS,
        reservation!.reservationId,
      );

      expect(second).toBe(0);
    });
  });

  // ── release ─────────────────────────────────────────────────────────────

  describe("release", () => {
    it("returns the reserved amount and removes the claim", async () => {
      const reservation = await store.reserve(TENANT_A, DIM_QUERIES, 10, 60);

      const amount = await store.release(
        TENANT_A,
        DIM_QUERIES,
        reservation!.reservationId,
      );

      expect(amount).toBe(10);
      expect(store._dumpReservations().size).toBe(0);
    });

    it("returns 0 for an unknown reservationId", async () => {
      const amount = await store.release(TENANT_A, DIM_QUERIES, "res_missing");

      expect(amount).toBe(0);
    });

    it("returns 0 when dimension does not match the claim", async () => {
      const reservation = await store.reserve(TENANT_A, DIM_QUERIES, 10, 60);

      const amount = await store.release(
        TENANT_A,
        DIM_DOCUMENTS,
        reservation!.reservationId,
      );

      expect(amount).toBe(0);
      expect(store._dumpReservations().size).toBe(1);
    });
  });
});
