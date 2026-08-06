import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  AGENT_EXECUTOR_NOT_FOUND,
  AGENT_HANDOFF_LOOP_DETECTED,
  AGENT_MAX_HANDOFFS_EXCEEDED,
  AGENT_MAX_STEPS_EXCEEDED,
  AGENT_OUTPUT_SCHEMA_INVALID,
  AGENT_TOOL_PERMISSION_DENIED,
  AGENT_UNREGISTERED_TOOL,
  SUPERVISOR_DECISION_INVALID,
} from "../../common/errors/errorCodes.js";
import { toAgentId } from "./agentContracts.js";
import type { AgentContract } from "./agentContract.js";
import { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import { createChatAgentRegistry } from "./chatAgents.js";
import { createChatWorkflowRegistry } from "./chatWorkflow.js";
import { createFakeTools } from "./fakeTools.js";
import { SupervisorRuntime, type SupervisorDecisionModel, type SupervisorRunInput } from "./supervisorRuntime.js";
import { InMemorySupervisorPersistence } from "./supervisorPersistence.js";
import { ToolRegistry } from "./toolRegistry.js";

const SUP = "chat-supervisor";

function scriptedModel(decisions: string[]): {
  model: SupervisorDecisionModel;
  calls: string[];
} {
  const calls: string[] = [];
  let index = 0;
  const model: SupervisorDecisionModel = {
    providerKey: "fake",
    modelName: "fake-scripted",
    async decide(request) {
      if (index >= decisions.length) {
        throw new Error(`Script exhausted at decision ${index}`);
      }
      const content = decisions[index];
      index++;
      calls.push(request.currentAgent);
      return {
        content,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    },
  };
  return { model, calls };
}

function handoffDecision(nextAgent: string): string {
  return JSON.stringify({
    action: "handoff",
    currentAgent: SUP,
    nextAgent,
    reasonCode: "delegate",
    payload: {},
  });
}

function returnToSupervisor(): string {
  return JSON.stringify({
    action: "handoff",
    currentAgent: "intent-query-agent",
    nextAgent: SUP,
    reasonCode: "return",
    payload: {},
  });
}

function toolCallDecision(toolName: string, toolInput: Record<string, unknown>): string {
  return JSON.stringify({
    action: "tool_call",
    currentAgent: SUP,
    toolName,
    toolInput,
    reasonCode: "use-tool",
  });
}

function completeDecision(result: Record<string, unknown>): string {
  return JSON.stringify({
    action: "complete",
    currentAgent: SUP,
    result,
    reasonCode: "done",
  });
}

function baseRunInput(overrides: Partial<SupervisorRunInput> = {}): SupervisorRunInput {
  return {
    runId: "run-1",
    workflowId: "chat-rag-v1",
    context: {
      requestId: "req-1",
      traceId: "trace-1",
      tenantId: "507f1f77bcf86cd799439011",
      actorId: "507f1f77bcf86cd799439012",
      actorRole: "EMPLOYEE",
      actorEmail: "marco@example.com",
      conversationId: "507f1f77bcf86cd799439013",
      workflowId: "chat-rag-v1",
      permissions: ["agents:tools:echo:use", "agents:approval:request"],
    },
    input: { question: "hi" },
    ...overrides,
  };
}

interface HarnessOptions {
  withIntentExecutor?: boolean;
  intentOutput?: unknown;
  toolRegistry?: ToolRegistry;
}

function buildHarness(
  model: SupervisorDecisionModel,
  options: HarnessOptions = {},
): { runtime: SupervisorRuntime; persistence: InMemorySupervisorPersistence } {
  const toolRegistry =
    options.toolRegistry ??
    (() => {
      const registry = new ToolRegistry();
      for (const tool of createFakeTools()) {
        registry.register(tool);
      }
      return registry;
    })();

  const executorRegistry = new AgentExecutorRegistry(createChatAgentRegistry());
  if (options.withIntentExecutor !== false) {
    const contract: AgentContract = {
      id: toAgentId("intent-query-agent"),
      version: "1.0.0",
      capabilities: ["read", "search"] as const,
      inputSchema: z.object({ query: z.string().optional() }),
      outputSchema: z.object({ intent: z.string() }),
      execute: async () => ({
        ok: true,
        status: "completed",
        output:
          options.intentOutput === undefined
            ? { intent: "general" }
            : options.intentOutput,
        latencyMs: 0,
      }),
    };
    executorRegistry.register(contract);
  }

  const persistence = new InMemorySupervisorPersistence();
  const runtime = new SupervisorRuntime({
    model,
    workflowRegistry: createChatWorkflowRegistry(),
    executorRegistry,
    toolRegistry,
    persistence,
  });
  return { runtime, persistence };
}

describe("SupervisorRuntime", () => {
  it("completes a run on a complete decision", async () => {
    const { model } = scriptedModel([completeDecision({ answer: "done" })]);
    const { runtime, persistence } = buildHarness(model);
    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "completed");
    assert.deepEqual(result.output, { answer: "done" });
    assert.equal(result.error, null);
    assert.equal(result.totalSteps, 1);
    assert.equal(persistence.runs.get("run-1")?.status, "completed");
  });

  it("fails a run on a fail decision with the decision error code", async () => {
    const { model } = scriptedModel([
      JSON.stringify({
        action: "fail",
        currentAgent: SUP,
        reasonCode: "cannot-proceed",
        error: { code: "AGENT_CUSTOM_FAILURE", message: "cannot proceed" },
      }),
    ]);
    const { runtime } = buildHarness(model);
    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, "AGENT_CUSTOM_FAILURE");
    assert.equal(result.error?.message, "cannot proceed");
  });

  it("fails closed on a malformed prose decision", async () => {
    const { model } = scriptedModel([
      "I think we should just complete with the answer now.",
    ]);
    const { runtime } = buildHarness(model);
    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, SUPERVISOR_DECISION_INVALID);
    assert.equal(result.guardrailResult?.blocked, true);
  });

  it("fails closed when the decision currentAgent mismatches the acting agent", async () => {
    const { model } = scriptedModel([
      JSON.stringify({
        action: "complete",
        currentAgent: "intent-query-agent",
        result: {},
        reasonCode: "done",
      }),
    ]);
    const { runtime } = buildHarness(model);
    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, SUPERVISOR_DECISION_INVALID);
  });

  it("runs a tool call then completes, recording tool usage", async () => {
    const { model } = scriptedModel([
      toolCallDecision("echo", { text: "hello" }),
      completeDecision({ answer: "hello" }),
    ]);
    const { runtime, persistence } = buildHarness(model);
    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "completed");
    assert.equal(result.totalSteps, 2);
    assert.equal(result.totalToolCalls, 1);
    assert.equal(persistence.toolCalls.size, 1);
    const toolCall = Array.from(persistence.toolCalls.values())[0];
    assert.equal(toolCall.status, "completed");
  });

  it("denies a tool_call to an unregistered tool", async () => {
    const { model } = scriptedModel([
      toolCallDecision("nonexistent-tool", {}),
    ]);
    const { runtime } = buildHarness(model);
    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_UNREGISTERED_TOOL);
  });

  it("denies a tool_call when the required permission is missing", async () => {
    const { model } = scriptedModel([
      toolCallDecision("echo", { text: "hi" }),
    ]);
    const { runtime } = buildHarness(model, {
      withIntentExecutor: false,
      toolRegistry: (() => {
        const registry = new ToolRegistry();
        for (const tool of createFakeTools()) {
          registry.register(tool);
        }
        return registry;
      })(),
    });
    const input = baseRunInput();
    input.context = {
      ...input.context,
      permissions: [],
    };
    const result = await runtime.execute(input);
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_TOOL_PERMISSION_DENIED);
  });

  it("requests approval for a sensitive tool and awaits it", async () => {
    const { model } = scriptedModel([
      toolCallDecision("request_approval", { reason: "release", details: {} }),
    ]);
    const { runtime, persistence } = buildHarness(model);
    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "awaiting_approval");
    assert.equal(result.approvalsCount, 1);
    assert.equal(persistence.approvals.size, 1);
    const approval = Array.from(persistence.approvals.values())[0];
    assert.equal(approval.status, "pending");
  });

  it("awaits approval on an await_approval decision", async () => {
    const { model } = scriptedModel([
      JSON.stringify({
        action: "await_approval",
        currentAgent: SUP,
        reasonCode: "approve-release",
        approval: {
          action: "release_answer",
          requiredRole: "COMPANY_ADMIN",
        },
      }),
    ]);
    const { runtime, persistence } = buildHarness(model);
    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "awaiting_approval");
    assert.equal(result.approvalsCount, 1);
    assert.equal(persistence.approvals.size, 1);
  });

  it("executes a handoff target then returns to the supervisor", async () => {
    const { model, calls } = scriptedModel([
      handoffDecision("intent-query-agent"),
      returnToSupervisor(),
      completeDecision({ answer: "done" }),
    ]);
    const { runtime } = buildHarness(model);
    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "completed");
    assert.deepEqual(calls, [SUP, "intent-query-agent", SUP]);
    assert.equal(result.handoffsCount, 2);
    assert.equal(result.totalSteps, 3);
  });

  it("fails closed when the handoff target has no executor", async () => {
    const { model } = scriptedModel([handoffDecision("intent-query-agent")]);
    const { runtime } = buildHarness(model, { withIntentExecutor: false });
    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_EXECUTOR_NOT_FOUND);
  });

  it("fails closed when the executor output violates its output schema", async () => {
    const { model } = scriptedModel([handoffDecision("intent-query-agent")]);
    const { runtime } = buildHarness(model, { intentOutput: { nope: 1 } });
    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_OUTPUT_SCHEMA_INVALID);
  });

  it("detects a handoff cycle and fails the run", async () => {
    const { model } = scriptedModel([
      handoffDecision("intent-query-agent"),
      returnToSupervisor(),
      handoffDecision("intent-query-agent"),
    ]);
    const { runtime } = buildHarness(model);
    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_HANDOFF_LOOP_DETECTED);
  });

  it("denies a handoff when the handoff budget is exhausted", async () => {
    const { model } = scriptedModel([
      handoffDecision("intent-query-agent"),
      returnToSupervisor(),
    ]);
    const { runtime } = buildHarness(model);
    const result = await runtime.execute(
      baseRunInput({ budgetLimits: { maxHandoffs: 1 } }),
    );
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_MAX_HANDOFFS_EXCEEDED);
  });

  it("fails the run when the step budget is exhausted", async () => {
    const { model } = scriptedModel([toolCallDecision("echo", { text: "hi" })]);
    const { runtime } = buildHarness(model);
    const result = await runtime.execute(
      baseRunInput({ budgetLimits: { maxSteps: 1 } }),
    );
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_MAX_STEPS_EXCEEDED);
    assert.equal(result.totalSteps, 2);
  });
});
