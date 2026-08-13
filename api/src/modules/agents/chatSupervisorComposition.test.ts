import assert from "node:assert/strict";
import { describe, it } from "node:test";
import AgentRunModel from "../../db/models/agentRun.model.js";
import type { DocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
import { Permission } from "../permissions/permissions.catalog.js";
import type { HybridRetrievalService } from "../retrieval/retrieval.service.js";
import type { RerankerService } from "../reranker/reranker.service.js";
import { IntentQueryService } from "../intent-query/intentQuery.service.js";
import type { ConversationContextPort } from "../intent-query/ports/conversationContext.port.js";
import { AnswerWriterAgentExecutor } from "./answerWriterAgent.js";
import type { ModelAdapter } from "./agents.types.js";
import {
  createProductionChatSupervisorComposition,
  type ProductionChatSupervisorDependencies,
} from "./chatSupervisorComposition.js";
import { CitationVerificationAgentExecutor } from "./citationVerificationAgent.js";
import { ComplianceAgentExecutor } from "./complianceAgent.js";
import { IntentQueryAgentExecutor } from "./intentQueryAgent.js";
import { MongoSupervisorPersistence } from "./supervisorPersistence.js";

function deterministicModel(): ModelAdapter {
  return {
    providerKey: "test-explicit-model",
    async complete() {
      return {
        id: "completion-1",
        provider: "test-explicit-model",
        model: "test-explicit-model",
        choices: [
          {
            index: 0,
            finishReason: "stop",
            message: { role: "assistant", content: "{}" },
          },
        ],
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        latencyMs: 0,
        estimatedCost: 0,
      };
    },
  };
}

function dependencies(): ProductionChatSupervisorDependencies {
  const model = deterministicModel();
  const conversationContext: ConversationContextPort = {
    getContext: async () => [],
  };
  return {
    model,
    intentQueryService: new IntentQueryService(model, conversationContext),
    authorizedRetrieval: {
      retrieval: {
        hybridSearch: async () => ({}) as never,
        vectorSearch: async () => ({}) as never,
        keywordSearch: async () => ({}) as never,
      } as HybridRetrievalService,
      reranker: {
        rerank: async () => ({}) as never,
      } as unknown as RerankerService,
      authorization: {
        authorizeDocumentAction: async () => undefined,
      } as unknown as DocumentAccessAuthorizationService,
      resolveDocumentHints: async () => ({
        referencedDocumentIds: [],
        referencedDocumentTitles: [],
        ambiguousTitleMatches: false,
        unresolvedTitleHints: [],
      }),
      loadChunksByIds: async () => [],
      loadEligibleDocumentIds: async () => [],
    },
  };
}

describe("production chat supervisor composition", () => {
  it("registers each real production executor exactly once", () => {
    const composition = createProductionChatSupervisorComposition(
      dependencies(),
    );

    assert.deepEqual(
      composition.executors.map((executor) => executor.id),
      [
        "intent-query-agent",
        "answer-writer-agent",
        "citation-verification-agent",
        "compliance-agent",
      ],
    );
    assert.equal(
      composition.executors.filter(
        (executor) => executor instanceof IntentQueryAgentExecutor,
      ).length,
      1,
    );
    assert.equal(
      composition.executors.filter(
        (executor) => executor instanceof AnswerWriterAgentExecutor,
      ).length,
      1,
    );
    assert.equal(
      composition.executors.filter(
        (executor) => executor instanceof CitationVerificationAgentExecutor,
      ).length,
      1,
    );
    assert.equal(
      composition.executors.filter(
        (executor) => executor instanceof ComplianceAgentExecutor,
      ).length,
      1,
    );
  });

  it("registers only the four controlled production tools", () => {
    const composition = createProductionChatSupervisorComposition(
      dependencies(),
    );

    assert.deepEqual(
      composition.tools.map((tool) => tool.schema.name),
      [
        "resolve_document_titles",
        "authorized_hybrid_search",
        "evaluate_evidence",
        "analytics_query",
      ],
    );
  });

  it("preserves canonical controlled-tool permissions", () => {
    const composition = createProductionChatSupervisorComposition(
      dependencies(),
    );
    const tools = new Map(
      composition.tools.map((tool) => [tool.schema.name, tool]),
    );

    assert.equal(
      tools.get("authorized_hybrid_search")?.schema.requiredPermission,
      Permission.DOCUMENTS_USE_IN_AI,
    );
    assert.equal(
      tools.get("evaluate_evidence")?.schema.requiredPermission,
      Permission.DOCUMENTS_USE_IN_AI,
    );
    assert.equal(
      tools.get("analytics_query")?.schema.requiredPermission,
      Permission.ANALYTICS_READ,
    );
  });

  it("uses the existing chat-rag-v1 workflow without changing its DAG", () => {
    const { workflow } = createProductionChatSupervisorComposition(
      dependencies(),
    );

    assert.equal(workflow.id, "chat-rag-v1");
    assert.equal(workflow.entryAgent, "chat-supervisor");
    assert.deepEqual(workflow.allowedHandoffs, {
      "chat-supervisor": [
        "intent-query-agent",
        "answer-writer-agent",
        "citation-verification-agent",
        "compliance-agent",
      ],
      "intent-query-agent": ["chat-supervisor"],
      "answer-writer-agent": [
        "citation-verification-agent",
        "chat-supervisor",
      ],
      "citation-verification-agent": [
        "answer-writer-agent",
        "chat-supervisor",
        "compliance-agent",
      ],
      "compliance-agent": ["chat-supervisor"],
    });
  });

  it("uses Mongo persistence without creating or starting an AgentRun", () => {
    const model = AgentRunModel as unknown as {
      create: (...args: unknown[]) => unknown;
    };
    const originalCreate = model.create;
    const originalStart = MongoSupervisorPersistence.prototype.startRun;
    let createCalls = 0;
    let startCalls = 0;
    model.create = () => {
      createCalls++;
      throw new Error("AgentRun creation must not occur during composition");
    };
    MongoSupervisorPersistence.prototype.startRun = async () => {
      startCalls++;
      return null;
    };

    let composition;
    try {
      composition = createProductionChatSupervisorComposition(dependencies());
    } finally {
      model.create = originalCreate;
      MongoSupervisorPersistence.prototype.startRun = originalStart;
    }

    assert.ok(composition.persistence instanceof MongoSupervisorPersistence);
    assert.equal(composition.runtime.constructor.name, "SupervisorRuntime");
    assert.equal(createCalls, 0);
    assert.equal(startCalls, 0);
  });

  it("wraps only the explicitly supplied ModelAdapter", () => {
    const deps = dependencies();
    const composition = createProductionChatSupervisorComposition(deps);
    const runtimeModel = (
      composition.runtime as unknown as {
        model: { providerKey: string; modelName: string };
      }
    ).model;

    assert.equal(runtimeModel.providerKey, deps.model.providerKey);
    assert.equal(runtimeModel.modelName, deps.model.providerKey);
  });

  it("keeps request hooks and context outside singleton composition state", () => {
    const first = createProductionChatSupervisorComposition(dependencies());
    const second = createProductionChatSupervisorComposition(dependencies());

    assert.notEqual(first.runtime, second.runtime);
    assert.notEqual(first.persistence, second.persistence);
    assert.notEqual(first.executors, second.executors);
    assert.notEqual(first.tools, second.tools);
    assert.equal("hooks" in first.runtime, false);
    assert.equal("context" in first.runtime, false);
    assert.equal(first.executors.length, 4);
    assert.equal(second.executors.length, 4);
    assert.equal(first.tools.length, 4);
    assert.equal(second.tools.length, 4);
  });

  it("constructs without ChatService, routes, or request execution", () => {
    const composition = createProductionChatSupervisorComposition(
      dependencies(),
    );

    assert.ok(composition.runtime);
    assert.equal("chatService" in composition, false);
    assert.equal("routes" in composition, false);
    assert.equal("hooks" in composition, false);
  });
});
