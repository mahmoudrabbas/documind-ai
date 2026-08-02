import mongoose from "mongoose";
import UsageEventModel, { type UsageEventDocument } from "../../../db/models/usageEvent.model.js";
import type {
  UsageEventWriter,
  UsageEventInput,
  UsageEventRecord,
} from "../ports/usageEventWriter.port.js";
import { logger } from "../../../common/logger/logger.js";

export class MongoUsageEventWriter implements UsageEventWriter {
  async record(input: UsageEventInput): Promise<UsageEventRecord> {
    const tenantObjectId = new mongoose.Types.ObjectId(input.tenantId);
    const actorObjectId = input.actorId ? new mongoose.Types.ObjectId(input.actorId) : null;
    const documentObjectId = input.documentId ? new mongoose.Types.ObjectId(input.documentId) : null;

    const payload = {
      tenantId: tenantObjectId,
      actorId: actorObjectId,
      departmentId: input.departmentId ?? null,
      eventType: input.eventType,
      provider: input.provider ?? null,
      modelName: input.model ?? null,
      modelVersion: input.modelVersion ?? null,
      documentId: documentObjectId,
      evidenceIds: input.evidenceIds ?? [],
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      totalTokens: input.totalTokens ?? ((input.inputTokens ?? 0) + (input.outputTokens ?? 0)),
      units: input.units ?? 1,
      costMinorUnits: input.costMinorUnits ?? 0,
      currency: input.currency ?? "USD",
      costType: input.costType ?? "estimated",
      latencyMs: input.latencyMs ?? 0,
      success: input.success ?? true,
      errorCode: input.errorCode ?? null,
      traceId: input.traceId ?? null,
      requestId: input.requestId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      metadata: input.metadata ?? {},
    };

    if (input.idempotencyKey) {
      try {
        const doc = await UsageEventModel.findOneAndUpdate(
          { idempotencyKey: input.idempotencyKey },
          { $setOnInsert: payload },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).exec();

        return this.mapDocument(doc);
      } catch (err: unknown) {
        const code = (err as { code?: number | string }).code;
        if (code === 11000 || code === "11000") {
          const existing = await UsageEventModel.findOne({ idempotencyKey: input.idempotencyKey }).exec();
          if (existing) {
            return this.mapDocument(existing);
          }
        }
        logger.error({ err, idempotencyKey: input.idempotencyKey }, "[MongoUsageEventWriter] Failed to record event with idempotencyKey");
        throw err;
      }
    }

    const doc = await UsageEventModel.create(payload);
    return this.mapDocument(doc);
  }

  async recordBatch(inputs: UsageEventInput[]): Promise<UsageEventRecord[]> {
    const results: UsageEventRecord[] = [];
    for (const input of inputs) {
      results.push(await this.record(input));
    }
    return results;
  }

  private mapDocument(doc: UsageEventDocument): UsageEventRecord {
    return {
      id: doc._id.toString(),
      tenantId: doc.tenantId.toString(),
      actorId: doc.actorId ? doc.actorId.toString() : null,
      departmentId: doc.departmentId ?? null,
      eventType: doc.eventType,
      provider: doc.provider ?? null,
      model: doc.modelName ?? null,
      modelVersion: doc.modelVersion ?? null,
      documentId: doc.documentId ? doc.documentId.toString() : null,
      evidenceIds: doc.evidenceIds ?? [],
      conversationId: doc.conversationId ?? null,
      messageId: doc.messageId ?? null,
      inputTokens: doc.inputTokens,
      outputTokens: doc.outputTokens,
      totalTokens: doc.totalTokens,
      units: doc.units,
      costMinorUnits: doc.costMinorUnits,
      currency: doc.currency,
      costType: doc.costType,
      latencyMs: doc.latencyMs,
      success: doc.success,
      errorCode: doc.errorCode ?? null,
      traceId: doc.traceId ?? null,
      requestId: doc.requestId ?? null,
      idempotencyKey: doc.idempotencyKey ?? null,
      metadata: doc.metadata as Record<string, unknown> | undefined,
      createdAt: doc.createdAt,
    };
  }
}
