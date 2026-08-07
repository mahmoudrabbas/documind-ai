import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

import { Supervisor } from "./supervisor.js";
import { createDefaultGuardrails } from "./guardrails.js";
import { createAnalyticsTool } from "./tools/analyticsTool.js";
import { createKnowledgeGapTool } from "./tools/knowledgeGapTool.js";
import type {
  ModelAdapter,
  ModelCompletionMessage,
  ModelCompletionResponse,
  RunContext,
} from "./agents.types.js";

const CONTEXT: RunContext = {
  tenantId: "tenant-1",
  actorId: "actor-1",
  traceId: "trace-1",
  requestId: "request-1",
  workflowName: "test-workflow",
  agentName: "test-agent",
};

class StubModelAdapter implements ModelAdapter {
  readonly providerKey = "stub";
  messages: ModelCompletionMessage[] = [];
  constructor(private readonly content: string) {}

  async complete(params: {
    messages: ModelCompletionMessage[];
    tools?: Record<string, unknown>[];
    toolChoice?: string | Record<string, unknown>;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<ModelCompletionResponse> {
    void params.tools;
    void params.toolChoice;
    void params.temperature;
    void params.topP;
    void params.maxTokens;
    void params.signal;
    this.messages = params.messages;
    return {
      id: "stub-1",
      provider: "stub",
      model: "stub",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: this.content },
          finishReason: "stop",
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 1,
      estimatedCost: 0,
    };
  }
}

function availableTools() {
  return [
    createAnalyticsTool(undefined as never),
    createKnowledgeGapTool(undefined as never),
  ];
}

async function decideWith(content: string) {
  const model = new StubModelAdapter(content);
  const supervisor = new Supervisor(model, createDefaultGuardrails());
  const decision = await supervisor.decide(
    CONTEXT,
    { agentName: "test-agent", question: "كم عدد المستندات؟" },
    ["default-agent"],
    availableTools(),
  );
  return { model, decision };
}

describe("Supervisor tool catalog", () => {
  it("includes available tool names, descriptions, and input fields in the prompt", async () => {
    const { model } = await decideWith("plan: nothing");
    const userMessage = model.messages.find((m) => m.role === "user")?.content ?? "";
    assert.ok(userMessage.includes("Available tools"));
    assert.ok(userMessage.includes("analytics_query"));
    assert.ok(userMessage.includes("report_knowledge_gap"));
    assert.ok(userMessage.includes("top_queries"));
    assert.ok(userMessage.includes("input fields: metric, period"));
  });

  it("parses tool_call with a JSON input into a tool_call plan", async () => {
    const { decision } = await decideWith(
      'tool_call: analytics_query\ninput: {"metric":"top_queries","period":"week"}',
    );
    assert.equal(decision.plan.action, "tool_call");
    assert.equal(decision.plan.toolName, "analytics_query");
    assert.deepEqual(decision.plan.toolInput, {
      metric: "top_queries",
      period: "week",
    });
  });

  it("parses report_knowledge_gap input with nested JSON", async () => {
    const { decision } = await decideWith(
      'tool_call: report_knowledge_gap\ninput: {"question":"ما هي سياسة الإجازات؟","outcome":"unanswered","confidence":0.4}',
    );
    assert.equal(decision.plan.action, "tool_call");
    assert.equal(decision.plan.toolName, "report_knowledge_gap");
    assert.deepEqual(decision.plan.toolInput, {
      question: "ما هي سياسة الإجازات؟",
      outcome: "unanswered",
      confidence: 0.4,
    });
  });

  it("falls back to a legacy text input when no JSON input is present", async () => {
    const { decision } = await decideWith("tool: echo");
    assert.equal(decision.plan.action, "tool_call");
    assert.equal(decision.plan.toolName, "echo");
    assert.deepEqual(decision.plan.toolInput, { text: "tool: echo" });
  });
});
