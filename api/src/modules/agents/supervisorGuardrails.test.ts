import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  AGENT_HANDOFF_INVALID,
  AGENT_HANDOFF_LOOP_DETECTED,
  AGENT_INPUT_TOO_LARGE,
  AGENT_MAX_HANDOFFS_EXCEEDED,
  AGENT_OUTPUT_SCHEMA_INVALID,
  AGENT_TOOL_PERMISSION_DENIED,
  AGENT_UNREGISTERED_TOOL,
  AGENT_WORKFLOW_NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import { normalizeAgentExecutionContext, type AgentExecutionContext } from "./agentExecutionContext.js";
import { chatRagV1Definition } from "./chatWorkflow.js";
import type { ChatWorkflowDefinition } from "./chatWorkflow.js";
import type { AgentBudget, AgentBudgetCounters } from "./supervisorBudgets.js";
import { resolveAgentBudget } from "./supervisorBudgets.js";
import {
  createDefaultSupervisorGuardrails,
  SupervisorGuardrailEvaluator,
  type SupervisorGuardrail,
  type SupervisorGuardrailContext,
  type SupervisorGuardrailOutcome,
} from "./supervisorGuardrails.js";
import { ToolRegistry } from "./toolRegistry.js";
import { createFakeTools } from "./fakeTools.js";

const workflow: ChatWorkflowDefinition = chatRagV1Definition();

const executionContext = normalizeAgentExecutionContext({
  requestId: "req-1",
  traceId: "trace-1",
  tenantId: "64b1b1b1b1b1b1b1b1b1b1b1",
  actorId: "64b1b1b1b1b1b1b1b1b1b1b2",
  actorRole: "EMPLOYEE",
  conversationId: "64b1b1b1b1b1b1b1b1b1b1b3",
  workflowId: "chat-rag-v1",
  permissions: ["agents:tools:echo:use"],
});

const budget: AgentBudget = resolveAgentBudget({});

function counters(
  overrides: Partial<AgentBudgetCounters> = {},
): AgentBudgetCounters {
  return {
    steps: 0,
    handoffs: 0,
    toolCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    ...overrides,
  };
}

function baseContext(
  overrides: Partial<SupervisorGuardrailContext> = {},
): SupervisorGuardrailContext {
  return {
    context: executionContext,
    workflow,
    currentAgent: "chat-supervisor",
    previousAgent: null,
    input: { question: "Hello" },
    visitedAgents: ["chat-supervisor"],
    transitionPairs: new Set(),
    handoffCount: 0,
    budget,
    budgetCounters: counters(),
    deadlineExceeded: false,
    ...overrides,
  };
}

async function outcomesOf(
  guardrails: SupervisorGuardrail[],
  ctx: SupervisorGuardrailContext,
): Promise<SupervisorGuardrailOutcome[]> {
  const evaluator = new SupervisorGuardrailEvaluator(guardrails);
  return evaluator.evaluate(ctx);
}

