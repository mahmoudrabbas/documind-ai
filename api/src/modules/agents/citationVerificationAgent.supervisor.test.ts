import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
import { toAgentId } from "./agentContracts.js";
import { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import { createChatAgentRegistry } from "./chatAgents.js";
import { createChatWorkflowRegistry } from "./chatWorkflow.js";
import { createFakeTools } from "./fakeTools.js";
import {
  CITATION_VERIFICATION_AGENT_ID,
  registerCitationVerificationAgentExecutor,
  type CitationVerificationAgentDependencies,
} from "./citationVerificationAgent.js";
import { InMemorySupervisorPersistence } from "./supervisorPersistence.js";
import { SupervisorRuntime, type SupervisorDecisionModel, type SupervisorRunInput } from "./supervisorRuntime.js";
import { ToolRegistry } from "./toolRegistry.js";

const SUP = "chat-supervisor";
const TENANT_ID = "507f1f77bcf86cd799439011";
const ACTOR_ID = "507f1f77bcf86cd799439012";
const CONVERSATION_ID = "507f1f77bcf86cd799439013";
const DOC_ID = "507f1f77bcf86cd799439014";
const CHUNK_ID = "507f1f77bcf86cd799439016";
const INVENTED_ID = "507f1f77bcf86cd799439019";

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

function handoffToCitationVerifier(payload: Record<string, unknown>): string {
  return JSON.stringify({
    action: "handoff",
    currentAgent: SUP,
    nextAgent: CITATION_VERIFICATION_AGENT_ID,
    reasonCode: "verify-citations",
    payload,
  });
}

function returnToSupervisor(): string {
  return JSON.stringify({
    action: "handoff",
    currentAgent: CITATION_VERIFICATION_AGENT_ID,
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
  overrides: Partial<CitationVerificationAgentDependencies> = {},
): { deps: CitationVerificationAgentDependencies; loadChunksCalls: unknown[] } {
  const loadChunksCalls: unknown[] = [];
  const deps: CitationVerificationAgentDependencies = {
    loadChunksByIds: async (tenantId, chunkIds) => {
      loadChunksCalls.push({ tenantId, chunkIds });
      return chunkIds.map((id) => ({
        chunkId: id,
        documentId: DOC_ID,
        documentVersionId: "507f1f77bcf86cd799439018",
        tenantId: TENANT_ID,
        text: "The remote work policy allows three days per week.",
        allowAiUse: true,
        status: "ACTIVE" as const,
        confidenceScore: 0.9,
      }));
    },
    loadEligibleDocumentIds: async () => [DOC_ID],
    authorization: {
      authorizeDocumentAction: async () => undefined,
    } as unknown as DocumentAccessAuthorizationService,
    semanticVerifier: {
      verify: async ({ answerText, evidence }) => ({
        claims: answerText ? [answerText] : [],
        unsupportedClaims: [],
        supportingEvidenceIds: evidence.map((item) => item.chunkId),
      }),
    },
    ...overrides,
  };
  return { deps, loadChunksCalls };
}

function buildHarness(
  model: SupervisorDecisionModel,
  deps: CitationVerificationAgentDependencies = stubDeps().deps,
): { runtime: SupervisorRuntime; persistence: InMemorySupervisorPersistence } {
  const toolRegistry = new ToolRegistry();
  for (const tool of createFakeTools()) {
    toolRegistry.register(tool);
  }

  const executorRegistry = new AgentExecutorRegistry(createChatAgentRegistry());
  registerCitationVerificationAgentExecutor(executorRegistry, deps);

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

describe("SupervisorRuntime + citation-verification-agent integration", () => {
  it("persists a deterministic verification step with null model fields", async () => {
    const { model, calls } = scriptedModel([
      handoffToCitationVerifier({
        decision: "grounded_answer",
        citedChunkIds: [CHUNK_ID, INVENTED_ID],
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
    assert.deepEqual(calls, [SUP, CITATION_VERIFICATION_AGENT_ID, SUP]);
    assert.equal(result.totalTokensUsed, 90, "only supervisor decisions consume tokens");

    const executionStep = Array.from(persistence.steps.values()).find(
      (step) => step.action === "execute" && step.agentName === CITATION_VERIFICATION_AGENT_ID,
    );
    assert.ok(executionStep, "citation-verification execution step was persisted");
    assert.equal(executionStep.status, "completed");
    assert.equal(executionStep.handoffToAgent, null);
    assert.equal(executionStep.previousAgent, null);

    // Deterministic agent: no model was invoked, so every model field stays null.
    assert.equal(executionStep.modelProvider, null);
    assert.equal(executionStep.modelName, null);
    assert.equal(executionStep.promptVersion, null);
    assert.equal(executionStep.tokensUsed, null);
    assert.equal(executionStep.estimatedCost, null);
    assert.equal(typeof executionStep.latencyMs, "number");
    assert.ok((executionStep.latencyMs as number) >= 0);

    const output = executionStep.output as Record<string, unknown>;
    assert.equal(output.verified, true);
    assert.equal(output.reasonCode, "CITATIONS_VERIFIED");
    assert.deepEqual(output.validatedCitationIds, [CHUNK_ID]);
    assert.deepEqual(output.rejectedCitationIds, [INVENTED_ID]);
  });

  it("fails closed to MISSING_CITATIONS when no authorized evidence survives", async () => {
    const { model } = scriptedModel([
      handoffToCitationVerifier({
        decision: "grounded_answer",
        citedChunkIds: [CHUNK_ID],
        approvedEvidenceIds: [CHUNK_ID],
      }),
      returnToSupervisor(),
      completeDecision({ answerText: "done" }),
    ]);
    const { deps } = stubDeps({
      loadChunksByIds: async () => [],
    });
    const { runtime, persistence } = buildHarness(model, deps);

    const result = await runtime.execute(baseRunInput());

    assert.equal(result.status, "completed");
    assert.equal(result.totalTokensUsed, 90);

    const executionStep = Array.from(persistence.steps.values()).find(
      (step) => step.action === "execute" && step.agentName === CITATION_VERIFICATION_AGENT_ID,
    );
    assert.ok(executionStep);
    assert.equal(executionStep.modelProvider, null);
    assert.equal(executionStep.tokensUsed, null);
    const output = executionStep.output as Record<string, unknown>;
    assert.equal(output.verified, false);
    assert.equal(output.reasonCode, "MISSING_CITATIONS");
    assert.deepEqual(output.validatedCitationIds, []);
    assert.deepEqual(output.rejectedCitationIds, [CHUNK_ID]);
  });

  it("persists verification-bounds overflow as a fail-closed citation result", async () => {
    const { model } = scriptedModel([
      handoffToCitationVerifier({
        decision: "grounded_answer",
        answerText: "Candidate with uncovered factual text.",
        citedChunkIds: [CHUNK_ID],
        approvedEvidenceIds: [CHUNK_ID],
      }),
      returnToSupervisor(),
      completeDecision({ answerText: "done" }),
    ]);
    const { deps } = stubDeps({
      semanticVerifier: {
        verify: async () => ({
          claims: ["Candidate with uncovered factual text."],
          unsupportedClaims: [],
          supportingEvidenceIds: [],
          reasonCode: "VERIFICATION_BOUNDS_EXCEEDED",
        }),
      },
    });
    const { runtime, persistence } = buildHarness(model, deps);

    const result = await runtime.execute(baseRunInput());
    assert.equal(result.status, "completed");
    const executionStep = Array.from(persistence.steps.values()).find(
      (step) => step.action === "execute" && step.agentName === CITATION_VERIFICATION_AGENT_ID,
    );
    assert.ok(executionStep);
    const output = executionStep.output as Record<string, unknown>;
    assert.equal(output.verified, false);
    assert.equal(output.reasonCode, "VERIFICATION_BOUNDS_EXCEEDED");
    assert.deepEqual(output.validatedCitationIds, []);
    assert.deepEqual(output.rejectedCitationIds, [CHUNK_ID]);
  });

  it("skips non-grounded decisions without loading evidence", async () => {
    const { model } = scriptedModel([
      handoffToCitationVerifier({
        decision: "unsupported",
        citedChunkIds: [CHUNK_ID],
        approvedEvidenceIds: [CHUNK_ID],
      }),
      returnToSupervisor(),
      completeDecision({ answerText: "done" }),
    ]);
    const { deps, loadChunksCalls } = stubDeps();
    const { runtime, persistence } = buildHarness(model, deps);

    const result = await runtime.execute(baseRunInput());

    assert.equal(result.status, "completed");
    assert.deepEqual(loadChunksCalls, [], "non-grounded decisions must not load evidence");

    const executionStep = Array.from(persistence.steps.values()).find(
      (step) => step.action === "execute" && step.agentName === CITATION_VERIFICATION_AGENT_ID,
    );
    assert.ok(executionStep);
    assert.equal(executionStep.modelProvider, null);
    const output = executionStep.output as Record<string, unknown>;
    assert.equal(output.verified, true);
    assert.equal(output.reasonCode, "CITATIONS_SKIPPED");
    assert.deepEqual(output.validatedCitationIds, []);
  });

  it("registers the citation-verification agent under its approved id", () => {
    const registry = new AgentExecutorRegistry(createChatAgentRegistry());
    registerCitationVerificationAgentExecutor(registry, stubDeps().deps);
    const contract = registry.requireExecutor(CITATION_VERIFICATION_AGENT_ID);
    assert.equal(contract.id, toAgentId(CITATION_VERIFICATION_AGENT_ID));
    assert.equal(contract.version, "1.4.0");
  });
});
