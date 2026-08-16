import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  AGENT_EXECUTOR_NOT_FOUND,
  AGENT_HANDOFF_INVALID,
  AGENT_HANDOFF_LOOP_DETECTED,
  AGENT_MAX_HANDOFFS_EXCEEDED,
  AGENT_MAX_STEPS_EXCEEDED,
  AGENT_OUTPUT_SCHEMA_INVALID,
  AGENT_STATE_TRANSITION_INVALID,
  AGENT_TOOL_PERMISSION_DENIED,
  AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED,
  AGENT_UNREGISTERED_TOOL,
  SUPERVISOR_DECISION_INVALID,
} from "../../common/errors/errorCodes.js";
import { toAgentId } from "./agentContracts.js";
import type { AgentContract } from "./agentContract.js";
import { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import { createChatAgentRegistry, type ChatAgentId } from "./chatAgents.js";
import { createChatWorkflowRegistry } from "./chatWorkflow.js";
import { createFakeTools } from "./fakeTools.js";
import type { ModelAdapter, ModelCompletionMessage } from "./agents.types.js";
import {
  ModelAdapterSupervisorDecisionModel,
  SupervisorRuntime,
  type SupervisorDecisionModel,
  type SupervisorRunInput,
  type SupervisorToolDescriptor,
} from "./supervisorRuntime.js";
import { InMemorySupervisorPersistence } from "./supervisorPersistence.js";
import { ToolRegistry } from "./toolRegistry.js";

const SUP = "chat-supervisor";

function scriptedModel(decisions: string[]): {
  model: SupervisorDecisionModel;
  calls: string[];
  inputs: Record<string, unknown>[];
} {
  const calls: string[] = [];
  const inputs: Record<string, unknown>[] = [];
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
      inputs.push(request.input);
      return {
        content,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    },
  };
  return { model, calls, inputs };
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
  intentTokensUsed?: number;
  onIntentMaxTokens?: (maxTokens: number | undefined) => void;
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
      execute: async (context) => {
        options.onIntentMaxTokens?.(context.maxTokens);
        return {
          ok: true,
          status: "completed",
          output:
            options.intentOutput === undefined
              ? { intent: "general" }
              : options.intentOutput,
          latencyMs: 0,
          metadata:
            options.intentTokensUsed === undefined
              ? undefined
              : { tokensUsed: options.intentTokensUsed },
        };
      },
    };
    executorRegistry.register(contract);
  }

  const persistence = new InMemorySupervisorPersistence();
  persistence.seedPendingRun("run-1", "507f1f77bcf86cd799439011");
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
  it("provides the exact registered tool catalog to every decision", async () => {
    let observed: readonly SupervisorToolDescriptor[] = [];
    const model: SupervisorDecisionModel = {
      providerKey: "catalog-test",
      modelName: "catalog-test",
      async decide(request) {
        observed = request.availableTools;
        return {
          content: completeDecision({ answer: "done" }),
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      },
    };
    const { runtime } = buildHarness(model);

    const result = await runtime.execute(baseRunInput());

    assert.equal(result.status, "completed");
    assert.deepEqual(
      observed.map(({ name }) => name),
      createFakeTools().map(({ schema }) => schema.name),
    );
    assert.ok(observed.every(({ inputFields }) => Object.isFrozen(inputFields)));
  });

  it("serializes canonical tools and exact-name constraints into the provider prompt", async () => {
    let messages: ModelCompletionMessage[] = [];
    const adapter: ModelAdapter = {
      providerKey: "prompt-test",
      async complete(params) {
        messages = params.messages;
        return {
          id: "prompt-test",
          provider: "prompt-test",
          model: "prompt-test",
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: completeDecision({ answer: "done" }),
            },
            finishReason: "stop",
          }],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: 1,
          estimatedCost: 0,
        };
      },
    };
    const workflow = createChatWorkflowRegistry().require("chat-rag-v1");
    const runInput = baseRunInput();
    const model = new ModelAdapterSupervisorDecisionModel(adapter);

    await model.decide({
      context: runInput.context,
      workflow,
      currentAgent: "chat-supervisor",
      previousAgent: null,
      input: runInput.input,
      history: [],
      availableTools: [{
        name: "authorized_hybrid_search",
        description: "Authorized retrieval",
        inputFields: ["query", "documentIds", "topK"],
        requiredPermission: "documents:use-in-ai",
        approvalRequired: false,
      }],
    });

    const system = messages.find(({ role }) => role === "system")?.content ?? "";
    const user = messages.find(({ role }) => role === "user")?.content ?? "";
    assert.match(system, /Never invent, rename, or alias a tool/);
    assert.match(user, /authorized_hybrid_search/);
    assert.match(user, /documents:use-in-ai/);
    assert.match(user, /documentIds/);
  });

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

  it("passes only the remaining total-token budget to specialized agents", async () => {
    const { model } = scriptedModel([
      handoffDecision("intent-query-agent"),
    ]);
    let observedMaxTokens: number | undefined;

    const { runtime } = buildHarness(model, {
      intentTokensUsed: 7,
      onIntentMaxTokens: (maxTokens) => {
        observedMaxTokens = maxTokens;
      },
    });

    const result = await runtime.execute(
      baseRunInput({
        budgetLimits: {
          maxTotalTokens: 35,
        },
      }),
    );

    // The supervisor decision consumes 30 tokens first, so the intent
    // executor must receive only the 5 tokens still available to the run.
    assert.equal(observedMaxTokens, 5);
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED);
  });

  it("enforces maxTotalTokens against specialized-agent usage", async () => {
    const { model } = scriptedModel([
      handoffDecision("intent-query-agent"),
    ]);
    const { runtime } = buildHarness(model, {
      intentTokensUsed: 7,
    });

    const result = await runtime.execute(
      baseRunInput({
        budgetLimits: {
          maxTotalTokens: 35,
        },
      }),
    );

    // The supervisor decision consumes 30 tokens. The specialized intent
    // executor then reports 7 more, taking the shared run total to 37.
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED);
    assert.equal(result.totalTokensUsed, 37);
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
    const { runtime, persistence } = buildHarness(model);
    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "completed");
    assert.deepEqual(calls, [SUP, "intent-query-agent", SUP]);
    assert.equal(result.handoffsCount, 2);
    assert.equal(result.totalSteps, 4);

    const executionStep = Array.from(persistence.steps.values()).find(
      (s) => s.agentName === "intent-query-agent" && s.action === "execute",
    );
    assert.ok(executionStep, "expected a dedicated execute step");
    assert.equal(executionStep.status, "completed");
    assert.equal(executionStep.handoffToAgent, null);
    assert.equal(executionStep.previousAgent, null);
    assert.equal(executionStep.error, null);
    assert.deepEqual(executionStep.output, { intent: "general" });

    const handoffStep = Array.from(persistence.steps.values()).find(
      (s) => s.action === "handoff" && s.handoffToAgent === "intent-query-agent",
    );
    assert.ok(handoffStep, "expected a handoff step");
    assert.equal(handoffStep.status, "completed");
    assert.equal(handoffStep.output, null);
    assert.equal(persistence.steps.size, 4);
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

  it("merges validated agent output into state observed by later decisions", async () => {
    const { model, inputs } = scriptedModel([
      handoffDecision("intent-query-agent"),
      returnToSupervisor(),
      completeDecision({ answer: "done" }),
    ]);
    const { runtime } = buildHarness(model, {
      intentOutput: { intent: "trusted-intent" },
    });

    const result = await runtime.execute(baseRunInput());

    assert.equal(result.status, "completed");
    assert.deepEqual(inputs[1], {
      question: "hi",
      intent: "trusted-intent",
    });
    assert.equal(inputs[2]?.intent, "trusted-intent");
  });

  it("merges validated tool output without discarding prior state", async () => {
    const { model, inputs } = scriptedModel([
      toolCallDecision("echo", { text: "hello" }),
      completeDecision({ answer: "done" }),
    ]);
    const { runtime } = buildHarness(model);

    const result = await runtime.execute(baseRunInput());

    assert.equal(result.status, "completed");
    assert.deepEqual(inputs[1], { question: "hi", echoed: "hello" });
  });

  it("executes and persists resolved handoff payload instead of the proposal", async () => {
    const { model } = scriptedModel([
      JSON.stringify({
        action: "handoff",
        currentAgent: SUP,
        nextAgent: "intent-query-agent",
        reasonCode: "delegate",
        payload: { query: "model-proposal" },
      }),
      returnToSupervisor(),
      completeDecision({ answer: "done" }),
    ]);
    const { runtime, persistence } = buildHarness(model);

    const result = await runtime.execute(baseRunInput(), {
      resolveHandoffPayload: () => ({ query: "trusted-query" }),
    });

    assert.equal(result.status, "completed");
    const executionStep = Array.from(persistence.steps.values()).find(
      (step) => step.action === "execute",
    );
    assert.deepEqual(executionStep?.input, { query: "trusted-query" });
  });

  it("fails closed when resolved handoff payload is invalid", async () => {
    const { model } = scriptedModel([handoffDecision("intent-query-agent")]);
    const { runtime, persistence } = buildHarness(model);

    const result = await runtime.execute(baseRunInput(), {
      resolveHandoffPayload: () => ({ tenantId: "model-cannot-set-this" }),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_HANDOFF_INVALID);
    assert.equal(
      Array.from(persistence.steps.values()).some(
        (step) => step.action === "execute",
      ),
      false,
    );
  });

  it("executes and persists resolved tool input instead of the proposal", async () => {
    const { model, inputs } = scriptedModel([
      toolCallDecision("echo", { text: "model-proposal" }),
      completeDecision({ answer: "done" }),
    ]);
    const { runtime, persistence } = buildHarness(model);

    const result = await runtime.execute(baseRunInput(), {
      resolveToolInput: () => ({ text: "trusted-input" }),
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(Array.from(persistence.toolCalls.values())[0]?.input, {
      text: "trusted-input",
    });
    assert.equal(inputs[1]?.echoed, "trusted-input");
  });

  it("fails closed before execution when resolved tool input is invalid", async () => {
    const { model } = scriptedModel([
      toolCallDecision("echo", { text: "model-proposal" }),
    ]);
    const { runtime, persistence } = buildHarness(model);

    const result = await runtime.execute(baseRunInput(), {
      resolveToolInput: () => ({}),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, SUPERVISOR_DECISION_INVALID);
    assert.equal(persistence.toolCalls.size, 0);
  });

  it("uses a request-local resolved decision instead of a stage-invalid model proposal", async () => {
    const { model } = scriptedModel([
      completeDecision({ answer: "premature" }),
      completeDecision({ answer: "done" }),
    ]);
    const { runtime, persistence } = buildHarness(model);
    let decisionCount = 0;

    const result = await runtime.execute(baseRunInput(), {
      resolveDecision: ({ proposedDecision }) => {
        decisionCount++;
        if (decisionCount === 1) {
          return JSON.parse(
            toolCallDecision("echo", { text: "trusted-stage" }),
          );
        }
        return proposedDecision;
      },
    });

    assert.equal(result.status, "completed");
    assert.equal(decisionCount, 2);
    assert.equal(Array.from(persistence.toolCalls.values())[0]?.toolName, "echo");
    assert.deepEqual(result.output, { answer: "done" });
  });

  it("uses a trusted pre-model decision without invoking the supervisor provider", async () => {
    const { model, calls } = scriptedModel([
      completeDecision({ answer: "must not be consulted" }),
    ]);
    const { runtime } = buildHarness(model);
    const result = await runtime.execute(baseRunInput(), {
      resolveDecisionBeforeModel: ({ currentAgent }) => ({
        action: "complete",
        currentAgent: currentAgent as ChatAgentId,
        nextAgent: null,
        result: { answer: "trusted" },
        reasonCode: "TRUSTED_STAGE",
      }),
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(result.output, { answer: "trusted" });
    assert.equal(calls.length, 0);
    assert.equal(result.totalTokensUsed, 0);
  });

  it("fails closed when a decision resolver returns an invalid decision", async () => {
    const { model } = scriptedModel([completeDecision({ answer: "proposal" })]);
    const { runtime } = buildHarness(model);

    const result = await runtime.execute(baseRunInput(), {
      resolveDecision: () => ({ action: "unknown" } as never),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, SUPERVISOR_DECISION_INVALID);
  });

  it("returns and persists only the resolved complete result", async () => {
    const { model } = scriptedModel([
      completeDecision({ answer: "forged-model-answer" }),
    ]);
    const { runtime, persistence } = buildHarness(model);

    const result = await runtime.execute(baseRunInput(), {
      resolveCompleteResult: () => ({ answer: "trusted-answer" }),
    });

    assert.deepEqual(result.output, { answer: "trusted-answer" });
    assert.deepEqual(persistence.runs.get("run-1")?.output, {
      answer: "trusted-answer",
    });
    const completedStep = Array.from(persistence.steps.values()).find(
      (step) => step.action === "completed",
    );
    assert.deepEqual(completedStep?.output, { answer: "trusted-answer" });
  });

  it("fails closed when the complete-result resolver rejects", async () => {
    const { model } = scriptedModel([completeDecision({ answer: "forged" })]);
    const { runtime } = buildHarness(model);

    const result = await runtime.execute(baseRunInput(), {
      resolveCompleteResult: () => {
        throw new Error("No trusted terminal authority");
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.output, null);
    assert.equal(result.error?.code, "AGENT_PROVIDER_ERROR");
  });

  it("passes only schema-validated successful tool output to onToolResult", async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      schema: {
        name: "safe-output",
        version: "1.0.0",
        description: "Returns an output with an extra field.",
        inputSchema: z.object({}),
        outputSchema: z.object({ kept: z.string() }),
      },
      handler: async () => ({ kept: "yes", secret: "must-be-stripped" }),
    });
    const { model } = scriptedModel([
      toolCallDecision("safe-output", {}),
      completeDecision({ answer: "done" }),
    ]);
    const { runtime } = buildHarness(model, { toolRegistry });
    const observed: Record<string, unknown>[] = [];

    const result = await runtime.execute(baseRunInput(), {
      onToolResult: ({ validatedOutput }) => observed.push(validatedOutput),
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(observed, [{ kept: "yes" }]);
  });

  it("does not invoke onToolResult after failed tool execution", async () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      schema: {
        name: "expected-failure",
        version: "1.0.0",
        description: "Fails during execution.",
        inputSchema: z.object({}),
        outputSchema: z.object({ ok: z.literal(true) }),
      },
      handler: async () => {
        throw new Error("Expected tool failure");
      },
    });
    const { model } = scriptedModel([
      toolCallDecision("expected-failure", {}),
    ]);
    const { runtime } = buildHarness(model, { toolRegistry });
    let callbackCount = 0;

    const result = await runtime.execute(baseRunInput(), {
      onToolResult: () => {
        callbackCount++;
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(callbackCount, 0);
  });

  it("keeps hooks isolated across concurrent and sequential executions", async () => {
    const model: SupervisorDecisionModel = {
      providerKey: "fake",
      modelName: "request-aware",
      async decide(request) {
        return {
          content: completeDecision({ proposal: request.context.requestId }),
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    };
    const { runtime, persistence } = buildHarness(model);
    persistence.seedPendingRun("run-2", "507f1f77bcf86cd799439011");
    persistence.seedPendingRun("run-3", "507f1f77bcf86cd799439011");

    const [first, second] = await Promise.all([
      runtime.execute(baseRunInput(), {
        resolveCompleteResult: () => ({ authority: "first" }),
      }),
      runtime.execute(
        baseRunInput({
          runId: "run-2",
          context: {
            ...baseRunInput().context,
            requestId: "req-2",
            traceId: "trace-2",
          },
        }),
        { resolveCompleteResult: () => ({ authority: "second" }) },
      ),
    ]);
    const third = await runtime.execute(
      baseRunInput({
        runId: "run-3",
        context: {
          ...baseRunInput().context,
          requestId: "req-3",
          traceId: "trace-3",
        },
      }),
    );

    assert.deepEqual(first.output, { authority: "first" });
    assert.deepEqual(second.output, { authority: "second" });
    assert.deepEqual(third.output, { proposal: "req-3" });
  });

  it("requires an existing pending AgentRun and starts it exactly once", async () => {
    const { model } = scriptedModel([completeDecision({ answer: "done" })]);
    const { runtime, persistence } = buildHarness(model);
    const originalStartRun = persistence.startRun.bind(persistence);
    let startCount = 0;
    persistence.startRun = (...args) => {
      startCount++;
      return originalStartRun(...args);
    };

    const completed = await runtime.execute(baseRunInput());

    assert.equal(completed.status, "completed");
    assert.equal(startCount, 1);
    assert.equal("createRun" in runtime, false);

    await assert.rejects(
      runtime.execute(baseRunInput({ runId: "missing-run" })),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === AGENT_STATE_TRANSITION_INVALID,
    );
    assert.equal(startCount, 2);
    assert.equal(
      Array.from(persistence.steps.values()).some(
        (step) => step.runId === "missing-run",
      ),
      false,
    );
  });

  it("counts supervisor and specialized-agent tokens exactly once", async () => {
    const { model } = scriptedModel([
      handoffDecision("intent-query-agent"),
      returnToSupervisor(),
      completeDecision({ answer: "done" }),
    ]);
    const { runtime, persistence } = buildHarness(model, {
      intentTokensUsed: 7,
    });

    const result = await runtime.execute(baseRunInput());

    assert.equal(result.totalTokensUsed, 97);
    assert.equal(persistence.runs.get("run-1")?.totalTokensUsed, 97);
    const executionStep = Array.from(persistence.steps.values()).find(
      (step) => step.action === "execute",
    );
    assert.equal(executionStep?.tokensUsed, 7);
  });
});
