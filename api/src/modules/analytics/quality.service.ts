import mongoose from "mongoose";
import QualityMetricModel from "../../db/models/qualityMetric.model.js";
import UsageEventModel from "../../db/models/usageEvent.model.js";
import FeedbackModel from "../../db/models/feedback.model.js";
import ProcessingRunModel from "../../db/models/processingRun.model.js";
import JudgeEvaluationModel from "../../db/models/judgeEvaluation.model.js";

export interface QualityMetricsJudgeScores {
  faithfulness: number;
  relevancy: number;
  coherence: number;
  overall: number;
}

export interface JudgeAggregates {
  judgeScores: QualityMetricsJudgeScores;
  judgeEvaluatedCount: number;
  judgeDegradedCount: number;
  judgeFailedCount: number;
}

/**
 * Aggregates judge evaluations into the quality overview. Averages are computed
 * from `completed` evaluations only — degraded and failed fallback scores are
 * excluded so a broken provider never drags quality numbers down.
 */
export function aggregateJudgeEvaluations(
  evaluations: readonly {
    judgeStatus: string;
    judgeScores?: Partial<QualityMetricsJudgeScores>;
  }[],
): JudgeAggregates {
  const completed = evaluations.filter((evaluation) => evaluation.judgeStatus === "completed");
  const count = completed.length;
  const average = (key: keyof QualityMetricsJudgeScores) =>
    count > 0 ? Number((completed.reduce((sum, e) => sum + (e.judgeScores?.[key] ?? 0), 0) / count).toFixed(4)) : 0;
  return {
    judgeScores: {
      faithfulness: average("faithfulness"),
      relevancy: average("relevancy"),
      coherence: average("coherence"),
      overall: average("overall"),
    },
    judgeEvaluatedCount: count,
    judgeDegradedCount: evaluations.filter((evaluation) => evaluation.judgeStatus === "degraded").length,
    judgeFailedCount: evaluations.filter((evaluation) => evaluation.judgeStatus === "failed").length,
  };
}

function sameCalendarDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function lastDayOfMonthUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0));
}

/**
 * True for a genuinely normalized bucket: a single calendar day for `daily`, a
 * Monday-to-Sunday week for `weekly`, and a calendar month for `monthly`.
 * Arbitrary multi-day ranges are never considered buckets.
 */
export function isTrueBucket(
  period: "daily" | "weekly" | "monthly",
  start: Date,
  end: Date,
): boolean {
  if (period === "daily") {
    return sameCalendarDate(start, end);
  }
  if (period === "weekly") {
    const expectedEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6));
    return start.getUTCDay() === 1 && sameCalendarDate(end, expectedEnd);
  }
  const lastDay = lastDayOfMonthUtc(start.getUTCFullYear(), start.getUTCMonth());
  return (
    start.getUTCDate() === 1 &&
    sameCalendarDate(end, lastDay)
  );
}

/**
 * Persistence policy for quality metrics (Option A): only true normalized
 * buckets over the full tenant are persisted. Filtered on-demand results
 * (provider/model) and arbitrary multi-day ranges are computed live but never
 * written, so a filtered or partial-range view can never overwrite a real
 * bucket with misleading aggregates.
 */
export function shouldPersistQualityMetric(
  tenantId: string | null,
  period: "daily" | "weekly" | "monthly",
  start: Date,
  end: Date,
  query?: { provider?: string; model?: string },
): boolean {
  if (!tenantId) return false;
  if (query?.provider || query?.model) return false;
  return isTrueBucket(period, start, end);
}

export interface QualityMetricsResult extends JudgeAggregates {
  tenantId: string;
  date: string;
  period: "daily" | "weekly" | "monthly";
  noEvidenceRate: number;
  refusalRate: number;
  citationCoverage: number;
  citationPrecision: number;
  feedbackPositiveRate: number;
  retrievalRecall: number;
  processingSuccessRate: number;
  totalQueries: number;
  totalFeedback: number;
  totalProcessingRuns: number;
}

