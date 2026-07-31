import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoEntitlementProvider } from "../adapters/mongo-entitlement-provider.js";
import SubscriptionModel, {
  type PaymentState,
  type SubscriptionStatus,
} from "../../../db/models/subscription.model.js";
import PackageModel from "../../../db/models/package.model.js";

// ── In-memory Mongo fixture ─────────────────────────────────────────────────
//
// The provider reads SubscriptionModel + PackageModel directly, so this suite
// boots a real in-memory MongoDB (same pattern as entitlement.service.test.ts
// / tenantScopedRepository.memory.test.ts) and seeds documents through the
// models. The binary is cached — the entitlement suite runs in ~2.6s.

let mongoServer: MongoMemoryServer | null = null;

beforeAll(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "entitlement-provider-test",
    });
  } else {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      instance: {
        launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000),
      },
    });
    await mongoose.connect(mongoServer.getUri(), {
      dbName: "entitlement-provider-test",
    });
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// ── Seeding helpers ─────────────────────────────────────────────────────────

const ENTITLEMENTS = {
  employees: 10,
  admins: 2,
  documents: 100,
  storageMb: 1024,
  fileSizeMb: 50,
  queriesPerMonth: 1000,
  tokensPerMonth: 100000,
  ocrPagesPerMonth: 500,
};

/** Create a version-1 package (unique code per call). */
async function createPackage(overrides: Partial<Record<string, unknown>> = {}) {
  const code = `test-pkg-${new mongoose.Types.ObjectId().toString()}`;
  return PackageModel.create({
    name: "Test Package",
    code,
    description: "Entitlement provider test package",
    active: true,
    version: 1,
    monthlyPrice: 0,
    annualPrice: 0,
    currency: "USD",
    entitlements: { ...ENTITLEMENTS },
    trialDays: 0,
    visibility: "public",
    supportedModels: ["basic", "standard"],
    analyticsLevel: "basic",
    retentionDays: 90,
    supportLevel: "community",
    stripeProductId: "",
    stripePriceId: "",
    stripeAnnualPriceId: "",
    versions: [
      {
        _id: new mongoose.Types.ObjectId(),
        version: 1,
        name: "Test Package v1",
        code: `${code}-v1`,
        description: "Version 1",
        monthlyPrice: 0,
        annualPrice: 0,
        currency: "USD",
        entitlements: { ...ENTITLEMENTS },
        trialDays: 0,
        visibility: "public",
        supportedModels: ["basic", "standard"],
        analyticsLevel: "basic",
        retentionDays: 90,
        supportLevel: "community",
        stripeProductId: "",
        stripePriceId: "",
        stripeAnnualPriceId: "",
        createdAt: new Date(),
      },
    ],
    ...overrides,
  });
}

async function createSubscription(
  tenantId: string,
  status: SubscriptionStatus,
  packageId: mongoose.Types.ObjectId,
  packageVersion = 1,
  paymentState: PaymentState = "paid",
) {
  await SubscriptionModel.create({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    packageId,
    packageVersion,
    status,
    startedAt: new Date(),
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2027-01-01T00:00:00.000Z"),
    billingInterval: "monthly",
    provider: "test",
    paymentState,
  });
}

// ── Suite ───────────────────────────────────────────────────────────────────

describe("MongoEntitlementProvider", () => {
  let provider: MongoEntitlementProvider;

  beforeEach(async () => {
    await SubscriptionModel.deleteMany({});
    await PackageModel.deleteMany({});
    provider = new MongoEntitlementProvider();
  });

  describe("serviceable subscription statuses", () => {
    const SERVICEABLE_STATUSES: SubscriptionStatus[] = [
      "ACTIVE",
      "TRIALING",
      "CANCEL_AT_PERIOD_END",
      "PAST_DUE",
    ];

    describe.each(SERVICEABLE_STATUSES)("status %s", (status) => {
      it("returns the package entitlement snapshot", async () => {
        const tenantId = new mongoose.Types.ObjectId().toString();
        const pkg = await createPackage();
        await createSubscription(tenantId, status, pkg._id);

        const snapshot = await provider.getSnapshot(tenantId);

        expect(snapshot).not.toBeNull();
        expect(snapshot?.documents).toBe(100);
        expect(snapshot?.employees).toBe(10);
      });

      it("returns the subscription period range", async () => {
        const tenantId = new mongoose.Types.ObjectId().toString();
        const pkg = await createPackage();
        await createSubscription(tenantId, status, pkg._id);

        const range = await provider.getPeriodRange(tenantId);

        expect(range.periodStart).toEqual(new Date("2026-01-01T00:00:00.000Z"));
        expect(range.periodEnd).toEqual(new Date("2027-01-01T00:00:00.000Z"));
      });
    });
  });

  describe("non-serviceable subscription statuses", () => {
    const NON_SERVICEABLE_STATUSES: SubscriptionStatus[] = [
      "CANCELED",
      "EXPIRED",
      "UNPAID",
      "INCOMPLETE",
      "PAUSED",
    ];

    describe.each(NON_SERVICEABLE_STATUSES)("status %s", (status) => {
      it("returns null from getSnapshot (fail closed)", async () => {
        const tenantId = new mongoose.Types.ObjectId().toString();
        const pkg = await createPackage();
        await createSubscription(tenantId, status, pkg._id);

        const snapshot = await provider.getSnapshot(tenantId);

        expect(snapshot).toBeNull();
      });

      it("returns the no-subscription period shape from getPeriodRange", async () => {
        const tenantId = new mongoose.Types.ObjectId().toString();
        const pkg = await createPackage();
        await createSubscription(tenantId, status, pkg._id);

        const range = await provider.getPeriodRange(tenantId);

        expect(range.periodStart).toBeInstanceOf(Date);
        expect(range.periodEnd).toBeNull();
      });
    });
  });

  describe("inactive package", () => {
    it("returns null from getSnapshot when pkg.active === false", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      const pkg = await createPackage({ active: false });
      await createSubscription(tenantId, "ACTIVE", pkg._id);

      const snapshot = await provider.getSnapshot(tenantId);

      expect(snapshot).toBeNull();
    });
  });

  describe("refunded payment state", () => {
    it("returns null from getSnapshot when paymentState is refunded (fail closed)", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      const pkg = await createPackage();
      await createSubscription(tenantId, "ACTIVE", pkg._id, 1, "refunded");

      const snapshot = await provider.getSnapshot(tenantId);

      expect(snapshot).toBeNull();
    });

    it("returns the snapshot when paymentState is paid", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      const pkg = await createPackage();
      await createSubscription(tenantId, "ACTIVE", pkg._id, 1, "paid");

      const snapshot = await provider.getSnapshot(tenantId);

      expect(snapshot).not.toBeNull();
      expect(snapshot?.documents).toBe(100);
      expect(snapshot?.employees).toBe(10);
    });
  });

  describe("unchanged fail-closed behavior", () => {
    it("returns null when no subscription exists", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();

      const snapshot = await provider.getSnapshot(tenantId);

      expect(snapshot).toBeNull();
    });

    it("returns null when the package is missing", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      await createSubscription(
        tenantId,
        "ACTIVE",
        new mongoose.Types.ObjectId(),
      );

      const snapshot = await provider.getSnapshot(tenantId);

      expect(snapshot).toBeNull();
    });

    it("returns null when the subscribed package version is missing", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      const pkg = await createPackage();
      await createSubscription(tenantId, "ACTIVE", pkg._id, 99);

      const snapshot = await provider.getSnapshot(tenantId);

      expect(snapshot).toBeNull();
    });
  });
});
