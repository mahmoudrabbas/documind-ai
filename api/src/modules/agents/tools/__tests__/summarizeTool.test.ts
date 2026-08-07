import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

import type { ModelAdapter, RunContext } from "../../agents.types.js";
import { createSummarizeTool } from "../summarizeTool.js";
import { createRetrievalTool } from "../retrievalTool.js";
import { createAnalyticsTool } from "../analyticsTool.js";
import { createKnowledgeGapTool } from "../knowledgeGapTool.js";
import { ToolRegistry } from "../../toolRegistry.js";
import type { HybridRetrievalService } from "../../../retrieval/retrieval.service.js";

const CONTEXT: RunContext = {
  tenantId: "tenant-1",
  actorId: "actor-1",
  traceId: "trace-1",
  requestId: "request-1",
  workflowName: "w",
  agentName: "a",
};

function createMockModel() {
  const calls: Array<{
    messages: { role: string; content: string }[];
    temperature?: number;
    maxTokens?: number;
  }> = [];
  const model: ModelAdapter = {
    providerKey: "mock",
    async complete(params: {
      messages: { role: string; content: string }[];
      temperature?: number;
      maxTokens?: number;
    }) {
      calls.push(params);
      return {
        id: "mock-1",
        provider: "mock",
        model: "mock-summarizer",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Mocked summary." },
            finishReason: "stop",
          },
        ],
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        latencyMs: 1,
        estimatedCost: 0,
      };
    },
  };
  return { model, calls };
}

function fakeRetrievalService(): HybridRetrievalService {
  return {
    hybridSearch: async () => ({ candidates: [], totalCandidates: 0 }),
    vectorSearch: async () => ({ candidates: [], totalCandidates: 0 }),
    keywordSearch: async () => ({ candidates: [], totalCandidates: 0 }),
  } as unknown as HybridRetrievalService;
}

describe("summarizeTool", () => {
  it("defines the expected schema metadata", () => {
    const { model } = createMockModel();
    const tool = createSummarizeTool(model);
    assert.equal(tool.schema.name, "summarize");
    assert.equal(tool.schema.version, "1.0.0");
    assert.equal(tool.schema.requiredPermission, "documents:read");
    assert.equal(tool.schema.approvalRequired, false);
    assert.equal(tool.schema.timeoutMs, 15_000);
    assert.equal(tool.schema.maxRetries, 1);
    assert.equal(
      (tool.schema.inputSchema.parse({ text: "hi" }) as { style: string }).style,
      "brief",
    );
    assert.equal(
      (tool.schema.inputSchema.parse({ text: "hi" }) as { language: string }).language,
      "en",
    );
    assert.equal(
      (
        tool.schema.inputSchema.parse({
          text: "hi",
          style: "bullet-points",
          language: "ar",
        }) as { style: string }
      ).style,
      "bullet-points",
    );
  });

  it("rejects invalid input", () => {
    const { model } = createMockModel();
    const tool = createSummarizeTool(model);
    assert.throws(() => tool.schema.inputSchema.parse({ text: "" }));
    assert.throws(() => tool.schema.inputSchema.parse({}));
    assert.throws(() => tool.schema.inputSchema.parse({ text: "x".repeat(50_001) }));
    assert.throws(() => tool.schema.inputSchema.parse({ text: "x", style: "long" }));
    assert.throws(() => tool.schema.inputSchema.parse({ text: "x", language: "fr" }));
  });

  it("uses the English system prompt by default", async () => {
    const { model, calls } = createMockModel();
    const tool = createSummarizeTool(model);
    const result = await tool.handler(CONTEXT, {
      text: "DocuMind is a document Q&A platform.",
    });
    assert.deepEqual(result, { summary: "Mocked summary." });
    assert.equal(calls.length, 1);
    const systemMessage = calls[0]!.messages.find((m) => m.role === "system");
    const userMessage = calls[0]!.messages.find((m) => m.role === "user");
    assert.match(systemMessage!.content, /document summarizer/);
    assert.equal(userMessage!.content, "DocuMind is a document Q&A platform.");
  });

  it("uses the Arabic system prompt when language is 'ar'", async () => {
    const { model, calls } = createMockModel();
    const tool = createSummarizeTool(model);
    const result = await tool.handler(CONTEXT, {
      text: "DocuMind منصة للإجابة على الأسئلة.",
      style: "detailed",
      language: "ar",
    });
    assert.deepEqual(result, { summary: "Mocked summary." });
    const systemMessage = calls[0]!.messages.find((m) => m.role === "system");
    assert.match(systemMessage!.content, /تلخيص/);
  });
});

describe("tool registration", () => {
  it("registers all 4 production tools in the registry", () => {
    const { model } = createMockModel();
    const registry = new ToolRegistry();
    registry.register(createRetrievalTool(fakeRetrievalService()));
    registry.register(createSummarizeTool(model));
    registry.register(createAnalyticsTool());
    registry.register(createKnowledgeGapTool());

    const names = registry.list().map((t) => t.schema.name).sort();
    assert.deepEqual(names, [
      "analytics_query",
      "hybrid_search",
      "report_knowledge_gap",
      "summarize",
    ]);
  });
});