describe("supervisor guardrails", () => {
  it("includes the full deterministic guardrail set by default", () => {
    const guardrails = createDefaultSupervisorGuardrails();
    const names = guardrails.map((g) => g.name).sort();
    assert.deepEqual(names, [
      "actor_identity",
      "agent_valid",
      "budget",
      "handoff_count",
      "handoff_cycle",
      "handoff_target_valid",
      "input_payload_size",
      "output_payload_size",
      "output_schema",
      "sensitive_action",
      "tenant_identity",
      "timeout",
      "tool_permission",
      "tool_valid",
      "workflow_valid",
    ]);
    assert.ok(guardrails.every((g) => typeof g.priority === "number"));
  });

  it("prioritizes tenant and actor identity above all other guardrails", () => {
    const guardrails = createDefaultSupervisorGuardrails();
    const sorted = [...guardrails].sort((a, b) => b.priority - a.priority);
    const topTwo = sorted.slice(0, 2).map((g) => g.name).sort();
    assert.deepEqual(topTwo, ["actor_identity", "tenant_identity"]);
    assert.ok(sorted.every((g) => g.priority <= 1000));
  });


  it("allows a valid handoff target within the approved graph", async () => {
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({ nextAgent: "intent-query-agent" }),
    );
    assert.equal(outcomes.every((o) => o.decision === "allow"), true);
  });

  it("denies a handoff target that is not in the approved allowedHandoffs", async () => {
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({
        currentAgent: "intent-query-agent",
        nextAgent: "compliance-agent",
        transitionPairs: new Set(["chat-supervisor->intent-query-agent"]),
        visitedAgents: ["chat-supervisor", "intent-query-agent"],
      }),
    );
    const denial = outcomes.find((o) => o.decision === "deny");
    assert.ok(denial);
    assert.equal(denial!.guardrailName, "handoff_target_valid");
    assert.equal(denial!.reasonCode, AGENT_HANDOFF_INVALID);
  });

  it("denies a handoff that is not in the approved allowedHandoffs", async () => {
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({
        currentAgent: "answer-writer-agent",
        nextAgent: "compliance-agent",
        transitionPairs: new Set(["chat-supervisor->answer-writer-agent"]),
        visitedAgents: ["chat-supervisor", "answer-writer-agent"],
      }),
    );
    const denial = outcomes.find((o) => o.decision === "deny");
    assert.ok(denial);
    assert.equal(denial!.guardrailName, "handoff_target_valid");
  });

  it("denies repeated transition pairs (cycle detection)", async () => {
    const pairs = new Set(["chat-supervisor->intent-query-agent"]);
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({
        nextAgent: "intent-query-agent",
        transitionPairs: pairs,
      }),
    );
    const denial = outcomes.find((o) => o.decision === "deny");
    assert.ok(denial);
    assert.equal(denial!.guardrailName, "handoff_cycle");
    assert.equal(denial!.reasonCode, AGENT_HANDOFF_LOOP_DETECTED);
  });

  it("allows a bounded A->B->A return without false-positive cycles", async () => {
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({
        currentAgent: "intent-query-agent",
        nextAgent: "chat-supervisor",
        transitionPairs: new Set(["chat-supervisor->intent-query-agent"]),
        visitedAgents: ["chat-supervisor", "intent-query-agent"],
      }),
    );
    assert.equal(outcomes.every((o) => o.decision === "allow"), true);
  });

  it("denies when the handoff count limit is reached", async () => {
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({
        nextAgent: "intent-query-agent",
        handoffCount: budget.maxHandoffs,
      }),
    );
    const denial = outcomes.find((o) => o.decision === "deny");
    assert.ok(denial);
    assert.equal(denial!.reasonCode, AGENT_MAX_HANDOFFS_EXCEEDED);
  });

  it("denies an unregistered tool", async () => {
    const toolRegistry = new ToolRegistry();
    for (const tool of createFakeTools()) toolRegistry.register(tool);
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails({ toolRegistry }),
      baseContext({ toolName: "not-a-tool" }),
    );
    const denial = outcomes.find((o) => o.decision === "deny");
    assert.ok(denial);
    assert.equal(denial!.guardrailName, "tool_valid");
    assert.equal(denial!.reasonCode, AGENT_UNREGISTERED_TOOL);
  });

  it("denies a tool when the caller lacks the required permission", async () => {
    const toolRegistry = new ToolRegistry();
    for (const tool of createFakeTools()) toolRegistry.register(tool);
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails({ toolRegistry }),
      baseContext({
        toolName: "echo",
        toolPermission: "agents:tools:echo:use",
      }),
    );
    assert.equal(outcomes.every((o) => o.decision === "allow"), true);

    const denied = await outcomesOf(
      createDefaultSupervisorGuardrails({ toolRegistry }),
      baseContext({
        toolName: "reverse",
        toolPermission: "some:other:permission",
      }),
    );
    const denial = denied.find((o) => o.decision === "deny");
    assert.ok(denial);
    assert.equal(denial!.guardrailName, "tool_permission");
    assert.equal(denial!.reasonCode, AGENT_TOOL_PERMISSION_DENIED);
  });

  it("requires approval for a sensitive action", async () => {
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({ toolName: "request_approval" }),
    );
    const approval = outcomes.find(
      (o) => o.decision === "require_approval",
    );
    assert.ok(approval);
    assert.equal(approval!.guardrailName, "sensitive_action");
    assert.equal(approval!.approvalRequired, true);
  });

  it("requires approval when a tool is marked approvalRequired", async () => {
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({ toolName: "echo", toolApprovalRequired: true }),
    );
    const approval = outcomes.find(
      (o) => o.decision === "require_approval",
    );
    assert.ok(approval);
    assert.equal(approval!.approvalRequired, true);
  });

  it("denies an oversized input payload", async () => {
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({ input: { blob: "x".repeat(60_000) } }),
    );
    const denial = outcomes.find((o) => o.decision === "deny");
    assert.ok(denial);
    assert.equal(denial!.guardrailName, "input_payload_size");
    assert.equal(denial!.reasonCode, AGENT_INPUT_TOO_LARGE);
  });

  it("denies executor output that fails the output schema", async () => {
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({
        executorOutput: { nope: 1 },
        outputSchema: z.object({ answer: z.string() }),
      }),
    );
    const denial = outcomes.find((o) => o.decision === "deny");
    assert.ok(denial);
    assert.equal(denial!.guardrailName, "output_schema");
    assert.equal(denial!.reasonCode, AGENT_OUTPUT_SCHEMA_INVALID);
  });

  it("denies an oversized request output payload", async () => {
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({ requestOutput: { blob: "x".repeat(110_000) } }),
    );
    const denial = outcomes.find((o) => o.decision === "deny");
    assert.ok(denial);
    assert.equal(denial!.guardrailName, "output_payload_size");
  });

  it("denies a malformed or unknown workflow", async () => {
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({ workflow: undefined as unknown as ChatWorkflowDefinition }),
    );
    const denial = outcomes.find((o) => o.decision === "deny");
    assert.ok(denial);
    assert.equal(denial!.guardrailName, "workflow_valid");
    assert.equal(denial!.reasonCode, AGENT_WORKFLOW_NOT_FOUND);
  });

  it("denies when the budget is exhausted", async () => {
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({ budgetCounters: counters({ steps: budget.maxSteps }) }),
    );
    const denial = outcomes.find((o) => o.decision === "deny");
    assert.ok(denial);
    assert.equal(denial!.guardrailName, "budget");
  });

  it("denies when the deadline has passed", async () => {
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({ deadlineExceeded: true }),
    );
    const denial = outcomes.find((o) => o.decision === "deny");
    assert.ok(denial);
    assert.equal(denial!.guardrailName, "timeout");
  });

  it("denies when tenant identity is missing", async () => {
    const fakeContext = {
      ...executionContext,
    } as unknown as AgentExecutionContext;
    const noTenant = new Proxy(fakeContext, {
      get(target, prop) {
        if (prop === "tenantId") return undefined;
        return Reflect.get(target, prop);
      },
    }) as unknown as AgentExecutionContext;
    const outcomes = await outcomesOf(
      createDefaultSupervisorGuardrails(),
      baseContext({ context: noTenant }),
    );
    const denial = outcomes.find((o) => o.decision === "deny");
    assert.ok(denial);
    assert.equal(denial!.guardrailName, "tenant_identity");
  });

  it("stops evaluating guardrails at the first deny", async () => {
    let reached = false;
    const probe: SupervisorGuardrail = {
      name: "probe",
      priority: 10,
      evaluate() {
        reached = true;
        return {
          guardrailName: "probe",
          decision: "allow",
          reasonCode: "GUARDRAIL_ALLOWED",
          approvalRequired: false,
          evaluatedAt: new Date().toISOString(),
        };
      },
    };
    const evaluator = new SupervisorGuardrailEvaluator([
      ...createDefaultSupervisorGuardrails(),
      probe,
    ]);
    const outcomes = await evaluator.evaluate(
      baseContext({ nextAgent: "intruder" as never }),
    );
    assert.ok(outcomes.some((o) => o.decision === "deny"));
    assert.equal(reached, false);
  });

  it("exposes evaluator helpers to find denials and approvals", async () => {
    const toolRegistry = new ToolRegistry();
    for (const tool of createFakeTools()) {
      toolRegistry.register(tool);
    }
    const evaluator = new SupervisorGuardrailEvaluator(
      createDefaultSupervisorGuardrails({ toolRegistry }),
    );
    const denied = await evaluator.evaluate(
      baseContext({ toolName: "not-a-tool" }),
    );
    assert.ok(evaluator.findDenial(denied));
    const approved = await evaluator.evaluate(
      baseContext({ toolName: "request_approval" }),
    );
    assert.ok(evaluator.findApprovalRequired(approved));
  });
});
