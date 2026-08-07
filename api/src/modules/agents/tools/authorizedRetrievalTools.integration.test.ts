import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENT_TOOL_PERMISSION_DENIED,
  AGENT_UNREGISTERED_TOOL,
} from "../../../common/errors/errorCodes.js";
import type { AgentExecutionContext } from "../agentExecutionContext.js";
import { AgentExecutorRegistry } from "../agentExecutorRegistry.js";
import { createChatAgentRegistry } from "../chatAgents.js";
import { createChatWorkflowRegistry } from "../chatWorkflow.js";
import { createFakeTools } from "../fakeTools.js";
import { SupervisorRuntime, type SupervisorDecisionModel } from "../supervisorRuntime.js";
import { InMemorySupervisorPersistence } from "../supervisorPersistence.js";
import { ToolRegistry } from "../toolRegistry.js";
import type { HybridRetrievalService } from "../../retrieval/retrieval.service.js";
import type { RerankerService } from "../../reranker/reranker.service.js";
import type { DocumentAccessAuthorizationService } from "../../document-access/documentAccess.authorization.service.js";
import type { LoadedChunkCandidate } from "./authorizedRetrievalTools.js";
import {
  registerAuthorizedRetrievalTools,
  type AuthorizedRetrievalDependencies,
} from "./authorizedRetrievalTools.js";

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

const tenantId = "507f1f77bcf86cd799439011";
const actorId = "507f1f77bcf86cd799439012";
const docId = "64a000000000000000000005";
const docIdB = "64a00000000000000000000f";
const versionId = "64a000000000000000000007";
const chunkId = "64a000000000000000000009";
const chunkIdB = "64a00000000000000000000b";

function baseContext(overrides: Partial<AgentExecutionContext> = {}): AgentExecutionContext {
  return {
    tenantId,
    actorId,
    actorRole: "COMPANY_ADMIN",
    actorEmail: "admin@example.com",
    traceId: "trace-1",
    requestId: "req-1",
    conversationId: "507f1f77bcf86cd799439013",
    workflowId: "chat-rag-v1",
    permissions: [
      "documents:use_in_ai",
      "documents:read",
      "agents:tools:echo:use",
      "agents:approval:request",
    ],
    ...overrides,
  };
}

function makeLoadedChunk(override: Partial<LoadedChunkCandidate> = {}): LoadedChunkCandidate {
  return {
    chunkId,
    documentId: docId,
    documentVersionId: versionId,
    tenantId,
    text: "SAMPLE CHUNK TEXT THAT MUST NOT LEAK",
    allowAiUse: true,
    status: "ACTIVE",
    confidenceScore: 0.9,
    ...override,
  };
}

function makeDeps(
  overrides: Partial<AuthorizedRetrievalDependencies> = {},
): AuthorizedRetrievalDependencies {
  return {
    retrieval: {
      hybridSearch: async () => ({
        candidates: [],
        totalCandidates: 0,
        filterSummary: {} as never,
        diagnostics: {} as never,
      }),
      vectorSearch: async () => ({}) as never,
      keywordSearch: async () => ({}) as never,
    } as unknown as HybridRetrievalService,
    reranker: {
      buildEvidenceBundle: async () => ({
        items: [],
        totalTokenCount: 0,
        maxTokenCount: 0,
        inputCandidateCount: 0,
        conflictGroups: [],
        sufficiency: { level: "NO_EVIDENCE", reasons: [] },
        scoreExplanation: "test",
        accessPolicyVersion: "1.0.0",
        createdAt: new Date().toISOString(),
      }),
    } as RerankerService,
    authorization: {
      resolveActor: async () => ({
        tenantId,
        actorId,
        baseRole: "COMPANY_ADMIN" as const,
        customRoleId: null,
        departmentIds: [],
      }),
      authorizeDocumentAction: async () => undefined,
      authorizeDocumentsAction: async () => undefined,
      buildDiscoverPipeline: async () => [],
    } as unknown as DocumentAccessAuthorizationService,
    resolveDocumentHints: async (rawIds, _ctx, rawTitles = []) => ({
      referencedDocumentIds: [...(rawIds ?? [])],
      referencedDocumentTitles: [],
      ambiguousTitleMatches: false,
      unresolvedTitleHints: [...(rawTitles ?? [])],
    }),
    loadChunksByIds: async (_tenantId, chunkIds) =>
      chunkIds.map((id) => makeLoadedChunk({ chunkId: id })),
    loadEligibleDocumentIds: async (_tenantId, documentIds) => documentIds,
    ...overrides,
  };
}

