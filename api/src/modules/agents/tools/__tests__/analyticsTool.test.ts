import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

import type { RunContext } from "../../agents.types.js";
import { createAnalyticsTool } from "../analyticsTool.js";
import type { AnalyticsService } from "../../../analytics/analytics.service.js";
import DocumentModel from "../../../../db/models/document.model.js";
import FeedbackModel from "../../../../db/models/feedback.model.js";
import MessageModel from "../../../../db/models/message.model.js";

const CONTEXT: RunContext = {
  tenantId: "64b000000000000000000001",
  actorId: "actor-1",
  traceId: "trace-1",
  requestId: "request-1",
  workflowName: "w",
  agentName: "a",
};

function createMockAnalyticsService() {
  const calls = { getOverview: 0, getTimeSeries: 0 };
  const service = {
    async getOverview() {
      calls.getOverview += 1;
      return {
        totalQueries: 42,
        totalTokens: 1000,
        totalCostUsd: 0.5,
        costType: "calculated" as const,
        dataFreshness: new Date().toISOString(),
        avgLatencyMs: 120,
        qualityScore: 88,
        activeUsersCount: 3,
        totalDocumentsProcessed: 5,
        reconciliationDriftCount: 0,
        trends: {
          queriesChangePct: 10,
          costChangePct: 5,
          tokensChangePct: 7,
          latencyChangePct: -3,
        },
      };
    },
    async getTimeSeries() {
      calls.getTimeSeries += 1;
      return [
        {
          timestamp: "2026-08-07",
          date: "2026-08-07",
          queries: 2,
          tokens: 100,
          costUsd: 0.01,
          avgLatencyMs: 100,
          errorCount: 0,
        },
      ];
    },
  };
  return { service: service as unknown as AnalyticsService, calls };
}

const originalCountDocuments = DocumentModel.countDocuments;
const originalFeedbackCountDocuments = FeedbackModel.countDocuments;
const originalMessageAggregate = MessageModel.aggregate;

afterEach(() => {
  (DocumentModel.countDocuments as unknown) = originalCountDocuments;
  (FeedbackModel.countDocuments as unknown) = originalFeedbackCountDocuments;
  (MessageModel.aggregate as unknown) = originalMessageAggregate;
});

describe("analyticsTool", () => {
  it("defines the expected schema metadata", () => {
    const { service } = createMockAnalyticsService();
    const tool = createAnalyticsTool(service);
    assert.equal(tool.schema.name, "analytics_query");
    assert.equal(tool.schema.version, "1.0.0");
    assert.equal(tool.schema.requiredPermission, "analytics:read");
    assert.equal(tool.schema.approvalRequired, false);
    assert.equal(tool.schema.timeoutMs, 10_000);
    assert.equal(tool.schema.maxRetries, 1);
    assert.equal(
      (
        tool.schema.inputSchema.parse({ metric: "query_count" }) as {
          period: string;
        }
      ).period,
      "week",
    );
  });

  it("rejects invalid input", () => {
    const { service } = createMockAnalyticsService();
    const tool = createAnalyticsTool(service);
    assert.throws(() => tool.schema.inputSchema.parse({}));
    assert.throws(() => tool.schema.inputSchema.parse({ metric: "bogus" }));
    assert.throws(() =>
      tool.schema.inputSchema.parse({ metric: "query_count", period: "year" }),
    );
  });

  it("returns query_count from the AnalyticsService for the tenant", async () => {
    const { service, calls } = createMockAnalyticsService();
    const tool = createAnalyticsTool(service);
    const result = await tool.handler(CONTEXT, {
      metric: "query_count",
      period: "week",
    });
    assert.deepEqual(result, { result: { count: 42 } });
    assert.equal(calls.getOverview, 1);
  });

  it("returns usage_trend from the AnalyticsService for the tenant", async () => {
    const { service, calls } = createMockAnalyticsService();
    const tool = createAnalyticsTool(service);
    const result = await tool.handler(CONTEXT, {
      metric: "usage_trend",
      period: "month",
    });
    assert.equal(calls.getTimeSeries, 1);
    assert.equal((result as { result: unknown[] }).result.length, 1);
  });

  it("returns tenant-scoped document_count across all statuses via direct DB query", async () => {
    let capturedFilter: Record<string, unknown> | null = null;
    (DocumentModel.countDocuments as unknown) = async (
      filter: Record<string, unknown>,
    ) => {
      capturedFilter = filter;
      return 7;
    };
    const { service } = createMockAnalyticsService();
    const tool = createAnalyticsTool(service);
    const result = await tool.handler(CONTEXT, {
      metric: "document_count",
      period: "week",
    });
    assert.deepEqual(result, { result: { count: 7 } });
    const filter = (capturedFilter ?? {}) as Record<string, unknown>;
    assert.equal(
      (filter.tenantId as { toString(): string }).toString(),
      CONTEXT.tenantId,
    );
    assert.equal(
      filter.deletedAt,
      undefined,
      "document_count must not exclude soft-deleted documents",
    );
    assert.equal(
      filter.status,
      undefined,
      "document_count must count documents across all statuses",
    );
  });

  it("returns feedback_stats via direct DB queries", async () => {
    (FeedbackModel.countDocuments as unknown) = async (
      filter: Record<string, unknown>,
    ) => {
      if (filter.rating === "thumbs_up") return 5;
      if (filter.rating === "thumbs_down") return 2;
      return 7;
    };
    const { service } = createMockAnalyticsService();
    const tool = createAnalyticsTool(service);
    const result = await tool.handler(CONTEXT, {
      metric: "feedback_stats",
      period: "week",
    });
    assert.deepEqual(result, {
      result: { total: 7, thumbsUp: 5, thumbsDown: 2, positiveRate: 0.7143 },
    });
  });

  it("returns top_queries via direct DB query", async () => {
    (MessageModel.aggregate as unknown) = () => ({
      exec: async () => [
        { _id: "What is remote work policy?", count: 4 },
        { _id: "How do I request leave?", count: 2 },
      ],
    });
    const { service } = createMockAnalyticsService();
    const tool = createAnalyticsTool(service);
    const result = await tool.handler(CONTEXT, {
      metric: "top_queries",
      period: "day",
    });
    assert.deepEqual(result, {
      result: [
        { query: "What is remote work policy?", count: 4 },
        { query: "How do I request leave?", count: 2 },
      ],
    });
  });
});