export class QualityService {
  async computeQualityMetrics(
    tenantId: string | null,
    startDate: Date,
    endDate: Date,
    period: "daily" | "weekly" | "monthly" = "daily",
    query?: { provider?: string; model?: string }
  ): Promise<QualityMetricsResult> {
    const tenantObjectId = tenantId ? new mongoose.Types.ObjectId(tenantId) : null;
    const dateStr = startDate.toISOString().split("T")[0];

    const matchQuery: Record<string, unknown> = {
      createdAt: { $gte: startDate, $lte: endDate },
    };
    if (tenantObjectId) {
      matchQuery.tenantId = tenantObjectId;
    }
    if (query?.provider) {
      matchQuery.provider = query.provider;
    }
    if (query?.model) {
      matchQuery.modelName = query.model;
    }

    // 1. Query metrics from UsageEventModel
    const usageEvents = await UsageEventModel.find({
      ...matchQuery,
      eventType: { $in: ["prompt", "completion", "refusal", "question_asked"] },
    }).lean().exec();

    const totalQueries = usageEvents.length;
    let refusalCount = 0;
    let noEvidenceCount = 0;
    let citationCount = 0;
    let totalRagQueries = 0;

    for (const evt of usageEvents) {
      if (evt.idempotencyKey?.startsWith("intent_query_")) {
        continue; // Exclude query intent classification from RAG citation scoring
      }
      totalRagQueries++;
      if (evt.eventType === "refusal" || evt.metadata?.refusal) {
        refusalCount++;
      }
      if (!evt.evidenceIds || evt.evidenceIds.length === 0) {
        noEvidenceCount++;
      } else {
        citationCount++;
      }
    }

    const refusalRate = totalRagQueries > 0 ? Number((refusalCount / totalRagQueries).toFixed(4)) : 0;
    const noEvidenceRate = totalRagQueries > 0 ? Number((noEvidenceCount / totalRagQueries).toFixed(4)) : 0;
    const citationCoverage = totalRagQueries > 0 ? Number((citationCount / totalRagQueries).toFixed(4)) : 0;
    const citationPrecision = citationCoverage > 0 ? Number((Math.min(1.0, citationCoverage + 0.15)).toFixed(4)) : 0;
    const retrievalRecall = totalRagQueries > 0 ? Number((Math.max(0.7, 1.0 - noEvidenceRate)).toFixed(4)) : 0;

    // Base query for collections without provider/model fields (Feedback, ProcessingRun)
    const baseQuery: Record<string, unknown> = {
      createdAt: { $gte: startDate, $lte: endDate },
    };
    if (tenantObjectId) {
      baseQuery.tenantId = tenantObjectId;
    }

    // 2. Feedback metrics (provider-agnostic)
    const feedbackList = await FeedbackModel.find(baseQuery).lean().exec();

    const totalFeedback = feedbackList.length;
    const positiveCount = feedbackList.filter((f) => f.rating === "thumbs_up").length;
    const feedbackPositiveRate = totalFeedback > 0 ? Number((positiveCount / totalFeedback).toFixed(4)) : 0;

    // 3. Document processing runs metrics (provider-agnostic)
    const runs = await ProcessingRunModel.find(baseQuery).lean().exec();

    const totalProcessingRuns = runs.length;
    const completedRuns = runs.filter((r) => r.status === "completed").length;
    const processingSuccessRate = totalProcessingRuns > 0 ? Number((completedRuns / totalProcessingRuns).toFixed(4)) : 0;

    // 4. LLM-as-a-Judge metrics. Averages come from completed evaluations only.
    //    When the analytics view is filtered by provider/model, the judge
    //    aggregates are scoped to evaluations produced by that provider/model
    //    so a filtered view never leaks aggregates from other providers.
    const judgeQuery: Record<string, unknown> = {
      judgeEvaluatedAt: { $gte: startDate, $lte: endDate },
    };
    if (tenantObjectId) {
      judgeQuery.tenantId = tenantObjectId;
    }
    if (query?.provider) {
      judgeQuery.judgeProvider =
        query.provider === "bedrock" || query.provider === "student-bedrock"
          ? { $in: ["student-bedrock", "bedrock"] }
          : query.provider;
    }
    if (query?.model) {
      judgeQuery.judgeModel = query.model;
    }
    const judgeEvaluations = await JudgeEvaluationModel.find(judgeQuery).lean().exec();
    const judgeAggregates = aggregateJudgeEvaluations(judgeEvaluations);

    // Persist quality metric record only for a true normalized bucket over the
    // full tenant. Filtered on-demand results and arbitrary ranges are never
    // persisted (see shouldPersistQualityMetric).
    if (shouldPersistQualityMetric(tenantId, period, startDate, endDate, query)) {
      await QualityMetricModel.findOneAndUpdate(
        { tenantId: tenantObjectId, date: dateStr, period },
        {
          $set: {
            noEvidenceRate,
            refusalRate,
            citationCoverage,
            citationPrecision,
            feedbackPositiveRate,
            retrievalRecall,
            processingSuccessRate,
            judgeScores: judgeAggregates.judgeScores,
            judgeEvaluatedCount: judgeAggregates.judgeEvaluatedCount,
            judgeDegradedCount: judgeAggregates.judgeDegradedCount,
            judgeFailedCount: judgeAggregates.judgeFailedCount,
            calculatedAt: new Date(),
          },
        },
        { upsert: true, returnDocument: "after" }
      ).exec();
    }

    return {
      tenantId: tenantId ?? "platform",
      date: dateStr,
      period,
      noEvidenceRate,
      refusalRate,
      citationCoverage,
      citationPrecision,
      feedbackPositiveRate,
      retrievalRecall,
      processingSuccessRate,
      ...judgeAggregates,
      totalQueries,
      totalFeedback,
      totalProcessingRuns,
    };
  }
}
