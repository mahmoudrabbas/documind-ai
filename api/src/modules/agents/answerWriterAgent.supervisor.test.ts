import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";
import type { DocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
import { toAgentId } from "./agentContracts.js";
import { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import { AnswerWriterService, insufficientEvidenceMessage } from "./answerWriter.service.js";
import { createChatAgentRegistry } from "./chatAgents.js";
import { createChatWorkflowRegistry } from "./chatWorkflow.js";
import { createFakeTools } from "./fakeTools.js";
import { registerAnswerWriterAgentExecutor, type AnswerWriterAgentDependencies } from "./answerWriterAgent.js";
import { InMemorySupervisorPersistence } from "./supervisorPersistence.js";
import { SupervisorRuntime, type SupervisorDecisionModel, type SupervisorRunInput } from "./supervisorRuntime.js";
import { ToolRegistry } from "./toolRegistry.js";

const SUP = "chat-supervisor";
const TENANT_ID = "507f1f77bcf86cd799439011";
const ACTOR_ID = "507f1f77bcf86cd799439012";
const CONVERSATION_ID = "507f1f77bcf86cd799439013";
const DOC_ID = "507f1f77bcf86cd799439014";
const CHUNK_ID = "507f1f77bcf86cd799439016";

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

function handoffToAnswerWriter(payload: Record<string, unknown>): string {
  return JSON.stringify({
    action: "handoff",
    currentAgent: SUP,
    nextAgent: "answer-writer-agent",
    reasonCode: "write-answer",
    payload,
  });
}

function returnToSupervisor(): string {
  return JSON.stringify({
    action: "handoff",
    currentAgent: "answer-writer-agent",
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

function stubDeps(
  overrides: Partial<AnswerWriterAgentDependencies> = {},
): AnswerWriterAgentDependencies {
  return {
    answerWriter: new AnswerWriterService(new FakeModelAdapter()),
    loadChunksByIds: async (_tenantId, chunkIds) =>
      chunkIds.map((id) => ({
        chunkId: id,
        documentId: DOC_ID,
        documentVersionId: "507f1f77bcf86cd799439018",
        tenantId: TENANT_ID,
        text: "The remote work policy allows three days per week.",
        allowAiUse: true,
        status: "ACTIVE" as const,
        confidenceScore: 0.9,
      })),
    loadEligibleDocumentIds: async () => [DOC_ID],
    authorization: {
      authorizeDocumentAction: async () => undefined,
    } as unknown as DocumentAccessAuthorizationService,
    ...overrides,
  };
}

function buildHarness(
  model: SupervisorDecisionModel,
  deps: AnswerWriterAgentDependencies = stubDeps(),
): { runtime: SupervisorRuntime; persistence: InMemorySupervisorPersistence } {
  const toolRegistry = new ToolRegistry();
  for (const tool of createFakeTools()) {
    toolRegistry.register(tool);
  }

  const executorRegistry = new AgentExecutorRegistry(createChatAgentRegistry());
  registerAnswerWriterAgentExecutor(executorRegistry, deps);

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

describe("SupervisorRuntime + answer-writer-agent integration", () => {
  it("handoffs to the real answer writer, persists the grounded answer step, and traces usage", async () => {
    const { model, calls } = scriptedModel([
      handoffToAnswerWriter({
        conversationId: CONVERSATION_ID,
        question: "What is the remote work policy?",
        approvedEvidenceIds: [CHUNK_ID],
      }),
      returnToSupervisor(),
      completeDecision({ answerText: "done" }),
    ]);
    const { runtime, persistence } = buildHarness(model);

    const result = await runtime.execute(baseRunInput());

    assert.equal(result.status, "completed");
    assert.equal(result.handoffsCount, 2);
    assert.equal(result.totalSteps, 4);
    assert.deepEqual(calls, [SUP, "answer-writer-agent", SUP]);
    assert.ok((result.totalTokensUsed as number) > 30, "executor tokens were traced");

    const writerHandoffStep = Array.from(persistence.steps.values()).find(
      (step) => step.action === "handoff" && step.handoffToAgent === "answer-writer-agent",
    );
    assert.ok(writerHandoffStep, "answer-writer handoff step was persisted");
    assert.equal(writerHandoffStep.status, "completed");
    assert.equal(writerHandoffStep.agentName, SUP);
    assert.equal(writerHandoffStep.previousAgent, SUP);
    assert.equal(writerHandoffStep.output, null);
    assert.equal(writerHandoffStep.tokensUsed, null);

    const writerExecutionStep = Array.from(persistence.steps.values()).find(
      (step) => step.action === "execute" && step.agentName === "answer-writer-agent",
    );
    assert.ok(writerExecutionStep, "answer-writer execution step was persisted");
    assert.equal(writerExecutionStep.status, "completed");
    assert.equal(writerExecutionStep.handoffToAgent, null);
    assert.equal(writerExecutionStep.previousAgent, null);
    assert.equal(writerExecutionStep.modelProvider, "fake");
    assert.ok((writerExecutionStep.tokensUsed as number) > 0);
    assert.equal(Number(writerExecutionStep.estimatedCost), 0);

    const output = writerExecutionStep.output as Record<string, unknown>;
    assert.equal(output.decision, "grounded_answer");
    assert.equal(output.answer, "Simulated grounded answer.");
    assert.deepEqual(output.citedChunkIds, [CHUNK_ID]);
  });

  it("returns insufficient_evidence when no authorized evidence exists, without calling the LLM", async () => {
    const { model } = scriptedModel([
      handoffToAnswerWriter({
        conversationId: CONVERSATION_ID,
        question: "What is the remote work policy?",
      }),
      returnToSupervisor(),
      completeDecision({ answerText: "done" }),
    ]);
    const { runtime, persistence } = buildHarness(model);

    const result = await runtime.execute(baseRunInput());

    assert.equal(result.status, "completed");
    assert.equal(result.totalTokensUsed, 0, "no LLM call means no executor-reported usage");

    const writerExecutionStep = Array.from(persistence.steps.values()).find(
      (step) => step.action === "execute" && step.agentName === "answer-writer-agent",
    );
    assert.ok(writerExecutionStep);
    const output = writerExecutionStep.output as Record<string, unknown>;
    assert.equal(output.decision, "insufficient_evidence");
    assert.equal(output.answer, insufficientEvidenceMessage("en"));
    assert.deepEqual(output.citedChunkIds, []);
    assert.equal(
      writerExecutionStep.tokensUsed,
      null,
      "no LLM call means no executor-reported usage",
    );
  });

  it("fails closed when the executor is not registered", async () => {
    const { model } = scriptedModel([
      handoffToAnswerWriter({
        conversationId: CONVERSATION_ID,
        question: "What is the remote work policy?",
        approvedEvidenceIds: [CHUNK_ID],
      }),
    ]);

    const toolRegistry = new ToolRegistry();
    for (const tool of createFakeTools()) {
      toolRegistry.register(tool);
    }
    const executorRegistry = new AgentExecutorRegistry(createChatAgentRegistry());
    const runtime = new SupervisorRuntime({
      model,
      workflowRegistry: createChatWorkflowRegistry(),
      executorRegistry,
      toolRegistry,
      persistence: new InMemorySupervisorPersistence(),
    });

    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, "AGENT_EXECUTOR_NOT_FOUND");
  });

  it("registers the answer-writer agent under its approved id", () => {
    const { deps } = { deps: stubDeps() };
    const registry = new AgentExecutorRegistry(createChatAgentRegistry());
    registerAnswerWriterAgentExecutor(registry, deps);
    const contract = registry.requireExecutor("answer-writer-agent");
    assert.equal(contract.id, toAgentId("answer-writer-agent"));
    assert.equal(contract.version, "1.0.0");
  });
});
