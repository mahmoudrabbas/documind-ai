import mongoose from "mongoose";
import type { JudgeScores, JudgeStatus } from "../../db/models/judgeEvaluation.model.js";
import JudgeEvaluationModel from "../../db/models/judgeEvaluation.model.js";
import ConversationModel from "../../db/models/conversation.model.js";
import MessageModel from "../../db/models/message.model.js";

/**
 * Persistence access for the LLM-as-a-Judge flow. Kept separate from the
 * orchestration service so both layers can be tested with fakes.
 */

export interface JudgeEvaluationRecord {
  tenantId: string;
  messageId: string;
  conversationId: string;
  judgeStatus: JudgeStatus;
  judgeScores: JudgeScores;
  judgeProvider: string;
  judgeModel: string;
  judgeVersion: string;
  judgeEvaluatedAt: Date;
  judgeErrorCode: string | null;
}

export async function loadAssistantMessageForJudge(tenantId: string, messageId: string) {
  if (!mongoose.Types.ObjectId.isValid(messageId)) return null;
  return MessageModel.findOne({
    _id: messageId,
    tenantId,
    role: "assistant",
  })
    .lean()
    .exec();
}

export async function loadConversationForJudge(tenantId: string, conversationId: string) {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) return null;
  return ConversationModel.findOne({ _id: conversationId, tenantId }).lean().exec();
}

export async function loadPrecedingQuestionForJudge(
  tenantId: string,
  conversationId: string,
  sequenceNumber: number,
) {
  return MessageModel.findOne({
    tenantId,
    conversationId,
    role: "user",
    sequenceNumber: { $lt: sequenceNumber },
  })
    .sort({ sequenceNumber: -1 })
    .lean()
    .exec();
}

export async function loadExistingEvaluationForJudge(
  tenantId: string,
  messageId: string,
  judgeVersion: string,
) {
  return JudgeEvaluationModel.findOne({ tenantId, messageId, judgeVersion }).lean().exec();
}

/**
 * Atomically persists an evaluation outcome, replacing any existing
 * non-completed (degraded/failed) record for the same
 * `(tenantId, messageId, judgeVersion)` key. An existing `completed` record is
 * never overwritten: the upsert filter excludes it, so persisting over a
 * completed record surfaces a duplicate-key error which the caller resolves by
 * reusing the completed evaluation. This guarantees exactly one document per
 * key and that a successful retry always wins over a stale degraded/failed row.
 */
export async function persistJudgeEvaluation(record: JudgeEvaluationRecord) {
  const tenantObjectId = new mongoose.Types.ObjectId(record.tenantId);
  const messageObjectId = new mongoose.Types.ObjectId(record.messageId);
  const filter = {
    tenantId: tenantObjectId,
    messageId: messageObjectId,
    judgeVersion: record.judgeVersion,
    judgeStatus: { $ne: "completed" as const },
  };
  return JudgeEvaluationModel.findOneAndUpdate(
    filter,
    {
      $set: {
        conversationId: new mongoose.Types.ObjectId(record.conversationId),
        judgeStatus: record.judgeStatus,
        judgeScores: record.judgeScores,
        judgeProvider: record.judgeProvider,
        judgeModel: record.judgeModel,
        judgeVersion: record.judgeVersion,
        judgeEvaluatedAt: record.judgeEvaluatedAt,
        judgeErrorCode: record.judgeErrorCode,
      },
    },
    { upsert: true, returnDocument: "after" },
  ).exec();
}

export function isDuplicateKeyError(error: unknown): boolean {
  const code = (error as { code?: number } | null)?.code;
  if (code === 11000) return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes("E11000") || message.toLowerCase().includes("duplicate key");
}
