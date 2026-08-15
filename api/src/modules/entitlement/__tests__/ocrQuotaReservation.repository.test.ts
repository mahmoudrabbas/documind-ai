import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import OcrQuotaReservationModel from "../../../db/models/ocrQuotaReservation.model.js";
import { QuotaCounterModel } from "../adapters/mongo-quota-counter.js";
import {
  commitOcrQuotaReservation,
  releaseExpiredOcrReservations,
  releaseOcrQuotaReservation,
  reserveOcrQuota,
} from "../ocrQuotaReservation.repository.js";

const TENANT_ID = "507f1f77bcf86cd799439011";
const PERIOD_KEY = "2026-08";

let mongoServer: MongoMemoryReplSet | null = null;

beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({
    binary: {
      version: process.env.MONGOMS_VERSION ?? "7.0.14",
    },
    replSet: {
      count: 1,
    },
  });

  await mongoose.connect(mongoServer.getUri(), {
    dbName: "ocr-quota-reservation-test",
  });

  await Promise.all([
    QuotaCounterModel.init(),
    OcrQuotaReservationModel.init(),
  ]);
}, 60_000);

beforeEach(async () => {
  await Promise.all([
    QuotaCounterModel.deleteMany({}),
    OcrQuotaReservationModel.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe("ocrQuotaReservation repository", () => {
  it("atomically reserves OCR pages and creates a durable reservation", async () => {
    const result = await reserveOcrQuota({
      tenantId: TENANT_ID,
      requestId: "ocr-request-1",
      periodStart: PERIOD_KEY,
      amount: 3,
      limit: 10,
      ttlSeconds: 300,
    });

    expect(result).not.toBeNull();
    expect(result?.reservedAmount).toBe(3);
    expect(result?.reservationId).toMatch(/^oqr_/);

    const [counter, reservation] = await Promise.all([
      QuotaCounterModel.findOne({
        tenantId: TENANT_ID,
        dimension: "ocrPagesPerMonth",
        periodStart: PERIOD_KEY,
      })
        .lean()
        .exec(),

      OcrQuotaReservationModel.findOne({
        tenantId: TENANT_ID,
        requestId: "ocr-request-1",
      })
        .lean()
        .exec(),
    ]);

    expect(counter?.value).toBe(3);

    expect(reservation).toMatchObject({
      requestId: "ocr-request-1",
      dimension: "ocrPagesPerMonth",
      periodStart: PERIOD_KEY,
      reservedAmount: 3,
      actualAmount: null,
      status: "active",
      settledAt: null,
    });
  });

  it("keeps parallel fresh-counter OCR reservations within the monthly limit", async () => {
    const tenantId = new mongoose.Types.ObjectId().toString();

    const attempts = await Promise.allSettled([
      reserveOcrQuota({
        tenantId,
        requestId: "ocr-parallel-1",
        periodStart: PERIOD_KEY,
        amount: 7,
        limit: 10,
        ttlSeconds: 300,
      }),

      reserveOcrQuota({
        tenantId,
        requestId: "ocr-parallel-2",
        periodStart: PERIOD_KEY,
        amount: 7,
        limit: 10,
        ttlSeconds: 300,
      }),
    ]);

    const fulfilled = attempts.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof reserveOcrQuota>>
      > => result.status === "fulfilled",
    );

    expect(fulfilled).toHaveLength(2);

    const successfulReservations = fulfilled
      .map((result) => result.value)
      .filter((value) => value !== null);

    expect(successfulReservations).toHaveLength(1);

    const counter = await QuotaCounterModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      dimension: "ocrPagesPerMonth",
      periodStart: PERIOD_KEY,
    }).lean();

    expect(counter?.value).toBe(7);

    const activeReservations =
      await OcrQuotaReservationModel.countDocuments({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        status: "active",
      });

    expect(activeReservations).toBe(1);
  });

  it("denies reservation when requested pages exceed remaining OCR quota", async () => {
    await QuotaCounterModel.create({
      tenantId: TENANT_ID,
      dimension: "ocrPagesPerMonth",
      periodStart: PERIOD_KEY,
      value: 8,
    });

    const result = await reserveOcrQuota({
      tenantId: TENANT_ID,
      requestId: "ocr-denied",
      periodStart: PERIOD_KEY,
      amount: 3,
      limit: 10,
      ttlSeconds: 300,
    });

    expect(result).toBeNull();

    const [counter, reservationCount] = await Promise.all([
      QuotaCounterModel.findOne({
        tenantId: TENANT_ID,
        dimension: "ocrPagesPerMonth",
        periodStart: PERIOD_KEY,
      })
        .lean()
        .exec(),

      OcrQuotaReservationModel.countDocuments({}),
    ]);

    expect(counter?.value).toBe(8);
    expect(reservationCount).toBe(0);
  });

  it("commits actual OCR usage and refunds unused reserved pages", async () => {
    const reservation = await reserveOcrQuota({
      tenantId: TENANT_ID,
      requestId: "ocr-commit",
      periodStart: PERIOD_KEY,
      amount: 5,
      limit: 10,
      ttlSeconds: 300,
    });

    expect(reservation).not.toBeNull();

    const committed = await commitOcrQuotaReservation({
      tenantId: TENANT_ID,
      reservationId: reservation!.reservationId,
      actualAmount: 2,
    });

    expect(committed).toBe(true);

    const [counter, stored] = await Promise.all([
      QuotaCounterModel.findOne({
        tenantId: TENANT_ID,
        dimension: "ocrPagesPerMonth",
        periodStart: PERIOD_KEY,
      })
        .lean()
        .exec(),

      OcrQuotaReservationModel.findOne({
        reservationId: reservation!.reservationId,
      })
        .lean()
        .exec(),
    ]);

    expect(counter?.value).toBe(2);
    expect(stored?.status).toBe("committed");
    expect(stored?.actualAmount).toBe(2);
    expect(stored?.settledAt).toBeInstanceOf(Date);
  });

  it("release refunds the complete OCR reservation", async () => {
    const reservation = await reserveOcrQuota({
      tenantId: TENANT_ID,
      requestId: "ocr-release",
      periodStart: PERIOD_KEY,
      amount: 4,
      limit: 10,
      ttlSeconds: 300,
    });

    expect(reservation).not.toBeNull();

    const released = await releaseOcrQuotaReservation({
      tenantId: TENANT_ID,
      reservationId: reservation!.reservationId,
    });

    expect(released).toBe(true);

    const [counter, stored] = await Promise.all([
      QuotaCounterModel.findOne({
        tenantId: TENANT_ID,
        dimension: "ocrPagesPerMonth",
        periodStart: PERIOD_KEY,
      })
        .lean()
        .exec(),

      OcrQuotaReservationModel.findOne({
        reservationId: reservation!.reservationId,
      })
        .lean()
        .exec(),
    ]);

    expect(counter?.value).toBe(0);
    expect(stored?.status).toBe("released");
    expect(stored?.actualAmount).toBe(0);
    expect(stored?.settledAt).toBeInstanceOf(Date);
  });

  it("repeated OCR commit is idempotent and never refunds twice", async () => {
    const reservation = await reserveOcrQuota({
      tenantId: TENANT_ID,
      requestId: "ocr-double-commit",
      periodStart: PERIOD_KEY,
      amount: 5,
      limit: 10,
      ttlSeconds: 300,
    });

    expect(reservation).not.toBeNull();

    expect(
      await commitOcrQuotaReservation({
        tenantId: TENANT_ID,
        reservationId: reservation!.reservationId,
        actualAmount: 2,
      }),
    ).toBe(true);

    expect(
      await commitOcrQuotaReservation({
        tenantId: TENANT_ID,
        reservationId: reservation!.reservationId,
        actualAmount: 2,
      }),
    ).toBe(true);

    const counter = await QuotaCounterModel.findOne({
      tenantId: TENANT_ID,
      dimension: "ocrPagesPerMonth",
      periodStart: PERIOD_KEY,
    })
      .lean()
      .exec();

    expect(counter?.value).toBe(2);
  });

  it("releases expired active OCR reservations and refunds their pages", async () => {
    const reservation = await reserveOcrQuota({
      tenantId: TENANT_ID,
      requestId: "ocr-expired",
      periodStart: PERIOD_KEY,
      amount: 6,
      limit: 10,
      ttlSeconds: 300,
    });

    expect(reservation).not.toBeNull();

    await OcrQuotaReservationModel.updateOne(
      {
        reservationId: reservation!.reservationId,
      },
      {
        $set: {
          expiresAt: new Date(Date.now() - 1_000),
        },
      },
    );

    const result = await releaseExpiredOcrReservations(
      new Date(),
      100,
    );

    expect(result).toEqual({
      examined: 1,
      released: 1,
      refundedPages: 6,
    });

    const [counter, stored] = await Promise.all([
      QuotaCounterModel.findOne({
        tenantId: TENANT_ID,
        dimension: "ocrPagesPerMonth",
        periodStart: PERIOD_KEY,
      })
        .lean()
        .exec(),

      OcrQuotaReservationModel.findOne({
        reservationId: reservation!.reservationId,
      })
        .lean()
        .exec(),
    ]);

    expect(counter?.value).toBe(0);
    expect(stored?.status).toBe("released");
    expect(stored?.actualAmount).toBe(0);
  });
});
