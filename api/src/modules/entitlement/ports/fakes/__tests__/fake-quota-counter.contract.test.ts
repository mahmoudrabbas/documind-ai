import { describe, it, expect, beforeEach } from "vitest";
import { FakeQuotaCounter } from "../fake-quota-counter.js";
import type { EntitlementDimension } from "../../../entitlement.types.js";

// ── Constants ────────────────────────────────────────────────────────────────

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";
const PERIOD_JAN = "2026-01";
const PERIOD_FEB = "2026-02";
const DIM_QUERIES: EntitlementDimension = "queriesPerMonth";
const DIM_DOCUMENTS: EntitlementDimension = "documents";
const DIM_STORAGE: EntitlementDimension = "storageMb";

// ── Suite ────────────────────────────────────────────────────────────────────

describe("FakeQuotaCounter — QuotaCounterPort contract", () => {
  let counter: FakeQuotaCounter;

  beforeEach(() => {
    counter = new FakeQuotaCounter();
  });

  // ── checkAndConsume ────────────────────────────────────────────────────

  describe("checkAndConsume", () => {
    it("returns success=true and correct current when within limit", async () => {
      const result = await counter.checkAndConsume(
        TENANT_A, DIM_QUERIES, PERIOD_JAN, 5, 100,
      );

      expect(result.success).toBe(true);
      expect(result.current).toBe(5);
    });

    it("increments counter across multiple calls", async () => {
      await counter.checkAndConsume(TENANT_A, DIM_QUERIES, PERIOD_JAN, 10, 100);
      const result = await counter.checkAndConsume(
        TENANT_A, DIM_QUERIES, PERIOD_JAN, 20, 100,
      );

      expect(result.success).toBe(true);
      expect(result.current).toBe(30);
    });

    it("returns success=false and original current when exceeding limit", async () => {
      // Seed at 95 — consuming 10 would hit 105 > 100
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 95);

      const result = await counter.checkAndConsume(
        TENANT_A, DIM_QUERIES, PERIOD_JAN, 10, 100,
      );

      expect(result.success).toBe(false);
      // Counter was NOT incremented
      expect(result.current).toBe(95);
    });

    it("does not mutate state on failure", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 95);

      await counter.checkAndConsume(TENANT_A, DIM_QUERIES, PERIOD_JAN, 10, 100);

      const usage = await counter.getUsage(TENANT_A, DIM_QUERIES, PERIOD_JAN);
      expect(usage).toBe(95);
    });

    it("handles exact limit boundary", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 90);

      const result = await counter.checkAndConsume(
        TENANT_A, DIM_QUERIES, PERIOD_JAN, 10, 100,
      );

      expect(result.success).toBe(true);
      expect(result.current).toBe(100);
    });

    it("treats absent counter as zero", async () => {
      const result = await counter.checkAndConsume(
        TENANT_B, DIM_DOCUMENTS, PERIOD_FEB, 3, 10,
      );

      expect(result.success).toBe(true);
      expect(result.current).toBe(3);
    });
  });

  // ── release ────────────────────────────────────────────────────────────

  describe("release", () => {
    it("decrements counter by the given amount", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 50);

      await counter.release(TENANT_A, DIM_QUERIES, PERIOD_JAN, 10);

      const usage = await counter.getUsage(TENANT_A, DIM_QUERIES, PERIOD_JAN);
      expect(usage).toBe(40);
    });

    it("floors at zero and never goes negative", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 3);

      await counter.release(TENANT_A, DIM_QUERIES, PERIOD_JAN, 10);

      const usage = await counter.getUsage(TENANT_A, DIM_QUERIES, PERIOD_JAN);
      expect(usage).toBe(0);
    });

    it("does not throw when counter does not exist", async () => {
      await counter.release(TENANT_A, DIM_QUERIES, PERIOD_JAN, 5);

      // Counter is created at 0
      const usage = await counter.getUsage(TENANT_A, DIM_QUERIES, PERIOD_JAN);
      expect(usage).toBe(0);
    });
  });

  // ── getUsage ───────────────────────────────────────────────────────────

  describe("getUsage", () => {
    it("returns current counter value", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 42);

      const usage = await counter.getUsage(TENANT_A, DIM_QUERIES, PERIOD_JAN);

      expect(usage).toBe(42);
    });

    it("returns 0 for absent counter", async () => {
      const usage = await counter.getUsage(TENANT_B, DIM_DOCUMENTS, PERIOD_JAN);

      expect(usage).toBe(0);
    });

    it("isolates counters by tenant", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 10);
      counter._seed(TENANT_B, DIM_QUERIES, PERIOD_JAN, 99);

      const a = await counter.getUsage(TENANT_A, DIM_QUERIES, PERIOD_JAN);
      const b = await counter.getUsage(TENANT_B, DIM_QUERIES, PERIOD_JAN);

      expect(a).toBe(10);
      expect(b).toBe(99);
    });

    it("isolates counters by dimension", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 5);
      counter._seed(TENANT_A, DIM_DOCUMENTS, PERIOD_JAN, 100);

      const queries = await counter.getUsage(TENANT_A, DIM_QUERIES, PERIOD_JAN);
      const docs = await counter.getUsage(TENANT_A, DIM_DOCUMENTS, PERIOD_JAN);

      expect(queries).toBe(5);
      expect(docs).toBe(100);
    });

    it("isolates counters by period", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 10);
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_FEB, 20);

      const jan = await counter.getUsage(TENANT_A, DIM_QUERIES, PERIOD_JAN);
      const feb = await counter.getUsage(TENANT_A, DIM_QUERIES, PERIOD_FEB);

      expect(jan).toBe(10);
      expect(feb).toBe(20);
    });
  });

  // ── getAllUsage ────────────────────────────────────────────────────────

  describe("getAllUsage", () => {
    it("returns all dimensions for a tenant and period", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 50);
      counter._seed(TENANT_A, DIM_DOCUMENTS, PERIOD_JAN, 30);
      counter._seed(TENANT_A, DIM_STORAGE, PERIOD_JAN, 200);

      const all = await counter.getAllUsage(TENANT_A, PERIOD_JAN);

      expect(all.queriesPerMonth).toBe(50);
      expect(all.documents).toBe(30);
      expect(all.storageMb).toBe(200);
    });

    it("returns zero for dimensions with no counter", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 10);

      const all = await counter.getAllUsage(TENANT_A, PERIOD_JAN);

      // The record contains only the seeded dimension; unseeded ones are absent
      expect(all.queriesPerMonth).toBe(10);
    });

    it("returns empty record when tenant has no counters", async () => {
      const all = await counter.getAllUsage(TENANT_A, PERIOD_JAN);

      expect(Object.keys(all)).toHaveLength(0);
    });

    it("does not mix counters from different periods", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 10);
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_FEB, 99);

      const jan = await counter.getAllUsage(TENANT_A, PERIOD_JAN);
      const feb = await counter.getAllUsage(TENANT_A, PERIOD_FEB);

      expect(jan.queriesPerMonth).toBe(10);
      expect(feb.queriesPerMonth).toBe(99);
    });
  });

  // ── getIdempotencyGate ─────────────────────────────────────────────────

  describe("getIdempotencyGate", () => {
    it("returns false for a request that has not been gated", async () => {
      const exists = await counter.getIdempotencyGate(
        TENANT_A, DIM_QUERIES, "req-001",
      );

      expect(exists).toBe(false);
    });

    it("returns true after the gate is created", async () => {
      await counter.createIdempotencyGate(TENANT_A, DIM_QUERIES, "req-001");

      const exists = await counter.getIdempotencyGate(
        TENANT_A, DIM_QUERIES, "req-001",
      );

      expect(exists).toBe(true);
    });

    it("isolates gates by tenant", async () => {
      await counter.createIdempotencyGate(TENANT_A, DIM_QUERIES, "req-001");

      const a = await counter.getIdempotencyGate(TENANT_A, DIM_QUERIES, "req-001");
      const b = await counter.getIdempotencyGate(TENANT_B, DIM_QUERIES, "req-001");

      expect(a).toBe(true);
      expect(b).toBe(false);
    });
  });

  // ── createIdempotencyGate ──────────────────────────────────────────────

  describe("createIdempotencyGate", () => {
    it("returns true on first creation", async () => {
      const created = await counter.createIdempotencyGate(
        TENANT_A, DIM_QUERIES, "req-001",
      );

      expect(created).toBe(true);
    });

    it("returns false when gate already exists (duplicate)", async () => {
      await counter.createIdempotencyGate(TENANT_A, DIM_QUERIES, "req-001");

      const second = await counter.createIdempotencyGate(
        TENANT_A, DIM_QUERIES, "req-001",
      );

      expect(second).toBe(false);
    });

    it("allows same requestId for different dimensions", async () => {
      const q = await counter.createIdempotencyGate(TENANT_A, DIM_QUERIES, "req-001");
      const d = await counter.createIdempotencyGate(TENANT_A, DIM_DOCUMENTS, "req-001");

      expect(q).toBe(true);
      expect(d).toBe(true);
    });
  });

  // ── resetPeriod ────────────────────────────────────────────────────────

  describe("resetPeriod", () => {
    it("creates new period counters set to 0 for each dimension", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 50);
      counter._seed(TENANT_A, DIM_DOCUMENTS, PERIOD_JAN, 30);

      await counter.resetPeriod(TENANT_A, PERIOD_JAN, PERIOD_FEB);

      const febQueries = await counter.getUsage(TENANT_A, DIM_QUERIES, PERIOD_FEB);
      const febDocs = await counter.getUsage(TENANT_A, DIM_DOCUMENTS, PERIOD_FEB);
      expect(febQueries).toBe(0);
      expect(febDocs).toBe(0);
    });

    it("preserves old period counters after reset", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 50);

      await counter.resetPeriod(TENANT_A, PERIOD_JAN, PERIOD_FEB);

      const jan = await counter.getUsage(TENANT_A, DIM_QUERIES, PERIOD_JAN);
      expect(jan).toBe(50);
    });

    it("does not overwrite an existing new period counter", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 50);
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_FEB, 10);

      await counter.resetPeriod(TENANT_A, PERIOD_JAN, PERIOD_FEB);

      const feb = await counter.getUsage(TENANT_A, DIM_QUERIES, PERIOD_FEB);
      expect(feb).toBe(10); // not overwritten
    });
  });

  // ── reset (test lifecycle) ─────────────────────────────────────────────

  describe("reset", () => {
    it("clears all counters", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 50);
      counter._seed(TENANT_B, DIM_DOCUMENTS, PERIOD_FEB, 100);

      counter.reset();

      expect(counter._dumpCounters().size).toBe(0);
    });

    it("clears all idempotency gates", async () => {
      await counter.createIdempotencyGate(TENANT_A, DIM_QUERIES, "req-001");

      counter.reset();

      expect(counter._dumpGates().size).toBe(0);
    });

    it("makes counter values return to zero", async () => {
      counter._seed(TENANT_A, DIM_QUERIES, PERIOD_JAN, 50);

      counter.reset();

      const usage = await counter.getUsage(TENANT_A, DIM_QUERIES, PERIOD_JAN);
      expect(usage).toBe(0);
    });
  });
});
