import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { EntitlementService } from "../entitlement.service.js";
import { FakeQuotaCounter } from "../ports/fakes/fake-quota-counter.js";
import { FakeReservationStore } from "../ports/fakes/fake-reservation-store.js";
import type { EntitlementProviderPort } from "../ports/entitlement-provider.port.js";
import type { EntitlementSnapshot } from "../../billing/ports/entitlement-snapshot.port.js";
import { AppError } from "../../../common/errors/AppError.js";
import type { EntitlementDimension } from "../entitlement.types.js";
import QuotaOverrideModel from "../../../db/models/quotaOverride.model.js";
import {
  isServiceablePaymentState,
  isServiceableStatus,
} from "../../billing/subscription-status-policy.js";
import type {
  PaymentState,
  SubscriptionStatus,
} from "../../../db/models/subscription.model.js";

// Mock the Redis module so the service's optional RedisReservationStore
// adapter loads without requiring environment variables in the test env.
vi.mock("../../../db/redis.js", () => ({
  getRedisClient: () => null,
  isRedisConnected: () => false,
}));

// ── In-memory Mongo fixture ─────────────────────────────────────────────────
//
// `EntitlementService.getLimit()` consults QuotaOverrideModel when resolving
// limits, so this suite boots a real in-memory MongoDB (mongodb-memory-server,
// same pattern as tenantScopedRepository.memory.test.ts) and seeds override
// documents through the model. The fake provider + fake counter stay in memory.

let mongoServer: MongoMemoryServer | null = null;