function buildHarness(
  model: SupervisorDecisionModel,
  options: {
    toolRegistry?: ToolRegistry;
    permissions?: string[];
  } = {},
) {
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

function singleToolRegistry(deps: AuthorizedRetrievalDependencies): ToolRegistry {
  const registry = new ToolRegistry();
  registerAuthorizedRetrievalTools(registry, deps);
  return registry;
}

describe("SupervisorRuntime + authorizedRetrievalTools integration", () => {
  it("resolve_document_titles tool call is executed and persisted", async () => {
    const { model } = scriptedModel([
      toolCallDecision("resolve_document_titles", {
        titles: ["Employee Handbook"],
      }),
      completeDecision({ answer: "titles resolved" }),
    ]);

    const registry = singleToolRegistry(
      makeDeps({
        resolveDocumentHints: async () => ({
          referencedDocumentIds: [docId],
          referencedDocumentTitles: ["Employee Handbook"],
          ambiguousTitleMatches: false,
          unresolvedTitleHints: [],
        }),
      }),
    );

    const { runtime, persistence } = buildHarness(model, {
      toolRegistry: registry,
    });

    const result = await runtime.execute({
      runId: "run-resolve-titles",
      workflowId: "chat-rag-v1",
      context: baseContext(),
      input: { question: "what documents?" },
    });

    assert.equal(result.status, "completed");
    assert.equal(result.totalToolCalls, 1);
    assert.equal(persistence.toolCalls.size, 1);

    const toolCall = Array.from(persistence.toolCalls.values())[0];
    assert.equal(toolCall.toolName, "resolve_document_titles");
    assert.equal(toolCall.status, "completed");
    const output = JSON.stringify(toolCall.output);
    assert.ok(output.includes("one_match"));
    assert.ok(output.includes(docId));
    assert.equal(output.includes("SAMPLE CHUNK TEXT"), false);
  });

  it("rejects resolve_document_titles with injected tenantId through the runtime", async () => {
    const { model } = scriptedModel([
      toolCallDecision("resolve_document_titles", {
        titles: ["Employee Handbook"],
        tenantId: "evil-tenant",
      }),
    ]);

    const { runtime, persistence } = buildHarness(model, {
      toolRegistry: singleToolRegistry(makeDeps()),
    });

    const result = await runtime.execute({
      runId: "run-inject-tenant",
      workflowId: "chat-rag-v1",
      context: baseContext(),
      input: { question: "test" },
    });

    assert.equal(result.status, "failed");
    assert.equal(persistence.toolCalls.size, 1);

    const toolCall = Array.from(persistence.toolCalls.values())[0];
    assert.equal(toolCall.status, "failed");
    const errorMsg = toolCall.error?.message as string | undefined;
    assert.ok(errorMsg?.includes("tenantId"));
  });

  it("rejects resolve_document_titles with injected actorRole through the runtime", async () => {
    const { model } = scriptedModel([
      toolCallDecision("resolve_document_titles", {
        titles: ["Employee Handbook"],
        actorRole: "SUPER_ADMIN",
        actorEmail: "attacker@evil.com",
      }),
    ]);

    const { runtime, persistence } = buildHarness(model, {
      toolRegistry: singleToolRegistry(makeDeps()),
    });

    const result = await runtime.execute({
      runId: "run-inject-actor",
      workflowId: "chat-rag-v1",
      context: baseContext(),
      input: { question: "test" },
    });

    assert.equal(result.status, "failed");
    const toolCall = Array.from(persistence.toolCalls.values())[0];
    assert.equal(toolCall.status, "failed");
    const actorErr = toolCall.error?.message as string | undefined;
    assert.ok(actorErr?.includes("actorRole"));
  });

  it("authorized_hybrid_search requires documents:use_in_ai permission", async () => {
    const { model } = scriptedModel([
      toolCallDecision("authorized_hybrid_search", {
        queryText: "policies",
      }),
    ]);

    const { runtime, persistence } = buildHarness(model, {
      toolRegistry: singleToolRegistry(makeDeps()),
      permissions: [],
    });

    const result = await runtime.execute({
      runId: "run-permission-denied",
      workflowId: "chat-rag-v1",
      context: baseContext({ permissions: [] }),
      input: { question: "test" },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_TOOL_PERMISSION_DENIED);
    assert.equal(persistence.toolCalls.size, 0);
  });

  it("denies tool_call to an unregistered authorized retrieval tool", async () => {
    const { model } = scriptedModel([
      toolCallDecision("authorized_hybrid_search", {
        queryText: "test",
      }),
    ]);

    const registry = new ToolRegistry();

    const { runtime } = buildHarness(model, {
      toolRegistry: registry,
    });

    const result = await runtime.execute({
      runId: "run-unregistered",
      workflowId: "chat-rag-v1",
      context: baseContext(),
      input: { question: "test" },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_UNREGISTERED_TOOL);
  });

  it("persisted authorized_hybrid_search output contains no chunk text", async () => {
    const secret = "THIS IS SECRET CHUNK TEXT THAT MUST NOT LEAK";
    const { model } = scriptedModel([
      toolCallDecision("authorized_hybrid_search", {
        queryText: "policies",
      }),
      completeDecision({ answer: "done" }),
    ]);

    const registry = singleToolRegistry(
      makeDeps({
        retrieval: {
          hybridSearch: async () => ({
            candidates: [
              {
                chunkId,
                documentId: docId,
                documentVersionId: versionId,
                tenantId,
                text: secret,
                score: 0.95,
                retrievalMethod: "hybrid",
              },
            ],
            totalCandidates: 1,
            filterSummary: {} as never,
            diagnostics: {} as never,
            evidenceBundle: {
              items: [],
              totalTokenCount: 0,
              maxTokenCount: 0,
              inputCandidateCount: 0,
              conflictGroups: [],
              sufficiency: { level: "SUFFICIENT", reasons: [] },
              scoreExplanation: "x",
              accessPolicyVersion: "1.0.0",
              createdAt: new Date().toISOString(),
            },
          }),
          vectorSearch: async () => ({}) as never,
          keywordSearch: async () => ({}) as never,
        } as unknown as HybridRetrievalService,
      }),
    );

    const { runtime, persistence } = buildHarness(model, {
      toolRegistry: registry,
    });

    const result = await runtime.execute({
      runId: "run-no-leak",
      workflowId: "chat-rag-v1",
      context: baseContext(),
      input: { question: "test" },
    });

    assert.equal(result.status, "completed");

    const toolCall = Array.from(persistence.toolCalls.values())[0];
    assert.equal(toolCall.status, "completed");
    const persistedOutput = JSON.stringify(toolCall.output);
    assert.equal(persistedOutput.includes(secret), false);
    assert.equal(persistedOutput.includes("textExcerpt"), false);
    assert.equal(persistedOutput.includes("evidenceBundle"), false);
    assert.equal(persistedOutput.includes("sufficiency"), false);
  });

  it("evaluate_evidence persists approved/rejected ids without chunk text", async () => {
    const { model } = scriptedModel([
      toolCallDecision("evaluate_evidence", {
        question: "what is the leave policy?",
        candidateIds: [chunkId, chunkIdB],
      }),
      completeDecision({ answer: "done" }),
    ]);

    const registry = singleToolRegistry(
      makeDeps({
        loadChunksByIds: async (_tenantId, chunkIds) =>
          chunkIds.map((id) =>
            makeLoadedChunk({
              chunkId: id,
              documentId: id === chunkIdB ? docIdB : docId,
            }),
          ),
        reranker: {
          buildEvidenceBundle: async (candidates) => ({
            items: candidates.map((c, i) => ({
              rank: i + 1,
              candidate: c,
              scoreBreakdown: {
                fusionScore: c.score,
                rerankScore: c.score,
                semanticScore: c.score,
                exactTermScore: 0,
                sourceAuthorityScore: 0,
                versionPreferenceScore: 0,
                totalScore: c.score,
              },
              citationAnchor: {
                chunkId: c.chunkId,
                documentId: c.documentId,
                documentVersionId: c.documentVersionId,
              },
              textExcerpt: c.text,
              expanded: false,
              neighborChunkIds: [],
            })),
            totalTokenCount: 10,
            maxTokenCount: 4000,
            inputCandidateCount: candidates.length,
            conflictGroups: [],
            sufficiency: { level: "SUFFICIENT", reasons: [] },
            scoreExplanation: "test",
            accessPolicyVersion: "1.0.0",
            createdAt: new Date().toISOString(),
          }),
        } as RerankerService,
      }),
    );

    const { runtime, persistence } = buildHarness(model, {
      toolRegistry: registry,
    });

    const result = await runtime.execute({
      runId: "run-evaluate-evidence",
      workflowId: "chat-rag-v1",
      context: baseContext(),
      input: { question: "test" },
    });

    assert.equal(result.status, "completed");

    const toolCall = Array.from(persistence.toolCalls.values())[0];
    assert.equal(toolCall.toolName, "evaluate_evidence");
    assert.equal(toolCall.status, "completed");
    const output = toolCall.output as Record<string, unknown>;
    assert.equal(output.sufficiency, "SUFFICIENT");
    assert.deepEqual(output.approvedEvidenceIds, [chunkId, chunkIdB]);
    assert.deepEqual(output.rejectedEvidenceIds, []);
    const persistedOutput = JSON.stringify(output);
    assert.equal(persistedOutput.includes("SAMPLE CHUNK TEXT"), false);
  });

  it("cross-tenant candidates are excluded before evaluate_evidence reranks", async () => {
    const { model } = scriptedModel([
      toolCallDecision("evaluate_evidence", {
        question: "test",
        candidateIds: [chunkId, chunkIdB],
      }),
      completeDecision({ answer: "done" }),
    ]);

    const registry = singleToolRegistry(
      makeDeps({
        loadChunksByIds: async (_tenantId, chunkIds) =>
          chunkIds
            .filter((id) => id === chunkId)
            .map((id) => makeLoadedChunk({ chunkId: id })),
        reranker: {
          buildEvidenceBundle: async (candidates) => ({
            items: candidates.map((c, i) => ({
              rank: i + 1,
              candidate: c,
              scoreBreakdown: {
                fusionScore: c.score,
                rerankScore: c.score,
                semanticScore: c.score,
                exactTermScore: 0,
                sourceAuthorityScore: 0,
                versionPreferenceScore: 0,
                totalScore: c.score,
              },
              citationAnchor: {
                chunkId: c.chunkId,
                documentId: c.documentId,
                documentVersionId: c.documentVersionId,
              },
              textExcerpt: c.text,
              expanded: false,
              neighborChunkIds: [],
            })),
            totalTokenCount: 10,
            maxTokenCount: 4000,
            inputCandidateCount: candidates.length,
            conflictGroups: [],
            sufficiency: { level: "SUFFICIENT", reasons: [] },
            scoreExplanation: "test",
            accessPolicyVersion: "1.0.0",
            createdAt: new Date().toISOString(),
          }),
        } as RerankerService,
      }),
    );

    const { runtime, persistence } = buildHarness(model, {
      toolRegistry: registry,
    });

    const result = await runtime.execute({
      runId: "run-cross-tenant-exclusion",
      workflowId: "chat-rag-v1",
      context: baseContext(),
      input: { question: "test" },
    });

    assert.equal(result.status, "completed");

    const toolCall = Array.from(persistence.toolCalls.values())[0];
    const output = toolCall.output as Record<string, unknown>;
    assert.equal(output.sufficiency, "SUFFICIENT");
    assert.deepEqual(output.approvedEvidenceIds, [chunkId]);
    assert.deepEqual(output.rejectedEvidenceIds, [chunkIdB]);
  });
});
