import crypto from "node:crypto";
import mongoose from "mongoose";
import OcrQuotaReservationModel from "../../db/models/ocrQuotaReservation.model.js";
import { QuotaCounterModel } from "./adapters/mongo-quota-counter.js";

const DIMENSION = "ocrPagesPerMonth" as const;

export interface ReserveOcrQuotaInput {
  tenantId: string;
  requestId?: string;
  periodStart: string;
  amount: number;
  limit: number;
  ttlSeconds: number;
}

export interface ReserveOcrQuotaResult {
  reservationId: string;
  reservedAmount: number;
  expiresAt: Date;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}`);
  }
}

export async function reserveOcrQuota(
  input: ReserveOcrQuotaInput,
): Promise<ReserveOcrQuotaResult | null> {
  assertPositiveInteger(input.amount, "OCR reservation amount");
  assertPositiveInteger(input.ttlSeconds, "OCR reservation TTL");

  if (
    !Number.isFinite(input.limit) ||
    !Number.isInteger(input.limit) ||
    input.limit < 0
  ) {
    throw new Error("Invalid OCR reservation limit");
  }

  if (input.amount > input.limit) {
    return null;
  }

  const session = await mongoose.startSession();

  try {
    let result: ReserveOcrQuotaResult | null = null;

    await session.withTransaction(async () => {
      const tenantId = new mongoose.Types.ObjectId(input.tenantId);
      const counterKey = {
        tenantId,
        dimension: DIMENSION,
        periodStart: input.periodStart,
      };

      const existing = await QuotaCounterModel.findOneAndUpdate(
        {
          ...counterKey,
          value: { $lte: input.limit - input.amount },
        },
        { $inc: { value: input.amount } },
        { new: true, session },
      );

      if (!existing) {
        const current = await QuotaCounterModel.findOne(counterKey)
          .session(session)
          .lean();

        if (current) {
          result = null;
          return;
        }

        try {
          await QuotaCounterModel.create(
            [{ ...counterKey, value: input.amount }],
            { session },
          );
        } catch (error) {
          if (
            !(
              error instanceof Error &&
              "code" in error &&
              (error as { code?: unknown }).code === 11000
            )
          ) {
            throw error;
          }

          const retried = await QuotaCounterModel.findOneAndUpdate(
            {
              ...counterKey,
              value: { $lte: input.limit - input.amount },
            },
            { $inc: { value: input.amount } },
            { new: true, session },
          );

          if (!retried) {
            result = null;
            return;
          }
        }
      }

      const reservationId = `oqr_${crypto.randomUUID()}`;
      const expiresAt = new Date(
        Date.now() + input.ttlSeconds * 1000,
      );

      await OcrQuotaReservationModel.create(
        [
          {
            tenantId,
            reservationId,
            requestId: input.requestId ?? null,
            dimension: DIMENSION,
            periodStart: input.periodStart,
            reservedAmount: input.amount,
            actualAmount: null,
            status: "active",
            expiresAt,
            settledAt: null,
          },
        ],
        { session },
      );

      result = {
        reservationId,
        reservedAmount: input.amount,
        expiresAt,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
}

export interface SettleOcrQuotaInput {
  tenantId: string;
  reservationId: string;
  actualAmount: number;
}

export async function commitOcrQuotaReservation(
  input: SettleOcrQuotaInput,
): Promise<boolean> {
  if (
    !Number.isFinite(input.actualAmount) ||
    !Number.isInteger(input.actualAmount) ||
    input.actualAmount < 0
  ) {
    throw new Error("Invalid actual OCR page amount");
  }

  const session = await mongoose.startSession();

  try {
    let committed = false;

    await session.withTransaction(async () => {
      const tenantId = new mongoose.Types.ObjectId(input.tenantId);

      const reservation = await OcrQuotaReservationModel.findOne({
        tenantId,
        reservationId: input.reservationId,
      })
        .session(session)
        .exec();

      if (!reservation) return;

      if (reservation.status === "committed") {
        committed = true;
        return;
      }

      if (reservation.status !== "active") return;

      if (input.actualAmount > reservation.reservedAmount) {
        throw new Error(
          "Actual OCR usage exceeds reserved OCR pages",
        );
      }

      const refund =
        reservation.reservedAmount - input.actualAmount;

      if (refund > 0) {
        await QuotaCounterModel.findOneAndUpdate(
          {
            tenantId,
            dimension: DIMENSION,
            periodStart: reservation.periodStart,
          },
          { $inc: { value: -refund } },
          { session },
        );

        await QuotaCounterModel.updateMany(
          {
            tenantId,
            dimension: DIMENSION,
            periodStart: reservation.periodStart,
            value: { $lt: 0 },
          },
          { $set: { value: 0 } },
          { session },
        );
      }

      reservation.status = "committed";
      reservation.actualAmount = input.actualAmount;
      reservation.settledAt = new Date();

      await reservation.save({ session });
      committed = true;
    });

    return committed;
  } finally {
    await session.endSession();
  }
}

export async function releaseOcrQuotaReservation(input: {
  tenantId: string;
  reservationId: string;
}): Promise<boolean> {
  const session = await mongoose.startSession();

  try {
    let released = false;

    await session.withTransaction(async () => {
      const tenantId = new mongoose.Types.ObjectId(input.tenantId);

      const reservation = await OcrQuotaReservationModel.findOne({
        tenantId,
        reservationId: input.reservationId,
      })
        .session(session)
        .exec();

      if (!reservation) return;

      if (reservation.status === "released") {
        released = true;
        return;
      }

      if (reservation.status !== "active") return;

      await QuotaCounterModel.findOneAndUpdate(
        {
          tenantId,
          dimension: DIMENSION,
          periodStart: reservation.periodStart,
        },
        { $inc: { value: -reservation.reservedAmount } },
        { session },
      );

      await QuotaCounterModel.updateMany(
        {
          tenantId,
          dimension: DIMENSION,
          periodStart: reservation.periodStart,
          value: { $lt: 0 },
        },
        { $set: { value: 0 } },
        { session },
      );

      reservation.status = "released";
      reservation.actualAmount = 0;
      reservation.settledAt = new Date();

      await reservation.save({ session });
      released = true;
    });

    return released;
  } finally {
    await session.endSession();
  }
}


export interface ReleaseExpiredOcrReservationsResult {
  examined: number;
  released: number;
  refundedPages: number;
}

export async function releaseExpiredOcrReservations(
  now = new Date(),
  limit = 100,
): Promise<ReleaseExpiredOcrReservationsResult> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Invalid expired OCR reservation batch limit");
  }

  const expired = await OcrQuotaReservationModel.find({
    status: "active",
    expiresAt: { $lte: now },
  })
    .sort({ expiresAt: 1, _id: 1 })
    .limit(limit)
    .select({
      tenantId: 1,
      reservationId: 1,
      reservedAmount: 1,
    })
    .lean()
    .exec();

  let released = 0;
  let refundedPages = 0;

  for (const reservation of expired) {
    const wasReleased = await releaseOcrQuotaReservation({
      tenantId: reservation.tenantId.toString(),
      reservationId: reservation.reservationId,
    });

    if (wasReleased) {
      released += 1;
      refundedPages += reservation.reservedAmount;
    }
  }

  return {
    examined: expired.length,
    released,
    refundedPages,
  };
}
