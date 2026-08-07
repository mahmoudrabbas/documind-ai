import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

import type { RunContext } from "../../agents.types.js";
import { createKnowledgeGapTool } from "../knowledgeGapTool.js";
import type { KnowledgeGapsService } from "../../../knowledge-gaps/knowledge-gaps.service.js";

const CONTEXT: RunContext = {
  tenantId: "tenant-1",
  actorId: "actor-1",
  traceId: "trace-1",
  requestId: "request-1",
  workflowName: "w",
  agentName: "a",
};

function createMockService() {
  const calls: Array<{
    tenantId: string;
    actorId: string;
    input: Record<string, unknown>;
  }> = [];
  const service = {
    async reportCandidate(
      tenantId: string,
      actorId: string,
      input: Record<string, unknown>,
    ) {
      calls.push({ tenantId, actorId, input });
      return {
        _id: "64b000000000000000000001",
        status: "open",
      };
    },
  };
  return {
    service: service as unknown as KnowledgeGapsService,
    calls,
  };
}

describe("knowledgeGapTool", () => {
  it("defines the expected schema metadata", () => {
    const { service } = createMockService();
    const tool = createKnowledgeGapTool(service);
    assert.equal(tool.schema.name, "report_knowledge_gap");
    assert.equal(tool.schema.version, "1.0.0");
    assert.equal(tool.schema.requiredPermission, "knowledge_gaps:create");
    assert.equal(tool.schema.approvalRequired, false);
    assert.equal(tool.schema.timeoutMs, 5_000);
    assert.equal(tool.schema.maxRetries, 1);
    assert.equal(
      (
        tool.schema.inputSchema.parse({
          question: "Q",
          outcome: "unanswered",
        }) as { confidence: number }
      ).confidence,
      0.5,
    );
  });

  it("rejects invalid input", () => {
    const { service } = createMockService();
    const tool = createKnowledgeGapTool(service);
    assert.throws(() => tool.schema.inputSchema.parse({}));
    assert.throws(() => tool.schema.inputSchema.parse({ question: "" }));
    assert.throws(() =>
      tool.schema.inputSchema.parse({ question: "Q", outcome: "bad" }),
    );
    assert.throws(() =>
      tool.schema.inputSchema.parse({ question: "Q", confidence: 1.5 }),
    );
    assert.throws(() =>
      tool.schema.inputSchema.parse({ question: "Q", confidence: -0.1 }),
    );
  });

  it("calls reportCandidate with the tenant, actor, and mapped outcome", async () => {
    const { service, calls } = createMockService();
    const tool = createKnowledgeGapTool(service);
    const result = await tool.handler(CONTEXT, {
      question: "How do I request remote work approval?",
      outcome: "unanswered",
      confidence: 0.8,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.tenantId, "tenant-1");
    assert.equal(calls[0]!.actorId, "actor-1");
    assert.equal(calls[0]!.input.question, "How do I request remote work approval?");
    assert.equal(calls[0]!.input.outcome, "refused");
    assert.equal(calls[0]!.input.confidence, 0.8);
    assert.deepEqual(result, {
      gapId: "64b000000000000000000001",
      status: "open",
    });
  });

  it("maps low_confidence and negative_feedback outcomes", async () => {
    const { service, calls } = createMockService();
    const tool = createKnowledgeGapTool(service);

    await tool.handler(CONTEXT, {
      question: "Q1",
      outcome: "low_confidence",
    });
    await tool.handler(CONTEXT, {
      question: "Q2",
      outcome: "negative_feedback",
    });

    assert.equal(calls[0]!.input.outcome, "weak");
    assert.equal(calls[1]!.input.outcome, "negative_feedback");
  });

  it("uses the singleton service when constructed without dependencies", () => {
    const tool = createKnowledgeGapTool();
    assert.equal(tool.schema.name, "report_knowledge_gap");
  });
});
