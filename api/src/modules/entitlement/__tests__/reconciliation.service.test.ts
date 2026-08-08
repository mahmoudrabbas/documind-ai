import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { ReconciliationService } from "../reconciliation.service.js";
import { FakeQuotaCounter } from "../ports/fakes/fake-quota-counter.js";
import type { EntitlementProviderPort } from "../ports/entitlement-provider.port.js";
import type { EntitlementSnapshot } from "../../billing/ports/entitlement-snapshot.port.js";
import { SERVICEABLE_STATUSES } from "../../billing/subscription-status-policy.js";
import type { SubscriptionStatus } from "../../../db/models/subscription.model.js";

// ═══════════════════════════════════════════════════════════════════════════
// Hoisted mock functions — vi.mock factories are hoisted to the top of the
// file, so variables they capture must also be hoisted via vi.hoisted().
// ═══════════════════════════════════════════════════════════════════════════

const mockUserCount = vi.hoisted(() => vi.fn());
const mockDocCount = vi.hoisted(() => vi.fn());
const mockDocAggregate = vi.hoisted(() => vi.fn());
const mockUsageCount = vi.hoisted(() => vi.fn());
const mockOcrCount = vi.hoisted(() => vi.fn());
const mockDistinct = vi.hoisted(() => vi.fn());
const mockDistinctExec = vi.hoisted(() => vi.fn());
const mockCreateReport = vi.hoisted(() => vi.fn());

// Mock every model module the reconciliation service imports so no real
// Mongo connection is required. Modules are keyed by their resolved id, so
// the specifier only needs to resolve to the same file as the service's
// import.
vi.mock("../../../db/models/user.model.js", () => ({
  default: { countDocuments: mockUserCount },
}));
vi.mock("../../../db/models/document.model.js", () => ({
  default: { countDocuments: mockDocCount, aggregate: mockDocAggregate },
}));
vi.mock("../../../db/models/usageLog.model.js", () => ({
  default: { countDocuments: mockUsageCount },
}));
vi.mock("../../../db/models/ocrUsageRecord.model.js", () => ({
  default: { countDocuments: mockOcrCount },
}));
vi.mock("../../../db/models/subscription.model.js", () => ({
  default: { distinct: mockDistinct },
}));
vi.mock("../../../db/models/entitlementReconciliationReport.model.js", () => ({
  default: { create: mockCreateReport },
}));

// ═══════════════════════════════════════════════════════════════════════════
// Fakes
// ═══════════════════════════════════════════════════════════════════════════

class FakeEntitlementProvider implements EntitlementProviderPort {
  async getSnapshot(_tenantId: string): Promise<EntitlementSnapshot | null> {
    return null;
  }

  async getPeriodRange(
    _tenantId: string,
  ): Promise<{ periodStart: Date; periodEnd: Date | null }> {
    return {
      periodStart: new Date(2026, 0, 1),
      periodEnd: new Date(2026, 1, 1),
    };
  }
}

const PERIOD_START = "2026-01";
const TENANT_A = "507f1f77bcf86cd799439011";
const TENANT_B = "507f1f77bcf86cd799439012";
const TENANT_CANCELED = "507f1f77bcf86cd799439013";

// Authoritative values produced by the mocked data sources.
const AUTHORITATIVE = {
  employees: 7,
  admins: 2,
  documents: 3,
  storageMb: 2,
  queriesPerMonth: 50,
  ocrPagesPerMonth: 10,
};