beforeAll(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "entitlement-service-test",
    });
  } else {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      instance: {
        launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000),
      },
    });
    await mongoose.connect(mongoServer.getUri(), {
      dbName: "entitlement-service-test",
    });
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

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

  // Subscription state, defaulting to serviceable. Mirrors the real
  // MongoEntitlementProvider: a non-serviceable status or payment state
  // yields no snapshot, so the service fails closed.
  private _subscriptionStatus: SubscriptionStatus = "ACTIVE";
  private _paymentState: PaymentState = "paid";

  setSnapshot(s: EntitlementSnapshot | null): void {
    this.snapshot = s;
  }

  setPeriodStart(d: Date): void {
    this._periodStart = d;
  }

  setSubscriptionStatus(status: SubscriptionStatus): void {
    this._subscriptionStatus = status;
  }

  setPaymentState(state: PaymentState): void {
    this._paymentState = state;
  }

  async getSnapshot(
    _tenantId: string,
  ): Promise<EntitlementSnapshot | null> {
    if (!this.snapshot) {
      return null;
    }
    if (!isServiceableStatus(this._subscriptionStatus)) {
      return null;
    }
    if (!isServiceablePaymentState(this._paymentState)) {
      return null;
    }
    return this.snapshot;
  }

  async getPeriodRange(
    _tenantId: string,
  ): Promise<{ periodStart: Date; periodEnd: Date | null }> {
    return { periodStart: this._periodStart, periodEnd: this._periodEnd };
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

// Tenant ids are ObjectId hex strings (the admin API validates
// /^[0-9a-fA-F]{24}$/) so they cast cleanly when the service queries
// QuotaOverrideModel by tenantId.
const TENANT_A = "507f1f77bcf86cd799439011";
const TENANT_B = "507f1f77bcf86cd799439012";
const DIM_DOCUMENTS: EntitlementDimension = "documents";

// ── Suite ────────────────────────────────────────────────────────────────────

describe("EntitlementService", () => {
  let counter: FakeQuotaCounter;
  let provider: FakeEntitlementProvider;
  let service: EntitlementService;

  beforeEach(async () => {
    await QuotaOverrideModel.deleteMany({});
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

  // ── checkCapability ─────────────────────────────────────────────────────────

  describe("checkCapability", () => {
    it("allows a model that is in the snapshot supportedModels", async () => {
      const result = await service.checkCapability(
        TENANT_A,
        "allowedModels",
        "standard",
      );

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(2);
      expect(result.warning).toBe(false);
    });

    it("denies a model not in supportedModels", async () => {
      const result = await service.checkCapability(
        TENANT_A,
        "allowedModels",
        "premium",
      );

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(2);
    });

    it("denies a non-string model value", async () => {
      const result = await service.checkCapability(
        TENANT_A,
        "allowedModels",
        123,
      );

      expect(result.allowed).toBe(false);
    });

    it("allows retentionDays within the plan limit", async () => {
      const result = await service.checkCapability(
        TENANT_A,
        "retentionDays",
        30,
      );

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(30);
      expect(result.limit).toBe(90);
    });

    it("denies retentionDays over the plan limit", async () => {
      const result = await service.checkCapability(
        TENANT_A,
        "retentionDays",
        91,
      );

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(91);
      expect(result.limit).toBe(90);
    });

    it("throws ENTITLEMENT_UNAVAILABLE when the snapshot is null", async () => {
      provider.setSnapshot(null);

      await expect(
        service.checkCapability(TENANT_A, "allowedModels", "basic"),
      ).rejects.toMatchObject({
        code: "ENTITLEMENT_UNAVAILABLE",
        statusCode: 503,
      });
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

  describe("reservation lifecycle — direct fallback (no reservation store)", () => {
    it("reserve returns a direct reservationId when limit is sufficient", async () => {
      const reservation = await service.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        10,
        300,
      );

      expect(reservation).not.toBeNull();
      expect(reservation!.reservationId).toMatch(/^direct_/);
    });

    it("reserve consumes quota directly when no store is present", async () => {
      const reservation = await service.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        10,
        300,
      );
      expect(reservation).not.toBeNull();

      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      expect(counter.getUsage(TENANT_A, DIM_DOCUMENTS, periodKey)).resolves.toBe(10);
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

    it("release does not throw for direct reservations", async () => {
      await expect(
        service.release(TENANT_A, DIM_DOCUMENTS, "direct_12345"),
      ).resolves.toBeUndefined();
    });
  });

  describe("reservation lifecycle — store-backed (FakeReservationStore)", () => {
    let store: FakeReservationStore;
    let storeService: EntitlementService;

    beforeEach(() => {
      store = new FakeReservationStore();
      storeService = new EntitlementService(counter, provider, store);
    });

    it("reserve atomically claims quota and returns a store reservationId", async () => {
      const reservation = await storeService.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        10,
        300,
      );

      expect(reservation).not.toBeNull();
      expect(reservation!.reservationId).toMatch(/^res_/);

      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      await expect(
        counter.getUsage(TENANT_A, DIM_DOCUMENTS, periodKey),
      ).resolves.toBe(10);
      expect(store._dumpReservations().size).toBe(1);
    });

    it("reserve returns null when limit is exceeded and rolls back the claim", async () => {
      await storeService.consume(TENANT_A, DIM_DOCUMENTS, 100);

      const reservation = await storeService.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        1,
        300,
      );

      expect(reservation).toBeNull();
      // No dangling claim left behind
      expect(store._dumpReservations().size).toBe(0);
    });

    it("commit with the reserved amount keeps the counter unchanged", async () => {
      const reservation = await storeService.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        10,
        300,
      );

      const result = await storeService.commit(
        TENANT_A,
        DIM_DOCUMENTS,
        reservation!.reservationId,
        10,
      );

      expect(result.committed).toBe(true);
      expect(result.current).toBe(10);
      expect(result.remaining).toBe(90);
      // Claim settled
      expect(store._dumpReservations().size).toBe(0);
    });

    it("commit with a smaller real amount refunds the surplus", async () => {
      const reservation = await storeService.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        10,
        300,
      );

      const result = await storeService.commit(
        TENANT_A,
        DIM_DOCUMENTS,
        reservation!.reservationId,
        6,
      );

      expect(result.committed).toBe(true);
      expect(result.current).toBe(6);
      expect(result.remaining).toBe(94);
    });

    it("commit with a larger real amount consumes the shortfall", async () => {
      const reservation = await storeService.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        10,
        300,
      );

      const result = await storeService.commit(
        TENANT_A,
        DIM_DOCUMENTS,
        reservation!.reservationId,
        15,
      );

      expect(result.committed).toBe(true);
      expect(result.current).toBe(15);
      expect(result.remaining).toBe(85);
    });

    it("commit over the limit fails without changing the counter", async () => {
      const reservation = await storeService.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        50,
        300,
      );

      const result = await storeService.commit(
        TENANT_A,
        DIM_DOCUMENTS,
        reservation!.reservationId,
        150,
      );

      expect(result.committed).toBe(false);
      expect(result.current).toBe(50);
      expect(result.remaining).toBe(50);
    });

    it("commit with an unknown reservationId returns current state", async () => {
      await storeService.consume(TENANT_A, DIM_DOCUMENTS, 20);

      const result = await storeService.commit(
        TENANT_A,
        DIM_DOCUMENTS,
        "res_missing_123",
      );

      expect(result.committed).toBe(true);
      expect(result.current).toBe(20);
    });

    it("commit is idempotent on requestId", async () => {
      const reservation = await storeService.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        10,
        300,
      );

      await storeService.commit(
        TENANT_A,
        DIM_DOCUMENTS,
        reservation!.reservationId,
        10,
        "req-res-001",
      );

      const second = await storeService.commit(
        TENANT_A,
        DIM_DOCUMENTS,
        "res_unknown_for_gate",
        10,
        "req-res-001",
      );

      expect(second.committed).toBe(true);
      expect(second.current).toBe(10);
    });

    it("release refunds the reserved amount to the counter", async () => {
      const reservation = await storeService.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        10,
        300,
      );

      await storeService.release(
        TENANT_A,
        DIM_DOCUMENTS,
        reservation!.reservationId,
      );

      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      await expect(
        counter.getUsage(TENANT_A, DIM_DOCUMENTS, periodKey),
      ).resolves.toBe(0);
      expect(store._dumpReservations().size).toBe(0);
    });

    it("release of an unknown reservationId is a no-op", async () => {
      await expect(
        storeService.release(TENANT_A, DIM_DOCUMENTS, "res_missing_123"),
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

  // ── Quota overrides (QuotaOverrideModel) ─────────────────────────────────

  describe("quota overrides (QuotaOverrideModel)", () => {
    const overrideSnapshot: EntitlementSnapshot = {
      employees: 10,
      admins: 2,
      documents: 1000,
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

    it("enabled override wins over the snapshot for check/consume/getEffectiveLimit", async () => {
      provider.setSnapshot(overrideSnapshot);
      await QuotaOverrideModel.create({
        tenantId: new mongoose.Types.ObjectId(TENANT_A),
        dimension: "documents",
        limit: 5,
        enabled: true,
      });

      const limit = await service.getEffectiveLimit(TENANT_A, DIM_DOCUMENTS);
      expect(limit).toBe(5);

      const check = await service.check(TENANT_A, DIM_DOCUMENTS);
      expect(check.limit).toBe(5);
      expect(check.allowed).toBe(true); // current 0 < 5

      // Consuming beyond the override limit is denied (snapshot says 1000).
      const over = await service.consume(TENANT_A, DIM_DOCUMENTS, 6);
      expect(over.committed).toBe(false);
      expect(over.limit).toBe(5);
      expect(over.current).toBe(0);
    });

    it("disabled override falls back to the snapshot value", async () => {
      provider.setSnapshot(overrideSnapshot);
      await QuotaOverrideModel.create({
        tenantId: new mongoose.Types.ObjectId(TENANT_A),
        dimension: "documents",
        limit: 5,
        enabled: false,
      });

      const limit = await service.getEffectiveLimit(TENANT_A, DIM_DOCUMENTS);
      expect(limit).toBe(1000);

      const check = await service.check(TENANT_A, DIM_DOCUMENTS);
      expect(check.limit).toBe(1000);
      expect(check.allowed).toBe(true);
    });

    it("reads the override fresh on every call — no caching", async () => {
      provider.setSnapshot(overrideSnapshot);

      // No override yet → snapshot value.
      expect(await service.getEffectiveLimit(TENANT_A, DIM_DOCUMENTS)).toBe(1000);

      await QuotaOverrideModel.create({
        tenantId: new mongoose.Types.ObjectId(TENANT_A),
        dimension: "documents",
        limit: 5,
        enabled: true,
      });

      // Two consecutive calls reflect the override immediately.
      expect(await service.getEffectiveLimit(TENANT_A, DIM_DOCUMENTS)).toBe(5);
      expect(await service.getEffectiveLimit(TENANT_A, DIM_DOCUMENTS)).toBe(5);
    });

    it("does not consult overrides for dimensions outside the model enum", async () => {
      // "allowedModels" is a legal EntitlementDimension but absent from the
      // QuotaOverride dimension enum — even a raw doc bypassing schema enum
      // validation must never be applied (capability sentinel wins).
      await QuotaOverrideModel.collection.insertOne({
        tenantId: new mongoose.Types.ObjectId(TENANT_A),
        dimension: "allowedModels",
        limit: 1,
        enabled: true,
      });

      const limit = await service.getEffectiveLimit(TENANT_A, "allowedModels");
      expect(limit).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("override applies only to its own tenant", async () => {
      provider.setSnapshot(overrideSnapshot);
      await QuotaOverrideModel.create({
        tenantId: new mongoose.Types.ObjectId(TENANT_A),
        dimension: "documents",
        limit: 5,
        enabled: true,
      });

      // Tenant B has no override → snapshot value.
      expect(await service.getEffectiveLimit(TENANT_B, DIM_DOCUMENTS)).toBe(1000);
      expect(await service.getEffectiveLimit(TENANT_A, DIM_DOCUMENTS)).toBe(5);
    });
  });

  // ── Subscription state change during in-flight reservations ─────────────
  //
  // Defense-in-depth for the reserve → commit race: a subscription that
  // becomes non-serviceable (CANCELED/EXPIRED/refunded/…) while a
  // reservation is held must fail closed — release the held claim and throw
  // ENTITLEMENT_UNAVAILABLE instead of committing/consuming quota for a dead
  // subscription. The fake provider models the real MongoEntitlementProvider,
  // which applies isServiceableStatus + isServiceablePaymentState in
  // getSnapshot and yields no snapshot for non-serviceable subscriptions.

  describe("subscription state change during in-flight reservations", () => {
    let store: FakeReservationStore;
    let storeService: EntitlementService;

    beforeEach(() => {
      store = new FakeReservationStore();
      storeService = new EntitlementService(counter, provider, store);
    });

    it("commit releases the reservation and throws ENTITLEMENT_UNAVAILABLE when the subscription is CANCELED mid-flight", async () => {
      // Hold a reservation while the subscription is active…
      const reservation = await storeService.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        10,
        300,
      );
      expect(reservation).not.toBeNull();
      expect(store._dumpReservations().size).toBe(1);

      // …then the subscription is canceled before the commit settles it.
      provider.setSubscriptionStatus("CANCELED");

      await expect(
        storeService.commit(
          TENANT_A,
          DIM_DOCUMENTS,
          reservation!.reservationId,
          10,
        ),
      ).rejects.toMatchObject({
        code: "ENTITLEMENT_UNAVAILABLE",
        statusCode: 503,
      });

      // The reservation must be released, not left dangling, and nothing was
      // committed: the held amount was refunded to the counter.
      expect(store._dumpReservations().size).toBe(0);
      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      await expect(
        counter.getUsage(TENANT_A, DIM_DOCUMENTS, periodKey),
      ).resolves.toBe(0);
    });

    it("commit succeeds when the subscription is still ACTIVE (no false denial)", async () => {
      const reservation = await storeService.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        10,
        300,
      );
      expect(reservation).not.toBeNull();

      const result = await storeService.commit(
        TENANT_A,
        DIM_DOCUMENTS,
        reservation!.reservationId,
        10,
      );

      expect(result.committed).toBe(true);
      expect(result.current).toBe(10);
      expect(store._dumpReservations().size).toBe(0);
    });

    it("consume throws before incrementing when the subscription EXPIRED mid-flight", async () => {
      await service.consume(TENANT_A, DIM_DOCUMENTS, 5);
      provider.setSubscriptionStatus("EXPIRED");

      await expect(
        service.consume(TENANT_A, DIM_DOCUMENTS, 3),
      ).rejects.toMatchObject({
        code: "ENTITLEMENT_UNAVAILABLE",
        statusCode: 503,
      });

      // Counter unchanged — the increment never ran.
      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      await expect(
        counter.getUsage(TENANT_A, DIM_DOCUMENTS, periodKey),
      ).resolves.toBe(5);
    });

    it("consume throws before incrementing when the payment state becomes refunded", async () => {
      await service.consume(TENANT_A, DIM_DOCUMENTS, 5);
      provider.setPaymentState("refunded");

      await expect(
        service.consume(TENANT_A, DIM_DOCUMENTS, 3),
      ).rejects.toMatchObject({
        code: "ENTITLEMENT_UNAVAILABLE",
        statusCode: 503,
      });

      const now = new Date();
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      await expect(
        counter.getUsage(TENANT_A, DIM_DOCUMENTS, periodKey),
      ).resolves.toBe(5);
    });

    it("missing snapshot path is unchanged — commit and consume still throw ENTITLEMENT_UNAVAILABLE", async () => {
      provider.setSnapshot(null);

      await expect(
        storeService.commit(TENANT_A, DIM_DOCUMENTS, "res_unknown_123", 10),
      ).rejects.toMatchObject({
        code: "ENTITLEMENT_UNAVAILABLE",
        statusCode: 503,
      });

      await expect(
        service.consume(TENANT_A, DIM_DOCUMENTS, 5),
      ).rejects.toMatchObject({
        code: "ENTITLEMENT_UNAVAILABLE",
        statusCode: 503,
      });
    });
  });
});
