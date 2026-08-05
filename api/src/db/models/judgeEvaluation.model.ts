import mongoose, { Schema } from "mongoose";

/**
 * LLM-as-a-Judge evaluation record for a single assistant message.
 *
 * One document represents one judge evaluation of one assistant message for a
 * specific judge prompt/schema version. The unique compound index
 * `{ tenantId, messageId, judgeVersion }` makes repeated feedback submissions
 * for the same message idempotent at the database layer while still allowing a
 * newer judge version to produce a fresh evaluation.
 *
 * Deliberately does NOT store the raw provider response, the full question,
 * the full answer, the evidence text, chain-of-thought, or secrets. Scoring
 * payloads are derived aggregates only.
 */

export type JudgeStatus = "completed" | "degraded" | "failed";

export interface JudgeScores {
  /** 0-1: Is the answer grounded in the evidence? */
  faithfulness: number;
  /** 0-1: Does the answer address the question? */
  relevancy: number;
  /** 0-1: Is the answer well-structured and readable? */
  coherence: number;
  /** 0-1: Weighted average computed server-side. */
  overall: number;
}

export interface JudgeEvaluationDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  messageId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  judgeStatus: JudgeStatus;
  judgeScores: JudgeScores;
  judgeProvider: string;
  judgeModel: string;
  judgeVersion: string;
  judgeEvaluatedAt: Date;
  judgeErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const judgeScoresSchema = new Schema<JudgeScores>(
  {
    faithfulness: { type: Number, required: true, min: 0, max: 1 },
    relevancy: { type: Number, required: true, min: 0, max: 1 },
    coherence: { type: Number, required: true, min: 0, max: 1 },
    overall: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

const judgeEvaluationSchema = new Schema<JudgeEvaluationDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      required: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    judgeStatus: {
      type: String,
      enum: ["completed", "degraded", "failed"],
      required: true,
      index: true,
    },
    judgeScores: {
      type: judgeScoresSchema,
      required: true,
    },
    judgeProvider: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    judgeModel: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    judgeVersion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    judgeEvaluatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    judgeErrorCode: {
      type: String,
      default: null,
      maxlength: 120,
    },
  },
  { timestamps: true },
);

judgeEvaluationSchema.index(
  { tenantId: 1, messageId: 1, judgeVersion: 1 },
  { unique: true },
);
judgeEvaluationSchema.index({ tenantId: 1, judgeStatus: 1, judgeEvaluatedAt: -1 });

const JudgeEvaluationModel = mongoose.model<JudgeEvaluationDocument>(
  "JudgeEvaluation",
  judgeEvaluationSchema,
  "judge_evaluations",
);

export default JudgeEvaluationModel;
