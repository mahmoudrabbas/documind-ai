import mongoose from "mongoose";
import { z } from "zod";
import type { RegisteredTool, RunContext } from "../agents.types.js";
import { AnalyticsService } from "../../analytics/analytics.service.js";
import type { AnalyticsQueryFilters } from "../../analytics/analytics.types.js";
import DocumentModel from "../../../db/models/document.model.js";
import FeedbackModel from "../../../db/models/feedback.model.js";
import MessageModel from "../../../db/models/message.model.js";

const ANALYTICS_TOOL_INPUT = z.object({
  metric: z.enum([
    "document_count",
    "query_count",
    "feedback_stats",
    "top_queries",
    "usage_trend",
  ]),
  period: z.enum(["day", "week", "month"]).default("week"),
});

const ANALYTICS_TOOL_OUTPUT = z.object({
  result: z.unknown(),
});

const PERIOD_DAYS: Record<string, number> = {
  day: 1,
  week: 7,
  month: 30,
};

/**
 * Creates the `analytics_query` agent tool.
 *
 * This tool returns tenant-scoped analytics data for the given metric and
 * period. Service-backed metrics (query_count, usage_trend) use the existing
 * AnalyticsService; the remaining metrics use direct, tenant-scoped DB
 * queries against the documents, feedback, and messages collections.
 */
export function createAnalyticsTool(
  analyticsService: AnalyticsService = new AnalyticsService(),
): RegisteredTool {
  return {
    schema: {
      name: "analytics_query",
      version: "1.0.0",
      description:
        "Queries tenant analytics data for the current tenant. " +
        "Supports document counts, query counts, feedback statistics, top queries, " +
        "and usage trends over a day, week, or month. " +
        "Use metric=document_count for questions like \"how many documents are uploaded\" " +
        "(counts every tenant document regardless of status). " +
        "Use metric=top_queries when the user asks about the most common, most frequent, " +
        "or most repeated questions or queries (e.g. \"ما هي أكثر الأسئلة شيوعاً هذا الأسبوع\"). " +
        "Use metric=usage_trend when the user asks how query usage changed over time. " +
        "Use metric=query_count for the number of queries, and metric=feedback_stats for " +
        "thumbs up/down feedback. Set period to day, week, or month (default week).",
      inputSchema: ANALYTICS_TOOL_INPUT,
      outputSchema: ANALYTICS_TOOL_OUTPUT,
      requiredPermission: "analytics:read",
      approvalRequired: false,
      timeoutMs: 10_000,
      maxRetries: 1,
    },
    handler: async (context: RunContext, input: unknown) => {
      const params = ANALYTICS_TOOL_INPUT.parse(input);

      const end = new Date();
      const start = new Date(
        end.getTime() - PERIOD_DAYS[params.period] * 24 * 60 * 60 * 1000,
      );
      const tenantId = context.tenantId;
      const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

      const filters: AnalyticsQueryFilters = {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };

      let result: unknown;
      switch (params.metric) {
        case "document_count": {
          const count = await DocumentModel.countDocuments({
            tenantId: tenantObjectId,
          });
          result = { count };
          break;
        }
        case "query_count": {
          const overview = await analyticsService.getOverview(tenantId, filters);
          result = { count: overview.totalQueries };
          break;
        }
        case "feedback_stats": {
          const [total, thumbsUp, thumbsDown] = await Promise.all([
            FeedbackModel.countDocuments({
              tenantId: tenantObjectId,
              createdAt: { $gte: start, $lte: end },
            }),
            FeedbackModel.countDocuments({
              tenantId: tenantObjectId,
              rating: "thumbs_up",
              createdAt: { $gte: start, $lte: end },
            }),
            FeedbackModel.countDocuments({
              tenantId: tenantObjectId,
              rating: "thumbs_down",
              createdAt: { $gte: start, $lte: end },
            }),
          ]);
          result = {
            total,
            thumbsUp,
            thumbsDown,
            positiveRate: total > 0 ? Number((thumbsUp / total).toFixed(4)) : 0,
          };
          break;
        }
        case "top_queries": {
          const rows = await MessageModel.aggregate([
            {
              $match: {
                tenantId: tenantObjectId,
                role: "user",
                createdAt: { $gte: start, $lte: end },
              },
            },
            { $group: { _id: "$content", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ]).exec();
          result = rows.map((row) => ({
            query: row._id,
            count: row.count,
          }));
          break;
        }
        case "usage_trend": {
          const series = await analyticsService.getTimeSeries(tenantId, filters);
          result = series;
          break;
        }
      }

      return { result };
    },
  };
}
