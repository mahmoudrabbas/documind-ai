import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  getLimitsController,
  getUsageController,
} from "../entitlement.controller.js";
import { getEntitlementService } from "../entitlement.service.js";
import type { EntitlementService } from "../entitlement.service.js";
import SubscriptionModel, {
  type PaymentState,
  type SubscriptionStatus,
} from "../../../db/models/subscription.model.js";
import MessageModel from "../../../db/models/message.model.js";
import { AppError } from "../../../common/errors/AppError.js";
import { SUBSCRIPTION_INACTIVE } from "../../../common/errors/errorCodes.js";
import type { EntitlementSnapshot } from "../../billing/ports/entitlement-snapshot.port.js";

// The controllers call the entitlement service singleton; the provider-level
// behavior behind it is covered by mongo-entitlement-provider.test.ts, so here
// the service is stubbed and the controller's own null-snapshot cause
// distinction (SubscriptionModel.findOne) runs against a real in-memory Mongo.

vi.mock("../entitlement.service.js", () => ({
  getEntitlementService: vi.fn(),
}));

// ── In-memory Mongo fixture ─────────────────────────────────────────────────

let mongoServer: MongoMemoryServer | null = null;

beforeAll(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "entitlement-controller-test",
    });
  } else {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      instance: {
        launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000),
      },
    });
    await mongoose.connect(mongoServer.getUri(), {
      dbName: "entitlement-controller-test",
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

async function createSubscription(
  tenantId: string,
  status: SubscriptionStatus,
  paymentState: PaymentState = "paid",
) {
  await SubscriptionModel.create({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    packageId: new mongoose.Types.ObjectId(),
    packageVersion: 1,
    status,
    startedAt: new Date(),
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2027-01-01T00:00:00.000Z"),
    billingInterval: "monthly",
    provider: "test",
    paymentState,
  });
}

const SNAPSHOT: EntitlementSnapshot = {
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

/** Stub the entitlement service with a deterministic snapshot result. */
function stubService(snapshot: EntitlementSnapshot | null) {
  vi.mocked(getEntitlementService).mockReturnValue({
    getUsage: vi.fn().mockResolvedValue({ documents: 3 }),
    getEntitlementSnapshot: vi.fn().mockResolvedValue(snapshot),
    getPeriodStart: vi.fn().mockResolvedValue("2026-01-01T00:00:00.000Z"),
    getPeriodReset: vi.fn().mockResolvedValue("2026-02-01T00:00:00.000Z"),
  } as unknown as EntitlementService);
}

// ── Request harness ─────────────────────────────────────────────────────────

function createHarness(tenantId: string) {
  const req = { tenantId } as Request;
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status, json, headersSent: false } as unknown as Response;
  const next = vi.fn();
  return {
    req,
    res,
    next: next as unknown as NextFunction,
    nextMock: next,
    json,
    status,
  };
}

// ── Suite ───────────────────────────────────────────────────────────────────

describe("entitlement read controllers — null-snapshot cause distinction", () => {
  beforeEach(async () => {
    await SubscriptionModel.deleteMany({});
    await MessageModel.deleteMany({});
  });

  describe("existing subscription with non-serviceable status", () => {
    it("GET /entitlement/limits → 403 SUBSCRIPTION_INACTIVE with status/paymentState details", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      await createSubscription(tenantId, "CANCELED", "paid");
      stubService(null);
      const { req, res, next, nextMock } = createHarness(tenantId);

      await getLimitsController(req, res, next);

      expect(nextMock).toHaveBeenCalledTimes(1);
      const error = nextMock.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(SUBSCRIPTION_INACTIVE);
      expect(error.message).toBe("Your subscription is inactive");
      expect(error.details).toEqual({ status: "CANCELED", paymentState: "paid" });
    });

    it("GET /entitlement/usage → 403 SUBSCRIPTION_INACTIVE too", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      await createSubscription(tenantId, "EXPIRED", "failed");
      stubService(null);
      const { req, res, next, nextMock } = createHarness(tenantId);

      await getUsageController(req, res, next);

      expect(nextMock).toHaveBeenCalledTimes(1);
      const error = nextMock.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(SUBSCRIPTION_INACTIVE);
      expect(error.details).toEqual({ status: "EXPIRED", paymentState: "failed" });
    });
  });

  describe("existing subscription with refunded payment state", () => {
    it("GET /entitlement/limits → 403 SUBSCRIPTION_INACTIVE even when status is serviceable", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      await createSubscription(tenantId, "ACTIVE", "refunded");
      stubService(null);
      const { req, res, next, nextMock } = createHarness(tenantId);

      await getLimitsController(req, res, next);

      expect(nextMock).toHaveBeenCalledTimes(1);
      const error = nextMock.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe(SUBSCRIPTION_INACTIVE);
      expect(error.details).toEqual({ status: "ACTIVE", paymentState: "refunded" });
    });
  });

  describe("usage response shape", () => {
    it("GET /entitlement/usage → counts tenant-owned user messages as questions", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      const otherTenantId = new mongoose.Types.ObjectId().toString();
      await MessageModel.create([
        {
          tenantId,
          conversationId: new mongoose.Types.ObjectId(),
          role: "user",
          content: "Question one",
          sequenceNumber: 0,
        },
        {
          tenantId,
          conversationId: new mongoose.Types.ObjectId(),
          role: "user",
          content: "Question two",
          sequenceNumber: 0,
        },
        {
          tenantId,
          conversationId: new mongoose.Types.ObjectId(),
          role: "assistant",
          content: "Answer",
          sequenceNumber: 1,
        },
        {
          tenantId: otherTenantId,
          conversationId: new mongoose.Types.ObjectId(),
          role: "user",
          content: "Other tenant question",
          sequenceNumber: 0,
        },
      ]);
      stubService(SNAPSHOT);
      const { req, res, next, json } = createHarness(tenantId);

      await getUsageController(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          actual: expect.objectContaining({ questions: 2 }),
        }),
      });
    });

    it("GET /entitlement/usage → returns plan limits even when no counter rows exist", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      stubService({
        employees: 5,
        admins: 2,
        documents: 100,
        storageMb: 1024,
        fileSizeMb: 25,
        queriesPerMonth: 1000,
        tokensPerMonth: 10000,
        ocrPagesPerMonth: 50,
        supportedModels: [],
        analyticsLevel: "basic",
        retentionDays: 30,
        supportLevel: "community",
      });
      const { req, res, next, json } = createHarness(tenantId);

      await getUsageController(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          limit: expect.objectContaining({ documents: 100, storageMb: 1024, queriesPerMonth: 1000 }),
          actual: { documents: 0, storageBytes: 0, questions: 0 },
        }),
      });
    });

    it("GET /entitlement/limits → 200 with empty snapshot (existing behavior)", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      stubService(null);
      const { req, res, next, json, status } = createHarness(tenantId);

      await getLimitsController(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ success: true, data: {} });
    });

    it("GET /entitlement/usage → 200 with empty limit map (existing behavior)", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      stubService(null);
      const { req, res, next, json, status } = createHarness(tenantId);

      await getUsageController(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({
        success: true,
        data: {
        current: { documents: 0 },
        limit: {},
        actual: { documents: 0, storageBytes: 0, questions: 0 },
        periodStart: "2026-01-01T00:00:00.000Z",
          periodEnd: "2026-02-01T00:00:00.000Z",
        },
      });
    });
  });

  describe("serviceable subscription but snapshot unavailable (e.g. missing package)", () => {
    it("GET /entitlement/limits → 200 empty, NOT 403 (cause is not the subscription)", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      await createSubscription(tenantId, "ACTIVE", "paid");
      stubService(null);
      const { req, res, next, json, status } = createHarness(tenantId);

      await getLimitsController(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ success: true, data: {} });
    });
  });

  describe("snapshot present", () => {
    it("GET /entitlement/limits → 200 with the snapshot (passthrough unchanged)", async () => {
      const tenantId = new mongoose.Types.ObjectId().toString();
      await createSubscription(tenantId, "ACTIVE", "paid");
      stubService(SNAPSHOT);
      const { req, res, next, json, status } = createHarness(tenantId);

      await getLimitsController(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ success: true, data: SNAPSHOT });
    });
  });
});
