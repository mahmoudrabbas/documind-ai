import mongoose from "mongoose";
import AnalyticsAggregateModel from "../../db/models/analyticsAggregate.model.js";
import UsageEventModel from "../../db/models/usageEvent.model.js";
import EntitlementReconciliationReportModel from "../../db/models/entitlementReconciliationReport.model.js";

export interface AnalyticsFilterParams {
  tenantId?: string;
  startDate?: Date;
  endDate?: Date;
  provider?: string;
  model?: string;
  departmentId?: string;
  actorId?: string;
  eventType?: string;
}

export class AggregationService {
  async aggregateUsageEvents(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    periodGranularity: "hourly" | "daily" | "weekly" | "monthly" = "daily"
  ): Promise<void> {
    const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

    const pipeline: mongoose.PipelineStage[] = [
      {
        $match: {
          tenantId: tenantObjectId,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            provider: "$provider",
            modelName: "$modelName",
            eventType: "$eventType",
            departmentId: "$departmentId",
          },
          eventCount: { $sum: 1 },
          totalTokens: { $sum: "$totalTokens" },
          totalCostMinorUnits: { $sum: "$costMinorUnits" },
          avgLatencyMs: { $avg: "$latencyMs" },
          successCount: { $sum: { $cond: [{ $eq: ["$success", true] }, 1, 0] } },
          failureCount: { $sum: { $cond: [{ $eq: ["$success", false] }, 1, 0] } },
          refusalCount: { $sum: { $cond: [{ $eq: ["$eventType", "refusal"] }, 1, 0] } },
        },
      },
    ];

    const results = await UsageEventModel.aggregate(pipeline).exec();

    // Fetch latest reconciliation report for drift measure
    const latestReconciliation = await EntitlementReconciliationReportModel.findOne({
      tenantId: tenantObjectId,
    })
      .sort({ timestamp: -1 })
      .lean()
      .exec();

    const reconciliationDrift = latestReconciliation?.totalDiscrepancies ?? 0;

    for (const res of results) {
      await AnalyticsAggregateModel.findOneAndUpdate(
        {
          tenantId: tenantObjectId,
          date: res._id.date,
          periodGranularity,
          provider: res._id.provider ?? null,
          modelName: res._id.modelName ?? null,
          eventType: res._id.eventType ?? null,
          departmentId: res._id.departmentId ?? null,
        },
        {
          $set: {
            eventCount: res.eventCount,
            totalTokens: res.totalTokens,
            totalCostMinorUnits: res.totalCostMinorUnits,
            avgLatencyMs: Math.round(res.avgLatencyMs || 0),
            p95LatencyMs: Math.round((res.avgLatencyMs || 0) * 1.3), // approximation or sample-based
            successCount: res.successCount,
            failureCount: res.failureCount,
            refusalCount: res.refusalCount,
            reconciliationDrift,
            aggregatedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      ).exec();
    }
  }
}
