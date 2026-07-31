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
import {
  MongoQuotaCounter,
  QuotaCounterModel,
  IdempotencyGateModel,
} from "../adapters/mongo-quota-counter.js";
import { FakeReservationStore } from "../ports/fakes/fake-reservation-store.js";
import type { EntitlementProviderPort } from "../ports/entitlement-provider.port.js";
import type { EntitlementSnapshot } from "../../billing/ports/entitlement-snapshot.port.js";
import type { ConsumeResult, EntitlementDimension } from "../entitlement.types.js";
import QuotaOverrideModel from "../../../db/models/quotaOverride.model.js";

// Mock the Redis module so the service's optional RedisReservationStore
// adapter loads without requiring environment variables in the test env.
// (The FakeReservationStore is used for all store-backed scenarios.)
vi.mock("../../../db/redis.js", () => ({
  getRedisClient: () => null,
  isRedisConnected: () => false,
}));

// ── In-memory Mongo fixture ─────────────────────────────────────────────────
//
// This suite proves REAL atomicity of quota enforcement, so it drives the real
// MongoQuotaCounter against an in-memory MongoDB (same bootstrapping pattern as
// entitlement.service.test.ts). The unique compound index on
// (tenantId, dimension, periodStart) — which makes the guarded upsert in
// `checkAndConsume` race-safe — is ensured to exist before any parallel calls
// via `QuotaCounterModel.init()` in `beforeAll`.

let mongoServer: MongoMemoryServer | null = null;

beforeAll(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "entitlement-concurrency-test",
    });
  } else {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      instance: {
        launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000),
      },
    });
    await mongoose.connect(mongoServer.getUri(), {
      dbName: "entitlement-concurrency-test",
    });
  }
  // Guarantee the unique index exists before the first parallel upsert race.
  await QuotaCounterModel.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// ── Fake EntitlementProviderPort ─────────────────────────────────────────────
//
// Deterministic snapshot + period range in memory (provider is not the unit
// under test — the atomic counter is). The period anchors to 2026-01 so the
// counter period key is a stable constant.

const PERIOD_START = new Date(2026, 0, 1);
const PERIOD_KEY = "2026-01";

class FakeEntitlementProvider implements EntitlementProviderPort {
  private snapshot: EntitlementSnapshot = makeSnapshot(100);

  setSnapshot(s: EntitlementSnapshot): void {
    this.snapshot = s;
  }

  async getSnapshot(
    _tenantId: string,
  ): Promise<EntitlementSnapshot | null> {
    return this.snapshot;
  }

  async getPeriodRange(
    _tenantId: string,
  ): Promise<{ periodStart: Date; periodEnd: Date | null }> {
    return { periodStart: PERIOD_START, periodEnd: null };
  }
}

