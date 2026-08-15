import crypto from "node:crypto";
import mongoose from "mongoose";
import TokenQuotaReservationModel from "../../db/models/tokenQuotaReservation.model.js";
import type { EntitlementDimension } from "./entitlement.types.js";
import { QuotaCounterModel } from "./adapters/mongo-quota-counter.js";

export interface ReserveTokenQuotaInput {
  tenantId: string;
  requestId?: string;
  periodStart: string;
  amount: number;
  limit: number;
  ttlSeconds: number;
}

export interface ReserveTokenQuotaResult {
  reservationId: string;
  reservedAmount: number;
  expiresAt: Date;
}

export async function reserveTokenQuota(
  input: ReserveTokenQuotaInput,
): Promise<ReserveTokenQuotaResult | null> {
  const session = await mongoose.startSession();

  try {
    let result: ReserveTokenQuotaResult | null = null;

    await session.withTransaction(async () => {
      const tenantObjectId = new mongoose.Types.ObjectId(input.tenantId);

      if (
        !Number.isFinite(input.amount) ||
        input.amount <= 0 ||
        !Number.isInteger(input.amount)
      ) {
        throw new Error("Invalid token reservation amount");
      }

      if (
        !Number.isFinite(input.limit) ||
        input.limit < 0 ||
        !Number.isInteger(input.limit)
      ) {
        throw new Error("Invalid token reservation limit");
      }

      if (
        !Number.isFinite(input.ttlSeconds) ||
        input.ttlSeconds <= 0 ||
        !Number.isInteger(input.ttlSeconds)
      ) {
        throw new Error("Invalid token reservation TTL");
      }

      if (input.amount > input.limit) {
        result = null;
        return;
      }

      const dimension: EntitlementDimension = "tokensPerMonth";

      const counterKey: {
        tenantId: mongoose.Types.ObjectId;
        dimension: EntitlementDimension;
        periodStart: string;
      } = {
        tenantId: tenantObjectId,
        dimension,
        periodStart: input.periodStart,
      };

      const existing = await QuotaCounterModel.findOneAndUpdate(
        {
          ...counterKey,
          value: { $lte: input.limit - input.amount },
        },
        {
          $inc: { value: input.amount },
        },
        {
          new: true,
          session,
        },
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
            [
              {
                ...counterKey,
                value: input.amount,
              },
            ],
            { session },
          );
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            (error as { code?: unknown }).code === 11000
          ) {
            const retried = await QuotaCounterModel.findOneAndUpdate(
              {
                ...counterKey,
                value: { $lte: input.limit - input.amount },
              },
              {
                $inc: { value: input.amount },
              },
              {
                new: true,
                session,
              },
            );

            if (!retried) {
              result = null;
              return;
            }
          } else {
            throw error;
          }
        }
      }

      const reservationId = `tqr_${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);

      await TokenQuotaReservationModel.create(
        [
          {
            tenantId: tenantObjectId,
            reservationId,
            requestId: input.requestId ?? null,
            dimension: "tokensPerMonth",
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

export interface CommitTokenQuotaReservationInput {
  tenantId: string;
  reservationId: string;
  actualAmount: number;
}

export interface CommitTokenQuotaReservationResult {
  committed: boolean;
  reservedAmount: number;
  actualAmount: number;
  refundedAmount: number;
}

export async function commitTokenQuotaReservation(
  input: CommitTokenQuotaReservationInput,
): Promise<CommitTokenQuotaReservationResult | null> {
  if (
    !Number.isFinite(input.actualAmount) ||
    input.actualAmount < 0 ||
    !Number.isInteger(input.actualAmount)
  ) {
    throw new Error("Invalid actual token amount");
  }

  const session = await mongoose.startSession();

  try {
    let result: CommitTokenQuotaReservationResult | null = null;

    await session.withTransaction(async () => {
      const tenantObjectId = new mongoose.Types.ObjectId(input.tenantId);

      const reservation = await TokenQuotaReservationModel.findOne({
        tenantId: tenantObjectId,
        reservationId: input.reservationId,
      })
        .session(session)
        .exec();

      if (!reservation) {
        result = null;
        return;
      }

      if (reservation.status === "committed") {
        result = {
          committed: true,
          reservedAmount: reservation.reservedAmount,
          actualAmount:
            reservation.actualAmount ?? reservation.reservedAmount,
          refundedAmount: Math.max(
            0,
            reservation.reservedAmount -
              (reservation.actualAmount ?? reservation.reservedAmount),
          ),
        };
        return;
      }

      if (reservation.status !== "active") {
        result = {
          committed: false,
          reservedAmount: reservation.reservedAmount,
          actualAmount: reservation.actualAmount ?? 0,
          refundedAmount: 0,
        };
        return;
      }

      if (input.actualAmount > reservation.reservedAmount) {
        throw new Error(
          "Actual token usage exceeds the reserved token amount",
        );
      }

      const refundedAmount =
        reservation.reservedAmount - input.actualAmount;

      if (refundedAmount > 0) {
        await QuotaCounterModel.findOneAndUpdate(
          {
            tenantId: tenantObjectId,
            dimension: "tokensPerMonth",
            periodStart: reservation.periodStart,
          },
          {
            $inc: { value: -refundedAmount },
          },
          {
            session,
          },
        );

        await QuotaCounterModel.updateMany(
          {
            tenantId: tenantObjectId,
            dimension: "tokensPerMonth",
            periodStart: reservation.periodStart,
            value: { $lt: 0 },
          },
          {
            $set: { value: 0 },
          },
          {
            session,
          },
        );
      }

      reservation.status = "committed";
      reservation.actualAmount = input.actualAmount;
      reservation.settledAt = new Date();

      await reservation.save({ session });

      result = {
        committed: true,
        reservedAmount: reservation.reservedAmount,
        actualAmount: input.actualAmount,
        refundedAmount,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
}

export interface ReleaseTokenQuotaReservationInput {
  tenantId: string;
  reservationId: string;
}

export interface ReleaseTokenQuotaReservationResult {
  released: boolean;
  refundedAmount: number;
}

export async function releaseTokenQuotaReservation(
  input: ReleaseTokenQuotaReservationInput,
): Promise<ReleaseTokenQuotaReservationResult | null> {
  const session = await mongoose.startSession();

  try {
    let result: ReleaseTokenQuotaReservationResult | null = null;

    await session.withTransaction(async () => {
      const tenantObjectId = new mongoose.Types.ObjectId(input.tenantId);

      const reservation = await TokenQuotaReservationModel.findOne({
        tenantId: tenantObjectId,
        reservationId: input.reservationId,
      })
        .session(session)
        .exec();

      if (!reservation) {
        result = null;
        return;
      }

      if (reservation.status === "released") {
        result = {
          released: true,
          refundedAmount: reservation.reservedAmount,
        };
        return;
      }

      if (reservation.status !== "active") {
        result = {
          released: false,
          refundedAmount: 0,
        };
        return;
      }

      await QuotaCounterModel.findOneAndUpdate(
        {
          tenantId: tenantObjectId,
          dimension: "tokensPerMonth",
          periodStart: reservation.periodStart,
        },
        {
          $inc: { value: -reservation.reservedAmount },
        },
        {
          session,
        },
      );

      await QuotaCounterModel.updateMany(
        {
          tenantId: tenantObjectId,
          dimension: "tokensPerMonth",
          periodStart: reservation.periodStart,
          value: { $lt: 0 },
        },
        {
          $set: { value: 0 },
        },
        {
          session,
        },
      );

      reservation.status = "released";
      reservation.actualAmount = 0;
      reservation.settledAt = new Date();

      await reservation.save({ session });

      result = {
        released: true,
        refundedAmount: reservation.reservedAmount,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
}

export interface ReleaseExpiredTokenReservationsResult {
  examined: number;
  released: number;
  refundedTokens: number;
}

export async function releaseExpiredTokenReservations(
  now = new Date(),
  limit = 100,
): Promise<ReleaseExpiredTokenReservationsResult> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Invalid expired reservation batch limit");
  }

  const expired = await TokenQuotaReservationModel.find({
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
  let refundedTokens = 0;

  for (const reservation of expired) {
    const result = await releaseTokenQuotaReservation({
      tenantId: reservation.tenantId.toString(),
      reservationId: reservation.reservationId,
    });

    if (result?.released) {
      released += 1;
      refundedTokens += result.refundedAmount;
    }
  }

  return {
    examined: expired.length,
    released,
    refundedTokens,
  };
}
