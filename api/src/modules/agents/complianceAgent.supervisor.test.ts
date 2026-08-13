import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toAgentId } from "./agentContracts.js";
import { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import { createChatAgentRegistry } from "./chatAgents.js";
import { createChatWorkflowRegistry } from "./chatWorkflow.js";
import { createFakeTools } from "./fakeTools.js";
import {
  COMPLIANCE_AGENT_ID,
  registerComplianceAgentExecutor,
} from "./complianceAgent.js";
import { evaluateCompliance } from "./compliance.service.js";
import { InMemorySupervisorPersistence } from "./supervisorPersistence.js";
import { SupervisorRuntime, type SupervisorDecisionModel, type SupervisorRunInput } from "./supervisorRuntime.js";
import { ToolRegistry } from "./toolRegistry.js";

const SUP = "chat-supervisor";
const TENANT_ID = "507f1f77bcf86cd799439011";
const ACTOR_ID = "507f1f77bcf86cd799439012";
const CONVERSATION_ID = "507f1f77bcf86cd799439013";

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

function handoffToCompliance(payload: Record<string, unknown>): string {
  return JSON.stringify({
    action: "handoff",
    currentAgent: SUP,
    nextAgent: COMPLIANCE_AGENT_ID,
    reasonCode: "verify-compliance",
    payload,
  });
}

function returnToSupervisor(): string {
  return JSON.stringify({
    action: "handoff",
    currentAgent: COMPLIANCE_AGENT_ID,
    nextAgent: SUP,
    reasonCode: "return",
    payload: {},
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
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      actorRole: "EMPLOYEE",
      actorEmail: "marco@example.com",
      conversationId: CONVERSATION_ID,
      workflowId: "chat-rag-v1",
      permissions: [],
    },
    input: { question: "What is the remote work policy?" },
    ...overrides,
  };
}

function buildHarness(
  model: SupervisorDecisionModel,
): { runtime: SupervisorRuntime; persistence: InMemorySupervisorPersistence } {
  const toolRegistry = new ToolRegistry();
  for (const tool of createFakeTools()) {
    toolRegistry.register(tool);
  }

  const executorRegistry = new AgentExecutorRegistry(createChatAgentRegistry());
  registerComplianceAgentExecutor(executorRegistry, { evaluate: evaluateCompliance });

  const persistence = new InMemorySupervisorPersistence();
  persistence.seedPendingRun("run-1", TENANT_ID);
  const runtime = new SupervisorRuntime({
    model,
    workflowRegistry: createChatWorkflowRegistry(),
    executorRegistry,
    toolRegistry,
    persistence,
  });
  return { runtime, persistence };
}

describe("SupervisorRuntime + compliance-agent integration", () => {
  it("persists a deterministic compliance step with null model fields", async () => {
    const { model, calls } = scriptedModel([
      handoffToCompliance({
        route: "rag",
        answerDecision: "grounded_answer",
        answer: "The leave policy grants 30 days of paid leave per year.",
        language: "en",
        citationsEnabled: true,
        citationVerification: {
          verified: true,
          validatedCitationIds: ["chunk_42"],
          reasonCode: "CITATIONS_VERIFIED",
        },
      }),
      returnToSupervisor(),
      completeDecision({ answerText: "done" }),
    ]);
    const { runtime, persistence } = buildHarness(model);

    const result = await runtime.execute(baseRunInput());

    assert.equal(result.status, "completed");
    assert.equal(result.handoffsCount, 2);
    assert.equal(result.totalSteps, 4);
    assert.deepEqual(calls, [SUP, COMPLIANCE_AGENT_ID, SUP]);
    assert.equal(result.totalTokensUsed, 90, "only supervisor decisions consume tokens");

    const executionStep = Array.from(persistence.steps.values()).find(
      (step) => step.action === "execute" && step.agentName === COMPLIANCE_AGENT_ID,
    );
    assert.ok(executionStep, "compliance execution step was persisted");
    assert.equal(executionStep.status, "completed");
    assert.equal(executionStep.handoffToAgent, null);
    assert.equal(executionStep.previousAgent, null);

    assert.equal(executionStep.modelProvider, null);
    assert.equal(executionStep.modelName, null);
    assert.equal(executionStep.promptVersion, null);
    assert.equal(executionStep.tokensUsed, null);
    assert.equal(executionStep.estimatedCost, null);
    assert.equal(typeof executionStep.latencyMs, "number");
    assert.ok((executionStep.latencyMs as number) >= 0);

    const output = executionStep.output as Record<string, unknown>;
    assert.equal(output.action, "release");
    assert.equal(output.reasonCode, "COMPLIANT_GROUNDED_RESPONSE");
    assert.equal(output.answer, "The leave policy grants 30 days of paid leave per year.");
    assert.deepEqual(output.sourceIds, ["chunk_42"]);
  });

  it("refuses insufficient_evidence with deterministic message, no model metadata", async () => {
    const { model } = scriptedModel([
      handoffToCompliance({
        route: "rag",
        answerDecision: "insufficient_evidence",
        answer: "partial leak",
        language: "en",
        citationsEnabled: true,
      }),
      returnToSupervisor(),
      completeDecision({ answerText: "done" }),
    ]);
    const { runtime, persistence } = buildHarness(model);

    const result = await runtime.execute(baseRunInput());

    assert.equal(result.status, "completed");
    assert.equal(result.totalTokensUsed, 90);

    const executionStep = Array.from(persistence.steps.values()).find(
      (step) => step.action === "execute" && step.agentName === COMPLIANCE_AGENT_ID,
    );
    assert.ok(executionStep);
    assert.equal(executionStep.modelProvider, null);
    assert.equal(executionStep.tokensUsed, null);
    const output = executionStep.output as Record<string, unknown>;
    assert.equal(output.action, "refuse");
    assert.equal(output.reasonCode, "INSUFFICIENT_EVIDENCE");
    assert.ok(typeof output.answer === "string" && output.answer.length > 0);
    assert.deepEqual(output.sourceIds, []);
  });

  it("registers the compliance agent under its approved id", () => {
    const registry = new AgentExecutorRegistry(createChatAgentRegistry());
    registerComplianceAgentExecutor(registry, { evaluate: evaluateCompliance });
    const contract = registry.requireExecutor(COMPLIANCE_AGENT_ID);
    assert.equal(contract.id, toAgentId(COMPLIANCE_AGENT_ID));
    assert.equal(contract.version, "1.0.0");
    assert.deepEqual(contract.capabilities, ["read", "sensitive_execute"]);
  });

  it("refuses unverified grounded even with citations disabled, persists completed step", async () => {
    const { model } = scriptedModel([
      handoffToCompliance({
        route: "rag",
        answerDecision: "grounded_answer",
        answer: "The leave policy grants 30 days of paid leave per year.",
        language: "en",
        citationsEnabled: false,
        citationVerification: {
          verified: false,
          validatedCitationIds: [],
          reasonCode: "MISSING_CITATIONS",
        },
      }),
      returnToSupervisor(),
      completeDecision({ answerText: "done" }),
    ]);
    const { runtime, persistence } = buildHarness(model);

    const result = await runtime.execute(baseRunInput());

    assert.equal(result.status, "completed");
    assert.equal(result.totalTokensUsed, 90);

    const executionStep = Array.from(persistence.steps.values()).find(
      (step) => step.action === "execute" && step.agentName === COMPLIANCE_AGENT_ID,
    );
    assert.ok(executionStep);
    assert.equal(executionStep.status, "completed");
    assert.equal(executionStep.modelProvider, null);
    assert.equal(executionStep.tokensUsed, null);
    const output = executionStep.output as Record<string, unknown>;
    assert.equal(output.action, "refuse");
    assert.equal(output.reasonCode, "UNVERIFIED_GROUNDED_RESPONSE");
    assert.ok(typeof output.answer === "string" && output.answer.length > 0);
    assert.deepEqual(output.sourceIds, []);
  });
});
