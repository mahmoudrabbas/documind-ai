import { describe, it, expect, beforeEach } from "vitest";
import { EntitlementService } from "../entitlement.service.js";
import { FakeQuotaCounter } from "../ports/fakes/fake-quota-counter.js";
import type { EntitlementProviderPort } from "../ports/entitlement-provider.port.js";
import type { EntitlementSnapshot } from "../../billing/ports/entitlement-snapshot.port.js";
import { AppError } from "../../../common/errors/AppError.js";
import type { EntitlementDimension } from "../entitlement.types.js";

// ── Fake EntitlementProviderPort ─────────────────────────────────────────────
//
// In-memory provider that returns a configurable snapshot and period range.
// Tests can call setSnapshot() / setPeriodStart() to simulate overrides and
// period transitions.

class FakeEntitlementProvider implements EntitlementProviderPort {
  private snapshot: EntitlementSnapshot | null = {
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

  private _periodStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );
  private _periodEnd: Date | null = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  setSnapshot(s: EntitlementSnapshot | null): void {
    this.snapshot = s;
  }

  setPeriodStart(d: Date): void {
    this._periodStart = d;
  }

  async getSnapshot(
    _tenantId: string,
  ): Promise<EntitlementSnapshot | null> {
    return this.snapshot;
  }

