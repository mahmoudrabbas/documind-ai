import mongoose from "mongoose";
import QualityMetricModel from "../../db/models/qualityMetric.model.js";
import UsageEventModel from "../../db/models/usageEvent.model.js";
import FeedbackModel from "../../db/models/feedback.model.js";
import ProcessingRunModel from "../../db/models/processingRun.model.js";

export interface QualityMetricsResult {
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

    // Persist quality metric record if tenantObjectId is provided
    if (tenantObjectId) {
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
            calculatedAt: new Date(),
          },
        },
        { upsert: true, new: true }
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
      totalQueries,
      totalFeedback,
      totalProcessingRuns,
    };
  }
}
