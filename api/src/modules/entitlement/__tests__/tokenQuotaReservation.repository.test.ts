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

import TokenQuotaReservationModel from "../../../db/models/tokenQuotaReservation.model.js";
import { QuotaCounterModel } from "../adapters/mongo-quota-counter.js";
import {
  commitTokenQuotaReservation,
  releaseExpiredTokenReservations,
  releaseTokenQuotaReservation,
  reserveTokenQuota,
} from "../tokenQuotaReservation.repository.js";

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
    dbName: "token-quota-reservation-test",
  });

  // Guarantee uniqueness constraints exist before testing races/rollback.
  await Promise.all([
    QuotaCounterModel.init(),
    TokenQuotaReservationModel.init(),
  ]);
});

beforeEach(async () => {
  await Promise.all([
    QuotaCounterModel.deleteMany({}),
    TokenQuotaReservationModel.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe("tokenQuotaReservation repository", () => {
  it("atomically reserves token quota and creates a durable reservation", async () => {
    const result = await reserveTokenQuota({
      tenantId: TENANT_ID,
      requestId: "request-1",
      periodStart: PERIOD_KEY,
      amount: 500,
      limit: 1000,
      ttlSeconds: 300,
    });

    expect(result).not.toBeNull();
    expect(result?.reservedAmount).toBe(500);
    expect(result?.reservationId).toMatch(/^tqr_/);

    const [counter, reservation] = await Promise.all([
      QuotaCounterModel.findOne({
        tenantId: TENANT_ID,
        dimension: "tokensPerMonth",
        periodStart: PERIOD_KEY,
      })
        .lean()
        .exec(),

      TokenQuotaReservationModel.findOne({
        tenantId: TENANT_ID,
        requestId: "request-1",
      })
        .lean()
        .exec(),
    ]);

    expect(counter?.value).toBe(500);

    expect(reservation).toMatchObject({
      requestId: "request-1",
      dimension: "tokensPerMonth",
      periodStart: PERIOD_KEY,
      reservedAmount: 500,
      actualAmount: null,
      status: "active",
      settledAt: null,
    });
  });

  it("keeps parallel fresh-counter reservations within the monthly limit", async () => {
    const tenantId = new mongoose.Types.ObjectId().toString();

    const attempts = await Promise.allSettled([
      reserveTokenQuota({
        tenantId,
        requestId: "parallel-fresh-1",
        periodStart: "2026-08",
        amount: 700,
        limit: 1_000,
        ttlSeconds: 300,
      }),
      reserveTokenQuota({
        tenantId,
        requestId: "parallel-fresh-2",
        periodStart: "2026-08",
        amount: 700,
        limit: 1_000,
        ttlSeconds: 300,
      }),
    ]);

    const fulfilled = attempts.filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof reserveTokenQuota>>
      > => result.status === "fulfilled",
    );

    expect(fulfilled).toHaveLength(2);

    const successfulReservations = fulfilled
      .map((result) => result.value)
      .filter((value) => value !== null);

    expect(successfulReservations).toHaveLength(1);

    const counter = await QuotaCounterModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      dimension: "tokensPerMonth",
      periodStart: "2026-08",
    }).lean();

    expect(counter?.value).toBe(700);

    const activeReservations =
      await TokenQuotaReservationModel.countDocuments({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        dimension: "tokensPerMonth",
        periodStart: "2026-08",
        status: "active",
      });

    expect(activeReservations).toBe(1);
  });

  it("denies reservation when the requested amount exceeds remaining quota", async () => {
    await QuotaCounterModel.create({
      tenantId: TENANT_ID,
      dimension: "tokensPerMonth",
      periodStart: PERIOD_KEY,
      value: 800,
    });

    const result = await reserveTokenQuota({
      tenantId: TENANT_ID,
      requestId: "request-denied",
      periodStart: PERIOD_KEY,
      amount: 300,
      limit: 1000,
      ttlSeconds: 300,
    });

    expect(result).toBeNull();

    const [counter, reservationCount] = await Promise.all([
      QuotaCounterModel.findOne({
        tenantId: TENANT_ID,
        dimension: "tokensPerMonth",
        periodStart: PERIOD_KEY,
      })
        .lean()
        .exec(),

      TokenQuotaReservationModel.countDocuments({}),
    ]);

    expect(counter?.value).toBe(800);
    expect(reservationCount).toBe(0);
  });

  it("rolls back the counter increment when reservation persistence fails", async () => {
    const first = await reserveTokenQuota({
      tenantId: TENANT_ID,
      requestId: "duplicate-request",
      periodStart: PERIOD_KEY,
      amount: 200,
      limit: 1000,
      ttlSeconds: 300,
    });

    expect(first).not.toBeNull();

    await expect(
      reserveTokenQuota({
        tenantId: TENANT_ID,
        requestId: "duplicate-request",
        periodStart: PERIOD_KEY,
        amount: 300,
        limit: 1000,
        ttlSeconds: 300,
      }),
    ).rejects.toMatchObject({
      code: 11000,
    });

    // The second transaction increments the counter before attempting
    // reservation insertion. The unique requestId violation must abort
    // the entire transaction and roll that increment back.
    const [counter, reservations] = await Promise.all([
      QuotaCounterModel.findOne({
        tenantId: TENANT_ID,
        dimension: "tokensPerMonth",
        periodStart: PERIOD_KEY,
      })
        .lean()
        .exec(),

      TokenQuotaReservationModel.find({
        tenantId: TENANT_ID,
      })
        .lean()
        .exec(),
    ]);

    expect(counter?.value).toBe(200);
    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.reservedAmount).toBe(200);
  });

  it("commits actual usage and refunds unused reserved tokens", async () => {
    const reservation = await reserveTokenQuota({
      tenantId: TENANT_ID,
      requestId: "request-commit",
      periodStart: PERIOD_KEY,
      amount: 500,
      limit: 1000,
      ttlSeconds: 300,
    });

    expect(reservation).not.toBeNull();

    const committed = await commitTokenQuotaReservation({
      tenantId: TENANT_ID,
      reservationId: reservation!.reservationId,
      actualAmount: 180,
    });

    expect(committed).toEqual({
      committed: true,
      reservedAmount: 500,
      actualAmount: 180,
      refundedAmount: 320,
    });

    const [counter, stored] = await Promise.all([
      QuotaCounterModel.findOne({
        tenantId: TENANT_ID,
        dimension: "tokensPerMonth",
        periodStart: PERIOD_KEY,
      })
        .lean()
        .exec(),

      TokenQuotaReservationModel.findOne({
        reservationId: reservation!.reservationId,
      })
        .lean()
        .exec(),
    ]);

    expect(counter?.value).toBe(180);
    expect(stored?.status).toBe("committed");
    expect(stored?.actualAmount).toBe(180);
    expect(stored?.settledAt).toBeInstanceOf(Date);
  });

  it("release refunds the complete reservation", async () => {
    const reservation = await reserveTokenQuota({
      tenantId: TENANT_ID,
      requestId: "request-release",
      periodStart: PERIOD_KEY,
      amount: 400,
      limit: 1000,
      ttlSeconds: 300,
    });

    expect(reservation).not.toBeNull();

    const released = await releaseTokenQuotaReservation({
      tenantId: TENANT_ID,
      reservationId: reservation!.reservationId,
    });

    expect(released).toEqual({
      released: true,
      refundedAmount: 400,
    });

    const [counter, stored] = await Promise.all([
      QuotaCounterModel.findOne({
        tenantId: TENANT_ID,
        dimension: "tokensPerMonth",
        periodStart: PERIOD_KEY,
      })
        .lean()
        .exec(),

      TokenQuotaReservationModel.findOne({
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

  it("repeated commit is idempotent and never refunds twice", async () => {
    const reservation = await reserveTokenQuota({
      tenantId: TENANT_ID,
      requestId: "request-double-commit",
      periodStart: PERIOD_KEY,
      amount: 500,
      limit: 1000,
      ttlSeconds: 300,
    });

    expect(reservation).not.toBeNull();

    const first = await commitTokenQuotaReservation({
      tenantId: TENANT_ID,
      reservationId: reservation!.reservationId,
      actualAmount: 200,
    });

    const second = await commitTokenQuotaReservation({
      tenantId: TENANT_ID,
      reservationId: reservation!.reservationId,
      actualAmount: 200,
    });

    expect(first?.committed).toBe(true);
    expect(second?.committed).toBe(true);
    expect(second?.actualAmount).toBe(200);

    const counter = await QuotaCounterModel.findOne({
      tenantId: TENANT_ID,
      dimension: "tokensPerMonth",
      periodStart: PERIOD_KEY,
    })
      .lean()
      .exec();

    // Reservation 500, actual 200:
    // only one refund of 300 may ever occur.
    expect(counter?.value).toBe(200);
  });

  it("a committed reservation cannot later be released", async () => {
    const reservation = await reserveTokenQuota({
      tenantId: TENANT_ID,
      requestId: "request-commit-then-release",
      periodStart: PERIOD_KEY,
      amount: 500,
      limit: 1000,
      ttlSeconds: 300,
    });

    expect(reservation).not.toBeNull();

    await commitTokenQuotaReservation({
      tenantId: TENANT_ID,
      reservationId: reservation!.reservationId,
      actualAmount: 220,
    });

    const released = await releaseTokenQuotaReservation({
      tenantId: TENANT_ID,
      reservationId: reservation!.reservationId,
    });

    expect(released).toEqual({
      released: false,
      refundedAmount: 0,
    });

    const counter = await QuotaCounterModel.findOne({
      tenantId: TENANT_ID,
      dimension: "tokensPerMonth",
      periodStart: PERIOD_KEY,
    })
      .lean()
      .exec();

    expect(counter?.value).toBe(220);
  });


  it("releases expired active reservations and refunds their quota", async () => {
    const reservation = await reserveTokenQuota({
      tenantId: TENANT_ID,
      requestId: "request-expired",
      periodStart: PERIOD_KEY,
      amount: 350,
      limit: 1000,
      ttlSeconds: 300,
    });

    expect(reservation).not.toBeNull();

    await TokenQuotaReservationModel.updateOne(
      { reservationId: reservation!.reservationId },
      { $set: { expiresAt: new Date("2026-08-14T10:00:00.000Z") } },
    );

    const result = await releaseExpiredTokenReservations(
      new Date("2026-08-14T10:01:00.000Z"),
      100,
    );

    expect(result).toEqual({
      examined: 1,
      released: 1,
      refundedTokens: 350,
    });

    const [counter, stored] = await Promise.all([
      QuotaCounterModel.findOne({
        tenantId: TENANT_ID,
        dimension: "tokensPerMonth",
        periodStart: PERIOD_KEY,
      })
        .lean()
        .exec(),

      TokenQuotaReservationModel.findOne({
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

  it("does not release reservations that have not expired", async () => {
    const reservation = await reserveTokenQuota({
      tenantId: TENANT_ID,
      requestId: "request-future",
      periodStart: PERIOD_KEY,
      amount: 275,
      limit: 1000,
      ttlSeconds: 300,
    });

    expect(reservation).not.toBeNull();

    await TokenQuotaReservationModel.updateOne(
      { reservationId: reservation!.reservationId },
      { $set: { expiresAt: new Date("2026-08-14T12:00:00.000Z") } },
    );

    const result = await releaseExpiredTokenReservations(
      new Date("2026-08-14T11:59:59.000Z"),
      100,
    );

    expect(result).toEqual({
      examined: 0,
      released: 0,
      refundedTokens: 0,
    });

    const counter = await QuotaCounterModel.findOne({
      tenantId: TENANT_ID,
      dimension: "tokensPerMonth",
      periodStart: PERIOD_KEY,
    })
      .lean()
      .exec();

    expect(counter?.value).toBe(275);
  });

  it("never releases a committed reservation even when its expiry is in the past", async () => {
    const reservation = await reserveTokenQuota({
      tenantId: TENANT_ID,
      requestId: "request-committed-expired",
      periodStart: PERIOD_KEY,
      amount: 400,
      limit: 1000,
      ttlSeconds: 300,
    });

    expect(reservation).not.toBeNull();

    await commitTokenQuotaReservation({
      tenantId: TENANT_ID,
      reservationId: reservation!.reservationId,
      actualAmount: 125,
    });

    await TokenQuotaReservationModel.updateOne(
      { reservationId: reservation!.reservationId },
      { $set: { expiresAt: new Date("2026-08-14T08:00:00.000Z") } },
    );

    const result = await releaseExpiredTokenReservations(
      new Date("2026-08-14T09:00:00.000Z"),
      100,
    );

    expect(result).toEqual({
      examined: 0,
      released: 0,
      refundedTokens: 0,
    });

    const counter = await QuotaCounterModel.findOne({
      tenantId: TENANT_ID,
      dimension: "tokensPerMonth",
      periodStart: PERIOD_KEY,
    })
      .lean()
      .exec();

    expect(counter?.value).toBe(125);
  });

  it("respects the expiry cleanup batch limit", async () => {
    for (let index = 0; index < 3; index += 1) {
      const reservation = await reserveTokenQuota({
        tenantId: TENANT_ID,
        requestId: `request-batch-${index}`,
        periodStart: PERIOD_KEY,
        amount: 100,
        limit: 1000,
        ttlSeconds: 300,
      });

      expect(reservation).not.toBeNull();

      await TokenQuotaReservationModel.updateOne(
        { reservationId: reservation!.reservationId },
        {
          $set: {
            expiresAt: new Date(
              `2026-08-14T10:00:0${index}.000Z`,
            ),
          },
        },
      );
    }

    const result = await releaseExpiredTokenReservations(
      new Date("2026-08-14T11:00:00.000Z"),
      2,
    );

    expect(result).toEqual({
      examined: 2,
      released: 2,
      refundedTokens: 200,
    });

    const counter = await QuotaCounterModel.findOne({
      tenantId: TENANT_ID,
      dimension: "tokensPerMonth",
      periodStart: PERIOD_KEY,
    })
      .lean()
      .exec();

    expect(counter?.value).toBe(100);

    const activeCount =
      await TokenQuotaReservationModel.countDocuments({
        status: "active",
      });

    expect(activeCount).toBe(1);
  });

});