  async getPeriodRange(
    _tenantId: string,
  ): Promise<{ periodStart: Date; periodEnd: Date | null }> {
    return { periodStart: this._periodStart, periodEnd: this._periodEnd };
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";
const DIM_DOCUMENTS: EntitlementDimension = "documents";
const DIM_QUERIES: EntitlementDimension = "queriesPerMonth";

// ── Suite ────────────────────────────────────────────────────────────────────

describe("EntitlementService", () => {
  let counter: FakeQuotaCounter;
  let provider: FakeEntitlementProvider;
  let service: EntitlementService;

  beforeEach(() => {
    counter = new FakeQuotaCounter();
    provider = new FakeEntitlementProvider();
    service = new EntitlementService(counter, provider);
  });

  // ── check ──────────────────────────────────────────────────────────────────

  describe("check", () => {
    it("returns correct current and limit values from snapshot", async () => {
      const result = await service.check(TENANT_A, DIM_DOCUMENTS);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(100);
      expect(result.warning).toBe(false);
    });

    it("raises warning when current exceeds 80% of limit", async () => {
      // Seed counter to 85 (85% of 100)
      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      counter._seed(TENANT_A, DIM_DOCUMENTS, periodKey, 85);

      const result = await service.check(TENANT_A, DIM_DOCUMENTS);

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(85);
      expect(result.warning).toBe(true);
    });

    it("returns allowed=false when at or above limit", async () => {
      // Seed counter at exactly the limit
      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      counter._seed(TENANT_A, DIM_DOCUMENTS, periodKey, 100);

      const result = await service.check(TENANT_A, DIM_DOCUMENTS);

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(100);
      expect(result.limit).toBe(100);
    });

    it("capability keys return sentinel MAX_SAFE_INTEGER limit", async () => {
      const result = await service.check(TENANT_A, "allowedModels");

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(Number.MAX_SAFE_INTEGER);
      expect(result.current).toBe(0);
    });
  });

  // ── consume ────────────────────────────────────────────────────────────────

  describe("consume", () => {
    it("happy path: consume 5 of 100 returns committed=true, correct current and remaining", async () => {
      const result = await service.consume(TENANT_A, DIM_DOCUMENTS, 5);

      expect(result.committed).toBe(true);
      expect(result.current).toBe(5);
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(95);

      // Verify counter was persisted
      const check = await service.check(TENANT_A, DIM_DOCUMENTS);
      expect(check.current).toBe(5);
    });

    it("exceed limit: consume when at limit returns committed=false and does not increment", async () => {
      // Consume to the limit (100)
      await service.consume(TENANT_A, DIM_DOCUMENTS, 100);

      // Try to exceed
      const result = await service.consume(TENANT_A, DIM_DOCUMENTS, 1);

      expect(result.committed).toBe(false);
      expect(result.current).toBe(100);
      expect(result.remaining).toBe(0);
      expect(result.limit).toBe(100);

      // Counter must not have been incremented
      const check = await service.check(TENANT_A, DIM_DOCUMENTS);
      expect(check.current).toBe(100);
    });

    it("same requestId is idempotent — second call returns same result without increment", async () => {
      const first = await service.consume(TENANT_A, DIM_DOCUMENTS, 3, "req-001");

      expect(first.committed).toBe(true);
      expect(first.current).toBe(3);

      // Second call with same requestId
      const second = await service.consume(
        TENANT_A,
        DIM_DOCUMENTS,
        3,
        "req-001",
      );

      expect(second.committed).toBe(true);
      expect(second.current).toBe(3); // Same, not 6
      expect(second.remaining).toBe(97);

      // Underlying counter must still be 3 (not 6)
      const check = await service.check(TENANT_A, DIM_DOCUMENTS);
      expect(check.current).toBe(3);
    });

    it("different requestIds are not idempotent — each increments", async () => {
      await service.consume(TENANT_A, DIM_DOCUMENTS, 3, "req-001");
      await service.consume(TENANT_A, DIM_DOCUMENTS, 5, "req-002");

      const check = await service.check(TENANT_A, DIM_DOCUMENTS);
      expect(check.current).toBe(8);
    });

    it("capability keys always succeed consumption", async () => {
      const result = await service.consume(
        TENANT_A,
        "allowedModels",
        999999,
      );

      expect(result.committed).toBe(true);
      expect(result.limit).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  // ── Reservation lifecycle ─────────────────────────────────────────────────

  describe("reservation lifecycle", () => {
    it("reserve returns reservationId when limit is sufficient", async () => {
      const reservation = await service.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        10,
        300,
      );

      expect(reservation).not.toBeNull();
      expect(reservation!.reservationId).toMatch(/^direct_/);
    });

    it("reserve returns null when limit is exceeded", async () => {
      // Fill the limit
      await service.consume(TENANT_A, DIM_DOCUMENTS, 100);

      // Reserve 1 more — should fail
      const reservation = await service.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        1,
        300,
      );

      expect(reservation).toBeNull();
    });

    it("commit returns current state (no-op for direct consumption)", async () => {
      await service.consume(TENANT_A, DIM_DOCUMENTS, 20);

      const result = await service.commit(
        TENANT_A,
        DIM_DOCUMENTS,
        "direct_12345",
      );

      expect(result.committed).toBe(true);
      expect(result.current).toBe(20);
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(80);
    });

    it("release does not throw (no-op implementation)", async () => {
      // Should not throw regardless of state
      await expect(
        service.release(TENANT_A, DIM_DOCUMENTS, "direct_12345"),
      ).resolves.toBeUndefined();
    });
  });

  // ── Period management ────────────────────────────────────────────────────

  describe("period management", () => {
    it("period auto-reset: different periodStart yields fresh counter", async () => {
      // Consume in January period
      provider.setPeriodStart(new Date(2026, 0, 1)); // January
      await service.consume(TENANT_A, DIM_DOCUMENTS, 50);

      // Check usage in January
      const janCheck = await service.check(TENANT_A, DIM_DOCUMENTS);
      expect(janCheck.current).toBe(50);

      // Move to February period
      provider.setPeriodStart(new Date(2026, 1, 1)); // February

      // Check in February — should be fresh (counter doesn't exist for Feb key)
      const febCheck = await service.check(TENANT_A, DIM_DOCUMENTS);
      expect(febCheck.current).toBe(0);

      // Consume in February
      const febConsume = await service.consume(
        TENANT_A,
        DIM_DOCUMENTS,
        10,
      );
      expect(febConsume.current).toBe(10);

      // January counter must be untouched
      provider.setPeriodStart(new Date(2026, 0, 1));
      const janAgain = await service.check(TENANT_A, DIM_DOCUMENTS);
      expect(janAgain.current).toBe(50);
    });
  });

  // ── Error handling ───────────────────────────────────────────────────────

  describe("error handling", () => {
    it("snapshot null throws ENTITLEMENT_UNAVAILABLE", async () => {
      provider.setSnapshot(null);

      await expect(
        service.consume(TENANT_A, DIM_DOCUMENTS, 5),
      ).rejects.toThrow(AppError);

      await expect(
        service.consume(TENANT_A, DIM_DOCUMENTS, 5),
      ).rejects.toMatchObject({
        code: "ENTITLEMENT_UNAVAILABLE",
        statusCode: 503,
      });
    });

    it("check throws ENTITLEMENT_UNAVAILABLE when snapshot is null", async () => {
      provider.setSnapshot(null);

      await expect(
        service.check(TENANT_A, DIM_DOCUMENTS),
      ).rejects.toMatchObject({
        code: "ENTITLEMENT_UNAVAILABLE",
      });
    });

    it("getEffectiveLimit throws ENTITLEMENT_UNAVAILABLE when snapshot is null", async () => {
      provider.setSnapshot(null);

      await expect(
        service.getEffectiveLimit(TENANT_A, DIM_DOCUMENTS),
      ).rejects.toMatchObject({
        code: "ENTITLEMENT_UNAVAILABLE",
      });
    });
  });

  // ── Usage & metadata ─────────────────────────────────────────────────────

  describe("usage and metadata", () => {
    it("getUsage returns all dimensions with correct values", async () => {
      const periodKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
      counter._seed(TENANT_A, "documents", periodKey, 30);
      counter._seed(TENANT_A, "queriesPerMonth", periodKey, 500);
      counter._seed(TENANT_A, "storageMb", periodKey, 200);

      const usage = await service.getUsage(TENANT_A);

      expect(usage.documents).toBe(30);
      expect(usage.queriesPerMonth).toBe(500);
      expect(usage.storageMb).toBe(200);
    });

    it("getEffectiveLimit returns correct limit from snapshot", async () => {
      const limit = await service.getEffectiveLimit(
        TENANT_A,
        DIM_DOCUMENTS,
      );

      expect(limit).toBe(100);
    });

    it("getEffectiveLimit respects overrides (changed snapshot)", async () => {
      // First check the default limit
      const before = await service.getEffectiveLimit(
        TENANT_A,
        DIM_DOCUMENTS,
      );
      expect(before).toBe(100);

      // Override by changing the snapshot
      provider.setSnapshot({
        employees: 10,
        admins: 2,
        documents: 500, // ← increased from 100
        storageMb: 1024,
        fileSizeMb: 50,
        queriesPerMonth: 1000,
        tokensPerMonth: 100000,
        ocrPagesPerMonth: 500,
        supportedModels: ["basic", "standard"],
        analyticsLevel: "basic",
        retentionDays: 90,
        supportLevel: "community",
      });

      const after = await service.getEffectiveLimit(
        TENANT_A,
        DIM_DOCUMENTS,
      );
      expect(after).toBe(500);
    });

    it("getPeriodStart returns ISO date string", async () => {
      const result = await service.getPeriodStart(TENANT_A);

      expect(typeof result).toBe("string");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("getPeriodReset returns ISO date string", async () => {
      const result = await service.getPeriodReset(TENANT_A);

      expect(typeof result).toBe("string");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("getEntitlementSnapshot returns current snapshot", async () => {
      const snapshot = await service.getEntitlementSnapshot(TENANT_A);

      expect(snapshot).not.toBeNull();
      expect(snapshot!.documents).toBe(100);
      expect(snapshot!.queriesPerMonth).toBe(1000);
      expect(snapshot!.supportedModels).toEqual(["basic", "standard"]);
    });

    it("getEntitlementSnapshot returns null when no snapshot", async () => {
      provider.setSnapshot(null);

      const snapshot = await service.getEntitlementSnapshot(TENANT_A);

      expect(snapshot).toBeNull();
    });
  });

  // ── Override (effective limit increases) ─────────────────────────────────

  describe("override", () => {
    it("increased effective limit allows consumption where it previously failed", async () => {
      // Fill up to the limit of 100
      await service.consume(TENANT_A, DIM_DOCUMENTS, 100);

      // Try to consume 1 more — should fail
      const failResult = await service.consume(
        TENANT_A,
        DIM_DOCUMENTS,
        1,
      );
      expect(failResult.committed).toBe(false);

      // Override: increase the limit to 200
      provider.setSnapshot({
        employees: 10,
        admins: 2,
        documents: 200, // ← override doubles the limit
        storageMb: 1024,
        fileSizeMb: 50,
        queriesPerMonth: 1000,
        tokensPerMonth: 100000,
        ocrPagesPerMonth: 500,
        supportedModels: ["basic", "standard"],
        analyticsLevel: "basic",
        retentionDays: 90,
        supportLevel: "community",
      });

      // Now consumption should succeed (100 current < 200 limit, with room)
      const successResult = await service.consume(
        TENANT_A,
        DIM_DOCUMENTS,
        50,
      );
      expect(successResult.committed).toBe(true);
      expect(successResult.current).toBe(150);
      expect(successResult.limit).toBe(200);
      expect(successResult.remaining).toBe(50);
    });
  });

  // ── Tenant isolation ─────────────────────────────────────────────────────

  describe("tenant isolation", () => {
    it("consumption for one tenant does not affect another", async () => {
      await service.consume(TENANT_A, DIM_DOCUMENTS, 30);
      await service.consume(TENANT_B, DIM_DOCUMENTS, 10);

      const a = await service.check(TENANT_A, DIM_DOCUMENTS);
      const b = await service.check(TENANT_B, DIM_DOCUMENTS);

      expect(a.current).toBe(30);
      expect(b.current).toBe(10);
    });
  });

  // ── Concurrency ──────────────────────────────────────────────────────────

  describe("concurrency", () => {
    it("20 parallel consume calls with limit of 5 — exactly 5 succeed, 15 fail", async () => {
      provider.setSnapshot({
        employees: 10,
        admins: 2,
        documents: 5,
        storageMb: 1024,
        fileSizeMb: 50,
        queriesPerMonth: 1000,
        tokensPerMonth: 100000,
        ocrPagesPerMonth: 500,
        supportedModels: ["basic", "standard"],
        analyticsLevel: "basic",
        retentionDays: 90,
        supportLevel: "community",
      });

      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          service.consume(TENANT_A, DIM_DOCUMENTS, 1),
        ),
      );

      const committed = results.filter((r) => r.committed === true).length;
      expect(committed).toBe(5);

      const failed = results.filter((r) => r.committed === false).length;
      expect(failed).toBe(15);

      const check = await service.check(TENANT_A, DIM_DOCUMENTS);
      expect(check.current).toBe(5);
    });
  });
});
