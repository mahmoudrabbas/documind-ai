import mongoose, { Schema } from "mongoose";

export interface QualityMetricJudgeScores {
  faithfulness: number;
  relevancy: number;
  coherence: number;
  overall: number;
}

export interface QualityMetricDocument extends mongoose.Document {
  tenantId: mongoose.Types.ObjectId;
  date: string;
  period: "daily" | "weekly" | "monthly";
  noEvidenceRate: number;
  refusalRate: number;
  citationCoverage: number;
  citationPrecision: number;
  feedbackPositiveRate: number;
  retrievalRecall: number;
  processingSuccessRate: number;
  /**
   * LLM-as-a-Judge aggregate averages. Computed from `completed` evaluations
   * only; degraded and failed fallback scores never pollute these averages.
   */
  judgeScores: QualityMetricJudgeScores;
  judgeEvaluatedCount: number;
  judgeDegradedCount: number;
  judgeFailedCount: number;
  calculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const qualityMetricSchema = new Schema<QualityMetricDocument>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    period: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      default: "daily",
    },
    noEvidenceRate: {
      type: Number,
      default: 0,
    },
    refusalRate: {
      type: Number,
      default: 0,
    },
    citationCoverage: {
      type: Number,
      default: 0,
    },
    citationPrecision: {
      type: Number,
      default: 0,
    },
    feedbackPositiveRate: {
      type: Number,
      default: 0,
    },
    retrievalRecall: {
      type: Number,
      default: 0,
    },
    processingSuccessRate: {
      type: Number,
      default: 0,
    },
    judgeScores: {
      faithfulness: { type: Number, default: 0 },
      relevancy: { type: Number, default: 0 },
      coherence: { type: Number, default: 0 },
      overall: { type: Number, default: 0 },
    },
    judgeEvaluatedCount: {
      type: Number,
      default: 0,
    },
    judgeDegradedCount: {
      type: Number,
      default: 0,
    },
    judgeFailedCount: {
      type: Number,
      default: 0,
    },
    calculatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

qualityMetricSchema.index({ tenantId: 1, date: 1, period: 1 });

const QualityMetricModel = mongoose.model<QualityMetricDocument>(
  "QualityMetric",
  qualityMetricSchema,
  "quality_metrics"
);

export default QualityMetricModel;