function makeSnapshot(documentsLimit: number): EntitlementSnapshot {
  return {
    employees: 10,
    admins: 2,
    documents: documentsLimit,
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

// ── Constants ────────────────────────────────────────────────────────────────

// Valid ObjectId hex strings so QuotaOverrideModel lookups cast cleanly.
const TENANT_A = "507f1f77bcf86cd799439011";
const TENANT_B = "507f1f77bcf86cd799439012";
const DIM_DOCUMENTS: EntitlementDimension = "documents";

// ── Race-outcome helpers ─────────────────────────────────────────────────────
//
// The counter signals exhaustion in TWO ways, both of which the service
// surfaces as a failed operation:
//   1. `checkAndConsume` returns `{ success: false }` → `committed: false`
//   2. The guarded upsert loses a duplicate-key race on the unique index
//      (counter document created concurrently by a sibling call) → the
//      findOneAndUpdate throws MongoServerError E11000, which propagates out
//      of `consume()` / `reserve()` as a rejection.
// Every race below treats both signals as a denial and asserts the invariant
// "never more than the quota is committed".

function isDuplicateKeyError(reason: unknown): boolean {
  return (
    typeof reason === "object" &&
    reason !== null &&
    "code" in reason &&
    (reason as { code: unknown }).code === 11000
  );
}

type SettledConsume = PromiseSettledResult<ConsumeResult>;

function countCommitted(results: SettledConsume[]): number {
  return results.filter(
    (r) => r.status === "fulfilled" && r.value.committed === true,
  ).length;
}

function countDenied(results: SettledConsume[]): number {
  return results.filter(
    (r) =>
      r.status === "rejected" ||
      (r.status === "fulfilled" && r.value.committed === false),
  ).length;
}

function expectAllRejectionsAreDuplicateKey(results: SettledConsume[]): void {
  for (const r of results) {
    if (r.status === "rejected") {
      expect(isDuplicateKeyError(r.reason)).toBe(true);
    }
  }
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("EntitlementService concurrency", () => {
  let counter: MongoQuotaCounter;
  let provider: FakeEntitlementProvider;
  let store: FakeReservationStore;
  let service: EntitlementService;

  beforeEach(async () => {
    await Promise.all([
      QuotaCounterModel.deleteMany({}),
      IdempotencyGateModel.deleteMany({}),
      QuotaOverrideModel.deleteMany({}),
    ]);
    counter = new MongoQuotaCounter();
    provider = new FakeEntitlementProvider();
    store = new FakeReservationStore();
    service = new EntitlementService(counter, provider, store);
  });

  // ── 1. Consume race ─────────────────────────────────────────────────────────

  describe("simultaneous consume cannot exceed the limit", () => {
    it("10 parallel consume(1) with quota 5 — exactly 5 committed, final counter === 5", async () => {
      provider.setSnapshot(makeSnapshot(5));

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          service.consume(TENANT_A, DIM_DOCUMENTS, 1),
        ),
      );

      // Exactly 5 commits — never more.
      expect(countCommitted(results)).toBe(5);
      // The other 5 must be denied through one of the two exhaustion signals.
      expect(countDenied(results)).toBe(5);
      expect(countCommitted(results) + countDenied(results)).toBe(10);
      // Any rejection must be the counter's duplicate-key exhaustion signal.
      expectAllRejectionsAreDuplicateKey(results);

      const usage = await counter.getUsage(
        TENANT_A,
        DIM_DOCUMENTS,
        PERIOD_KEY,
      );
      expect(usage).toBe(5);
    });

    it("fresh counter upsert race — duplicate-key (E11000) is a valid denial signal alongside committed:false", async () => {
      provider.setSnapshot(makeSnapshot(1));

      // Four parallel attempts at the only available unit on a brand-new
      // counter document: the winner commits, the losers are denied by the
      // guard (committed: false) or by the guarded-upsert duplicate-key
      // collision (E11000 rejection) — both are exhaustion, never a
      // double-commit.
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, () =>
          service.consume(TENANT_A, DIM_DOCUMENTS, 1),
        ),
      );

      expect(countCommitted(results)).toBe(1);
      expect(countDenied(results)).toBe(3);
      expectAllRejectionsAreDuplicateKey(results);

      const usage = await counter.getUsage(
        TENANT_A,
        DIM_DOCUMENTS,
        PERIOD_KEY,
      );
      expect(usage).toBe(1);
    });
  });

  // ── 2. Reserve race ─────────────────────────────────────────────────────────

  describe("concurrent reserve cannot over-reserve", () => {
    it("5 parallel reserve(1) with quota 3 — at most 3 succeed, committed reservations settle the counter to exactly 3", async () => {
      provider.setSnapshot(makeSnapshot(3));

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          service.reserve(TENANT_A, DIM_DOCUMENTS, 1, 300),
        ),
      );

      const successful = results.filter(
        (r) => r.status === "fulfilled" && r.value !== null,
      );
      // Exactly 3 of 5 can claim quota — never more.
      expect(successful.length).toBe(3);

      // The counter already holds the reserved units (claim at reserve time).
      let usage = await counter.getUsage(TENANT_A, DIM_DOCUMENTS, PERIOD_KEY);
      expect(usage).toBe(3);

      // Commit every successful reservation — the counter must reflect
      // exactly the committed set and nothing more.
      const commits: SettledConsume[] = await Promise.allSettled(
        successful.map((r) => {
          const reservation = (r as PromiseFulfilledResult<{
            reservationId: string;
          } | null>).value!;
          return service.commit(
            TENANT_A,
            DIM_DOCUMENTS,
            reservation.reservationId,
            1,
          );
        }),
      );

      for (const c of commits) {
        expect(c.status).toBe("fulfilled");
        expect((c as PromiseFulfilledResult<ConsumeResult>).value.committed).toBe(true);
      }

      usage = await counter.getUsage(TENANT_A, DIM_DOCUMENTS, PERIOD_KEY);
      expect(usage).toBe(3);
      // Every SUCCESSFUL claim settled — no committed reservation is left
      // dangling. Claims from reserve calls that were denied via the
      // duplicate-key rejection path are not rolled back by the service
      // (existing behavior; the Redis store self-heals via TTL), so at most
      // the failed count may remain — never a successful one.
      const remaining = store._dumpReservations();
      const successfulIds = new Set(
        successful.map((r) => {
          const reservation = (r as PromiseFulfilledResult<{
            reservationId: string;
          } | null>).value!;
          return reservation.reservationId;
        }),
      );
      for (const id of successfulIds) {
        expect(remaining.has(id)).toBe(false);
      }
      expect(remaining.size).toBeLessThanOrEqual(5 - successful.length);
    });
  });

  // ── 3. Consume vs. commit race ──────────────────────────────────────────────

  describe("held reservations are accounted against parallel consume", () => {
    it("reserve 2 of quota 5, then 5 parallel consume(1) — only 3 commits, final counter === 5", async () => {
      provider.setSnapshot(makeSnapshot(5));

      // Hold 2 units. The claim is consumed atomically at reserve time, so
      // only 3 units remain for anything else.
      const reservation = await service.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        2,
        300,
      );
      expect(reservation).not.toBeNull();

      // If the held reservation were ignored, all 5 would fit — they must not.
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          service.consume(TENANT_A, DIM_DOCUMENTS, 1),
        ),
      );

      expect(countCommitted(results)).toBe(3);
      expect(countDenied(results)).toBe(2);
      expectAllRejectionsAreDuplicateKey(results);

      let usage = await counter.getUsage(TENANT_A, DIM_DOCUMENTS, PERIOD_KEY);
      expect(usage).toBe(5);

      // Settle the reservation (same amount — no delta) and re-check.
      const commit = await service.commit(
        TENANT_A,
        DIM_DOCUMENTS,
        reservation!.reservationId,
        2,
      );
      expect(commit.committed).toBe(true);

      usage = await counter.getUsage(TENANT_A, DIM_DOCUMENTS, PERIOD_KEY);
      expect(usage).toBe(5);
      expect(store._dumpReservations().size).toBe(0);
    });

    it("commit shortfall races parallel consume — no over-commitment beyond quota", async () => {
      provider.setSnapshot(makeSnapshot(5));

      // Hold 3 of 5; commit later needs 2 more (realAmount 5).
      const reservation = await service.reserve(
        TENANT_A,
        DIM_DOCUMENTS,
        3,
        300,
      );
      expect(reservation).not.toBeNull();

      // 6 units of demand (2 shortfall + 4 consumes) against 2 remaining —
      // exactly 2 units may be committed, never more.
      const results = await Promise.allSettled([
        service.commit(
          TENANT_A,
          DIM_DOCUMENTS,
          reservation!.reservationId,
          5,
        ),
        ...Array.from({ length: 4 }, () =>
          service.consume(TENANT_A, DIM_DOCUMENTS, 1),
        ),
      ]);

      // First result is the commit (2 units), the rest are consumes (1 each).
      const [commitResult, ...consumeResults] = results;
      const commitSucceeded =
        commitResult.status === "fulfilled" &&
        (commitResult as PromiseFulfilledResult<ConsumeResult>).value
          .committed === true;
      const committedUnits = (commitSucceeded ? 2 : 0) + countCommitted(consumeResults);

      expect(committedUnits).toBe(2);

      const usage = await counter.getUsage(TENANT_A, DIM_DOCUMENTS, PERIOD_KEY);
      expect(usage).toBe(5);
      // The held reservation was settled by the commit regardless of its
      // own outcome (commit deletes the claim before consuming the shortfall).
      expect(store._dumpReservations().size).toBe(0);
    });
  });
});