function seedCounters(
  counter: FakeQuotaCounter,
  tenantId: string,
  values: Partial<Record<keyof typeof AUTHORITATIVE, number>>,
): void {
  for (const [dimension, value] of Object.entries(values)) {
    counter._seed(tenantId, dimension as keyof typeof AUTHORITATIVE, PERIOD_START, value ?? 0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Suite
// ═══════════════════════════════════════════════════════════════════════════

describe("ReconciliationService", () => {
  let counter: FakeQuotaCounter;
  let provider: FakeEntitlementProvider;
  let service: ReconciliationService;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    counter = new FakeQuotaCounter();
    provider = new FakeEntitlementProvider();
    service = new ReconciliationService(counter, provider);

    mockUserCount.mockImplementation((filter: { role?: string }) =>
      Promise.resolve(filter?.role === "EMPLOYEE" ? AUTHORITATIVE.employees : AUTHORITATIVE.admins),
    );
    mockDocCount.mockResolvedValue(AUTHORITATIVE.documents);
    mockDocAggregate.mockResolvedValue([
      { totalBytes: AUTHORITATIVE.storageMb * 1024 * 1024 },
    ]);
    mockUsageCount.mockResolvedValue(AUTHORITATIVE.queriesPerMonth);
    mockOcrCount.mockResolvedValue(AUTHORITATIVE.ocrPagesPerMonth);
    mockDistinct.mockReturnValue({ exec: mockDistinctExec });
    mockDistinctExec.mockResolvedValue([]);
    mockCreateReport.mockResolvedValue({});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe("reconcile — dry-run", () => {
    it("reports discrepancies without mutating counters and persists a report", async () => {
      seedCounters(counter, TENANT_A, {
        employees: 5,
        admins: 2,
        documents: 1,
        storageMb: 1,
        queriesPerMonth: 40,
        ocrPagesPerMonth: 10,
      });

      const report = await service.reconcile(TENANT_A, "dry-run");

      expect(report.mode).toBe("dry-run");
      expect(report.totalDiscrepancies).toBe(4);
      expect(report.totalFixed).toBe(0);

      const documents = report.results.find((r) => r.dimension === "documents");
      expect(documents).toMatchObject({
        authoritative: 3,
        current: 1,
        discrepancy: 2,
        fixed: false,
      });
      const admins = report.results.find((r) => r.dimension === "admins");
      expect(admins).toMatchObject({
        authoritative: 2,
        current: 2,
        discrepancy: 0,
        fixed: false,
      });

      const counters = counter._dumpCounters();
      expect(counters.get(`${TENANT_A}:employees:${PERIOD_START}`)).toBe(5);
      expect(counters.get(`${TENANT_A}:documents:${PERIOD_START}`)).toBe(1);
      expect(counters.get(`${TENANT_A}:queriesPerMonth:${PERIOD_START}`)).toBe(40);

      expect(mockCreateReport).toHaveBeenCalledTimes(1);
      expect(mockCreateReport).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: new Types.ObjectId(TENANT_A),
          mode: "dry-run",
          periodStart: PERIOD_START,
          totalDiscrepancies: 4,
          totalFixed: 0,
        }),
      );
    });

    it("excludes auto-OCR usage records from the authoritative count", async () => {
      seedCounters(counter, TENANT_A, {
        employees: 5,
        admins: 2,
        documents: 1,
        storageMb: 1,
        queriesPerMonth: 40,
        ocrPagesPerMonth: 10,
      });

      await service.reconcile(TENANT_A, "dry-run");

      // Auto-OCR (source: "auto") is billed separately from the paid OCR
      // entitlement, so the authoritative filter must exclude those records.
      expect(mockOcrCount).toHaveBeenCalledTimes(1);
      const [ocrFilter] = mockOcrCount.mock.calls[0] as unknown as [
        Record<string, unknown>,
      ];
      expect(ocrFilter).toEqual(
        expect.objectContaining({
          tenantId: new Types.ObjectId(TENANT_A),
          $or: [
            { source: { $ne: "auto" } },
            { source: { $exists: false } },
          ],
        }),
      );
      expect(ocrFilter.$or).not.toContain({ source: "auto" });
    });
  });

  describe("reconcile — execute", () => {
    it("fixes discrepant counters to the authoritative values", async () => {
      seedCounters(counter, TENANT_A, {
        employees: 5,
        admins: 2,
        documents: 1,
        storageMb: 1,
        queriesPerMonth: 40,
        ocrPagesPerMonth: 10,
      });

      const report = await service.reconcile(TENANT_A, "execute");

      expect(report.mode).toBe("execute");
      expect(report.totalDiscrepancies).toBe(4);
      expect(report.totalFixed).toBe(4);
      expect(report.results.find((r) => r.dimension === "employees")?.fixed).toBe(true);

      const counters = counter._dumpCounters();
      expect(counters.get(`${TENANT_A}:employees:${PERIOD_START}`)).toBe(7);
      expect(counters.get(`${TENANT_A}:documents:${PERIOD_START}`)).toBe(3);
      expect(counters.get(`${TENANT_A}:storageMb:${PERIOD_START}`)).toBe(2);
      expect(counters.get(`${TENANT_A}:queriesPerMonth:${PERIOD_START}`)).toBe(50);
      // Non-discrepant dimensions are left untouched.
      expect(counters.get(`${TENANT_A}:admins:${PERIOD_START}`)).toBe(2);
      expect(counters.get(`${TENANT_A}:ocrPagesPerMonth:${PERIOD_START}`)).toBe(10);

      expect(mockCreateReport).toHaveBeenCalledTimes(1);
    });

    it("tolerates a report persistence failure without failing the run", async () => {
      seedCounters(counter, TENANT_A, {
        employees: 5,
        admins: 2,
        documents: 3,
        storageMb: 2,
        queriesPerMonth: 50,
        ocrPagesPerMonth: 10,
      });
      mockCreateReport.mockRejectedValueOnce(new Error("db down"));

      const report = await service.reconcile(TENANT_A, "execute");

      expect(report.tenantId).toBe(TENANT_A);
      expect(report.totalFixed).toBe(1);
      expect(counter._dumpCounters().get(`${TENANT_A}:employees:${PERIOD_START}`)).toBe(7);
    });
  });

  describe("reconcileAll", () => {
    it("aggregates reports across all tenants", async () => {
      mockDistinctExec.mockResolvedValue([
        new Types.ObjectId(TENANT_A),
        new Types.ObjectId(TENANT_B),
      ]);
      seedCounters(counter, TENANT_A, {
        employees: 5,
        admins: 2,
        documents: 1,
        storageMb: 1,
        queriesPerMonth: 40,
        ocrPagesPerMonth: 10,
      });
      seedCounters(counter, TENANT_B, {
        employees: 7,
        admins: 2,
        documents: 3,
        storageMb: 2,
        queriesPerMonth: 50,
        ocrPagesPerMonth: 10,
      });

      const run = await service.reconcileAll("dry-run");

      expect(run.mode).toBe("dry-run");
      expect(run.totalTenants).toBe(2);
      expect(run.reports).toHaveLength(2);
      expect(run.reports[0].tenantId).toBe(TENANT_A);
      expect(run.reports[1].tenantId).toBe(TENANT_B);
      expect(run.totalDiscrepancies).toBe(4);
      expect(run.totalFixed).toBe(0);

      // Per-tenant reports are persisted by reconcile(); nothing extra.
      expect(mockCreateReport).toHaveBeenCalledTimes(2);
      expect(mockDistinct).toHaveBeenCalledWith("tenantId", {
        status: { $in: [...SERVICEABLE_STATUSES] },
      });

      // Dry-run sweep must not mutate any counters.
      const counters = counter._dumpCounters();
      expect(counters.get(`${TENANT_A}:employees:${PERIOD_START}`)).toBe(5);
      expect(counters.get(`${TENANT_B}:employees:${PERIOD_START}`)).toBe(7);
    });

    it("returns an empty aggregate when there are no tenants", async () => {
      mockDistinctExec.mockResolvedValue([]);

      const run = await service.reconcileAll("dry-run");

      expect(run.totalTenants).toBe(0);
      expect(run.reports).toEqual([]);
      expect(run.totalDiscrepancies).toBe(0);
      expect(run.totalFixed).toBe(0);
      expect(mockCreateReport).not.toHaveBeenCalled();
      expect(mockUserCount).not.toHaveBeenCalled();
    });
  });

  describe("reconcileAll — serviceable-status scoping (in-memory Mongo)", () => {
    let mongo: MongoMemoryServer;
    // The real model is fetched via vi.importActual to bypass the vi.mock
    // factory above, so reconcileAll() queries a REAL Subscription collection.
    let realSubscriptionModel: typeof import("../../../db/models/subscription.model.js").default;

    const PACKAGE_ID = new Types.ObjectId("507f1f77bcf86cd799439099");

    beforeAll(async () => {
      mongo = await MongoMemoryServer.create({
        binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
        instance: { launchTimeout: 60_000 },
      });
      await mongoose.connect(mongo.getUri());
      realSubscriptionModel = (
        await vi.importActual<typeof import("../../../db/models/subscription.model.js")>(
          "../../../db/models/subscription.model.js",
        )
      ).default;
    });

    afterAll(async () => {
      await mongoose.disconnect();
      await mongo.stop();
    });

    beforeEach(async () => {
      await realSubscriptionModel.deleteMany({});
      // Delegate the mocked SubscriptionModel.distinct to the real model so
      // the query runs against the in-memory Subscription collection (real
      // docs, real status filtering semantics).
      mockDistinct.mockImplementation(
        (field: string, filter?: { status?: { $in?: SubscriptionStatus[] } }) => {
          const query = realSubscriptionModel.distinct(field, filter);
          return { exec: () => query.exec() };
        },
      );
    });

    async function seedSubscription(
      tenantId: string,
      status: SubscriptionStatus,
    ): Promise<void> {
      await realSubscriptionModel.create({
        tenantId: new Types.ObjectId(tenantId),
        packageId: PACKAGE_ID,
        packageVersion: 1,
        status,
      });
    }

    it("excludes tenants whose only subscription is CANCELED from the run", async () => {
      await seedSubscription(TENANT_A, "ACTIVE");
      await seedSubscription(TENANT_CANCELED, "CANCELED");

      const run = await service.reconcileAll("dry-run");

      expect(run.totalTenants).toBe(1);
      expect(run.reports).toHaveLength(1);
      expect(run.reports[0].tenantId).toBe(TENANT_A);
      expect(run.reports.map((report) => report.tenantId)).not.toContain(
        TENANT_CANCELED,
      );
    });

    it("returns an empty aggregate when only CANCELED subscriptions exist", async () => {
      await seedSubscription(TENANT_CANCELED, "CANCELED");

      const run = await service.reconcileAll("dry-run");

      expect(run.totalTenants).toBe(0);
      expect(run.reports).toEqual([]);
      expect(run.totalDiscrepancies).toBe(0);
      expect(run.totalFixed).toBe(0);
      expect(mockCreateReport).not.toHaveBeenCalled();
    });
  });
});
