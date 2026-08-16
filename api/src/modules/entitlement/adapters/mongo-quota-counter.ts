import mongoose, { Schema, Model } from "mongoose";
import type { QuotaCounterPort } from "../ports/quota-counter.port.js";
import type { EntitlementDimension } from "../entitlement.types.js";

// ── Counter document ─────────────────────────────────────────────────────────
//
// Stores the current usage count for a (tenant, dimension, period) triple.
// The compound unique index on (tenantId, dimension, periodStart) ensures
// that upserts never accidentally create duplicate counter rows.

export interface QuotaCounterDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  dimension: EntitlementDimension;
  periodStart: string;
  value: number;
}

// ── Idempotency gate document ────────────────────────────────────────────────
//
// Separate collection so idempotency checks never contend with counter writes.
// A TTL index auto-purges gates after 24 hours.

export interface IdempotencyGateDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  dimension: EntitlementDimension;
  requestId: string;
  createdAt: Date;
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const quotaCounterSchema = new Schema<QuotaCounterDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  dimension: { type: String, required: true },
  periodStart: { type: String, required: true },
  value: { type: Number, required: true, default: 0, min: 0 },
});

// Compound unique index on (tenantId, dimension, periodStart)
quotaCounterSchema.index(
  { tenantId: 1, dimension: 1, periodStart: 1 },
  { unique: true },
);

const idempotencyGateSchema = new Schema<IdempotencyGateDocument>({
  tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
  dimension: { type: String, required: true },
  requestId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Unique index on (tenantId, dimension, requestId)
idempotencyGateSchema.index(
  { tenantId: 1, dimension: 1, requestId: 1 },
  { unique: true },
);

// TTL index — auto-delete after 24 hours
idempotencyGateSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

// ── Models ───────────────────────────────────────────────────────────────────

export const QuotaCounterModel: Model<QuotaCounterDocument> =
  mongoose.model<QuotaCounterDocument>("QuotaCounter", quotaCounterSchema);

export const IdempotencyGateModel: Model<IdempotencyGateDocument> =
  mongoose.model<IdempotencyGateDocument>(
    "IdempotencyGate",
    idempotencyGateSchema,
  );

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as { code?: unknown }).code === 11000;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class MongoQuotaCounter implements QuotaCounterPort {
  async checkAndConsume(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    amount: number,
    limit: number,
  ): Promise<{ success: boolean; current: number }> {
    const key = {
      tenantId: new mongoose.Types.ObjectId(tenantId),
      dimension,
      periodStart,
    };

    if (amount > limit) {
      return { success: false, current: await this.getUsage(tenantId, dimension, periodStart) };
    }

    const filter = { ...key, value: { $lte: limit - amount } };

    // First update an existing row atomically. Do not use upsert here: when
    // the quota predicate fails, MongoDB would attempt a duplicate insert and
    // surface E11000 instead of returning a normal denial.
    const result = await QuotaCounterModel.findOneAndUpdate(
      filter,
      { $inc: { value: amount } },
      { new: true },
    );
    if (result) {
      return { success: true, current: result.value };
    }

    // No row exists yet, so create the initial counter. A concurrent creator
    // may win the unique-index race; retry the guarded update in that case.
    try {
      const created = await QuotaCounterModel.create({ ...key, value: amount });
      return { success: true, current: created.value };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }

    const retried = await QuotaCounterModel.findOneAndUpdate(
      filter,
      { $inc: { value: amount } },
      { new: true },
    );
    return {
      success: retried !== null,
      current: retried?.value ?? await this.getUsage(tenantId, dimension, periodStart),
    };
  }

  async release(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    amount: number,
  ): Promise<void> {
    await QuotaCounterModel.findOneAndUpdate(
      {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        dimension,
        periodStart,
      },
      {
        $inc: { value: -amount },
      },
      {
        upsert: true,
      },
    );

    // Floor at 0
    await QuotaCounterModel.updateMany(
      {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        dimension,
        periodStart,
        value: { $lt: 0 },
      },
      {
        $set: { value: 0 },
      },
    );
  }

  async getUsage(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
  ): Promise<number> {
    const doc = await QuotaCounterModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      dimension,
      periodStart,
    });
    return doc?.value ?? 0;
  }

  async getAllUsage(
    tenantId: string,
    periodStart: string,
  ): Promise<Record<EntitlementDimension, number>> {
    const docs = await QuotaCounterModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      periodStart,
    });

    const usage: Record<string, number> = {};
    for (const doc of docs) {
      usage[doc.dimension] = doc.value;
    }
    return usage as Record<EntitlementDimension, number>;
  }

  async resetPeriod(
    tenantId: string,
    oldPeriodStart: string,
    newPeriodStart: string,
  ): Promise<void> {
    // Copy old counters to new period with value 0
    const oldCounters = await QuotaCounterModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      periodStart: oldPeriodStart,
    });

    for (const counter of oldCounters) {
      await QuotaCounterModel.findOneAndUpdate(
        {
          tenantId: new mongoose.Types.ObjectId(tenantId),
          dimension: counter.dimension,
          periodStart: newPeriodStart,
        },
        {
          $set: { value: 0 },
        },
        {
          upsert: true,
        },
      );
    }
  }

  async getIdempotencyGate(
    tenantId: string,
    dimension: EntitlementDimension,
    requestId: string,
  ): Promise<boolean> {
    const gate = await IdempotencyGateModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      dimension,
      requestId,
    });
    return gate !== null;
  }

  async createIdempotencyGate(
    tenantId: string,
    dimension: EntitlementDimension,
    requestId: string,
  ): Promise<boolean> {
    try {
      await IdempotencyGateModel.create({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        dimension,
        requestId,
      });
      return true;
    } catch (error: unknown) {
      // E11000 = duplicate key error (gate already exists)
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code: number }).code === 11000
      ) {
        return false;
      }
      throw error;
    }
  }

  async set(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    value: number,
  ): Promise<void> {
    await QuotaCounterModel.findOneAndUpdate(
      {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        dimension,
        periodStart,
      },
      { $set: { value } },
      { upsert: true },
    );
  }

  async ensureAtLeast(
    tenantId: string,
    dimension: EntitlementDimension,
    periodStart: string,
    value: number,
  ): Promise<number> {
    const result = await QuotaCounterModel.findOneAndUpdate(
      {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        dimension,
        periodStart,
      },
      {
        $max: { value },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    return result?.value ?? value;
  }
}
