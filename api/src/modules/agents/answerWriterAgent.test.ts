import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_ALREADY_REGISTERED,
  AGENT_CONTRACT_INVALID,
  AGENT_PROVIDER_ERROR,
} from "../../common/errors/errorCodes.js";
import { toAgentId } from "./agentContracts.js";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";
import type { ModelAdapter } from "./agents.types.js";
import type { DocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
import { AnswerWriterService, insufficientEvidenceMessage, type AnswerWriterServiceResult } from "./answerWriter.service.js";
import { AnswerWriterInputSchema, AnswerWriterOutputSchema } from "./chatAgentIO.js";
import { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import { createChatAgentRegistry } from "./chatAgents.js";
import type { AgentRunContext } from "./agentRunContext.js";
import {
  ANSWER_WRITER_AGENT_ID,
  ANSWER_WRITER_AGENT_VERSION,
  AnswerWriterAgentExecutor,
  registerAnswerWriterAgentExecutor,
  type AnswerWriterAgentDependencies,
} from "./answerWriterAgent.js";
import type { LoadedChunkCandidate } from "./tools/authorizedRetrievalTools.js";

// ── fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = "507f1f77bcf86cd799439011";
const ACTOR_ID = "507f1f77bcf86cd799439012";
const CONVERSATION_ID = "507f1f77bcf86cd799439013";
const DOC_ID = "507f1f77bcf86cd799439014";
const DOC_ID_B = "507f1f77bcf86cd799439015";
const CHUNK_ID = "507f1f77bcf86cd799439016";
const CHUNK_ID_B = "507f1f77bcf86cd799439017";

function runContext(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    actorEmail: "employee@example.com",
    actorRole: "EMPLOYEE",
    traceId: "trace-1",
    requestId: "req-1",
    workflowName: "chat-rag-v1",
    agentName: ANSWER_WRITER_AGENT_ID,
    runId: "run-1",
    stepIndex: 1,
    maxSteps: 10,
    maxToolCalls: 20,
    maxTokens: 100_000,
    budgetMs: 60_000,
    ...overrides,
  };
}

function makeLoadedChunk(override: Partial<LoadedChunkCandidate> = {}): LoadedChunkCandidate {
  return {
    chunkId: CHUNK_ID,
    documentId: DOC_ID,
    documentVersionId: "507f1f77bcf86cd799439018",
    tenantId: TENANT_ID,
    text: "The remote work policy allows three days per week.",
    allowAiUse: true,
    status: "ACTIVE",
    confidenceScore: 0.9,
    ...override,
  };
}

function usableResult(overrides: Partial<Extract<AnswerWriterServiceResult, { outcome: "usable" }>> = {}) {
  return {
    outcome: "usable" as const,
    structured: true,
    parsedDecision: "grounded_answer" as const,
    decision: "grounded_answer" as const,
    answer: "Three days per week.",
    citedChunkIds: [CHUNK_ID],
    rawContent: "",
    sanitizedContent: "Three days per week.",
    providerKey: "fake",
    modelName: "fake-chat",
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    latencyMs: 10,
    estimatedCost: 0,
    ...overrides,
  };
}

function fakeAnswerWriter(options: {
  result?: AnswerWriterServiceResult;
  error?: unknown;
  onGenerate?: (input: unknown) => void;
} = {}): { answerWriter: AnswerWriterService; generateCalls: unknown[] } {
  const generateCalls: unknown[] = [];
  const answerWriter = {
    generate: async (input: unknown) => {
      generateCalls.push(input);
      options.onGenerate?.(input);
      if (options.error !== undefined) throw options.error;
      return options.result ?? usableResult();
    },
  } as unknown as AnswerWriterService;
  return { answerWriter, generateCalls };
}

function makeDeps(overrides: Partial<AnswerWriterAgentDependencies> = {}) {
  const loadChunksCalls: Array<{ tenantId: string; chunkIds: readonly string[] }> = [];
  const loadEligibleCalls: Array<{ tenantId: string; documentIds: readonly string[] }> = [];
  const authorizeCalls: string[] = [];

  const loadChunksByIds: AnswerWriterAgentDependencies["loadChunksByIds"] = async (tenantId, chunkIds) => {
    loadChunksCalls.push({ tenantId, chunkIds });
    return chunkIds.map((id) => makeLoadedChunk({ chunkId: id }));
  };

  const loadEligibleDocumentIds: AnswerWriterAgentDependencies["loadEligibleDocumentIds"] = async (tenantId, documentIds) => {
    loadEligibleCalls.push({ tenantId, documentIds });
    return documentIds;
  };

  const authorization = {
    authorizeDocumentAction: async (_ctx: unknown, documentId: string) => {
      authorizeCalls.push(documentId);
    },
  } as unknown as DocumentAccessAuthorizationService;

  const { answerWriter, generateCalls } = fakeAnswerWriter();

  return {
    deps: {
      answerWriter,
      loadChunksByIds,
      loadEligibleDocumentIds,
      authorization,
      ...overrides,
    } as AnswerWriterAgentDependencies,
    loadChunksCalls,
    loadEligibleCalls,
    authorizeCalls,
    generateCalls,
  };
}

function makeExecutor(deps: AnswerWriterAgentDependencies): AnswerWriterAgentExecutor {
  return new AnswerWriterAgentExecutor({ deps });
}

function scriptedAnswerAdapter(options: {
  content?: string;
  throwError?: unknown;
} = {}): ModelAdapter {
  return {
    providerKey: "scripted",
    async complete() {
      if (options.throwError !== undefined) throw options.throwError;
      return {
        id: "scripted-1",
        provider: "scripted",
        model: "scripted-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: options.content ?? "",
            },
            finishReason: "stop",
          },
        ],
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        latencyMs: 3,
        estimatedCost: 0,
      };
    },
  };
}

const VALID_INPUT = {
  conversationId: CONVERSATION_ID,
  question: "What is the remote work policy?",
  approvedEvidenceIds: [CHUNK_ID],
};

// ── schema + registration ───────────────────────────────────────────────────

describe("AnswerWriterAgentExecutor", () => {
  it("exposes the approved contract id, version, and schemas", () => {
    const { deps } = makeDeps();
    const executor = makeExecutor(deps);
    assert.equal(executor.id, toAgentId(ANSWER_WRITER_AGENT_ID));
    assert.equal(executor.version, ANSWER_WRITER_AGENT_VERSION);
    assert.deepEqual(executor.capabilities, ["read", "generate"]);
    assert.equal(executor.inputSchema, AnswerWriterInputSchema);
    assert.equal(executor.outputSchema, AnswerWriterOutputSchema);
  });

  it("rejects malformed input with AGENT_CONTRACT_INVALID", async () => {
    const { deps } = makeDeps();
    const result = await makeExecutor(deps).execute(runContext(), { nope: 1 });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, "failed");
      assert.equal(result.error.code, AGENT_CONTRACT_INVALID);
    }
  });

  it("registers the executor and rejects a duplicate registration", () => {
    const { deps } = makeDeps();
    const registry = new AgentExecutorRegistry(createChatAgentRegistry());
    const definition = registerAnswerWriterAgentExecutor(registry, deps);
    assert.equal(definition.id, ANSWER_WRITER_AGENT_ID);
    assert.equal(definition.status, "active");
    assert.throws(
      () => registerAnswerWriterAgentExecutor(registry, deps),
      (err: unknown) =>
        err instanceof AppError && err.code === AGENT_ALREADY_REGISTERED,
    );
  });

  // ── evidence resolution ────────────────────────────────────────────────────

  it("returns the localized insufficient_evidence message when no evidence ids are supplied", async () => {
    const { deps, loadChunksCalls, generateCalls } = makeDeps();
    const result = await makeExecutor(deps).execute(runContext(), {
      conversationId: CONVERSATION_ID,
      question: "What is the remote work policy?",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.decision, "insufficient_evidence");
      assert.equal(result.output.answer, insufficientEvidenceMessage("en"));
      assert.deepEqual(result.output.citedChunkIds, []);
    }
    assert.equal(loadChunksCalls.length, 0);
    assert.equal(generateCalls.length, 0);
  });

  it("loads evidence by id and reauthorizes each parent document for use_in_ai", async () => {
    const { deps, loadChunksCalls, loadEligibleCalls, authorizeCalls } = makeDeps();
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.decision, "grounded_answer");
      assert.equal(result.output.answer, "Three days per week.");
      assert.deepEqual(result.output.citedChunkIds, [CHUNK_ID]);
    }
    assert.deepEqual(loadChunksCalls, [
      { tenantId: TENANT_ID, chunkIds: [CHUNK_ID] },
    ]);
    assert.deepEqual(loadEligibleCalls, [
      { tenantId: TENANT_ID, documentIds: [DOC_ID] },
    ]);
    assert.deepEqual(authorizeCalls, [DOC_ID]);
  });

  it("accepts stale allowAiUse metadata after active-policy authorization and drops invalid status", async () => {
    const { deps, generateCalls } = makeDeps({
      loadChunksByIds: async () => [
        makeLoadedChunk({ allowAiUse: false }),
        makeLoadedChunk({ chunkId: CHUNK_ID_B, status: "EMBEDDING" as const }),
      ],
    });
    const result = await makeExecutor(deps).execute(runContext(), {
      ...VALID_INPUT,
      approvedEvidenceIds: [CHUNK_ID, CHUNK_ID_B],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.decision, "grounded_answer");
      assert.deepEqual(result.output.citedChunkIds, [CHUNK_ID]);
    }
    assert.equal(generateCalls.length, 1);
  });

  it("drops chunks whose parent document is ineligible", async () => {
    const { deps } = makeDeps({
      loadEligibleDocumentIds: async () => [DOC_ID],
      loadChunksByIds: async () => [
        makeLoadedChunk(),
        makeLoadedChunk({
          chunkId: CHUNK_ID_B,
          documentId: DOC_ID_B,
          text: "Other document text.",
        }),
      ],
    });
    const result = await makeExecutor(deps).execute(runContext(), {
      ...VALID_INPUT,
      approvedEvidenceIds: [CHUNK_ID, CHUNK_ID_B],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.decision, "grounded_answer");
      assert.deepEqual(result.output.citedChunkIds, [CHUNK_ID]);
    }
  });

  it("drops evidence whose document reauthorization fails", async () => {
    const { deps } = makeDeps({
      authorization: {
        authorizeDocumentAction: async (_ctx: unknown, documentId: string) => {
          if (documentId === DOC_ID_B) throw new AppError(404, "DOCUMENT_NOT_FOUND", "missing");
        },
      } as unknown as DocumentAccessAuthorizationService,
      loadChunksByIds: async () => [
        makeLoadedChunk(),
        makeLoadedChunk({
          chunkId: CHUNK_ID_B,
          documentId: DOC_ID_B,
          text: "Other document text.",
        }),
      ],
    });
    const result = await makeExecutor(deps).execute(runContext(), {
      ...VALID_INPUT,
      approvedEvidenceIds: [CHUNK_ID, CHUNK_ID_B],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.decision, "grounded_answer");
      assert.deepEqual(result.output.citedChunkIds, [CHUNK_ID]);
    }
  });

  // ── generation mapping ─────────────────────────────────────────────────────

  it("passes the question, language, and server-loaded evidence to the generator", async () => {
    const { deps, generateCalls } = makeDeps();
    await makeExecutor(deps).execute(
      runContext(),
      { ...VALID_INPUT, language: "ar" },
    );
    assert.equal(generateCalls.length, 1);
    const call = generateCalls[0] as {
      conversationId: string;
      question: string;
      language: string;
      task: string;
      citationsEnabled: boolean;
      evidence: unknown[];
      maxTokens: number;
    };
    assert.equal(call.conversationId, CONVERSATION_ID);
    assert.equal(call.question, "What is the remote work policy?");
    assert.equal(call.language, "ar");
    assert.equal(call.task, "direct_question");
    assert.equal(call.citationsEnabled, true);
    assert.equal(call.evidence.length, 1);
    assert.equal((call.evidence[0] as { chunkId: string }).chunkId, CHUNK_ID);
    assert.equal(call.maxTokens, 1024);
  });

  it("forwards trusted summary, citation, and token settings without conversation history", async () => {
    const { deps, generateCalls } = makeDeps();
    await makeExecutor(deps).execute(runContext(), {
      ...VALID_INPUT,
      task: "document_summary",
      citationsEnabled: false,
      maxTokens: 2048,
    });
    const call = generateCalls[0] as {
      task: string;
      citationsEnabled: boolean;
      maxTokens: number;
    };
    assert.equal(call.task, "document_summary");
    assert.equal(call.citationsEnabled, false);
    assert.equal("historyFromDb" in call, false);
    assert.equal(call.maxTokens, 2048);
  });

  it("reports provider/token/cost metadata on a successful generation", async () => {
    const { deps } = makeDeps({
      answerWriter: fakeAnswerWriter({
        result: usableResult({
          providerKey: "groq",
          modelName: "llama-3.1",
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          estimatedCost: 0.0012,
          latencyMs: 42,
        }),
      }).answerWriter,
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.metadata?.modelProvider, "groq");
      assert.equal(result.metadata?.modelName, "llama-3.1");
      assert.equal(result.metadata?.tokensUsed, 150);
      assert.equal(result.metadata?.estimatedCost, 0.0012);
      assert.equal(result.metadata?.latencyMs, 42);
    }
  });

  it("fails closed with the localized message when the generator produces no usable output", async () => {
    const { deps } = makeDeps({
      answerWriter: fakeAnswerWriter({
        result: {
          outcome: "unusable",
          rawContent: "",
          sanitizedContent: "",
          providerKey: "fake",
          modelName: "fake-chat",
          promptTokens: 10,
          completionTokens: 0,
          totalTokens: 10,
          latencyMs: 5,
          estimatedCost: 0,
        },
      }).answerWriter,
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, "completed");
      assert.equal(result.output.decision, "insufficient_evidence");
      assert.equal(result.output.answer, insufficientEvidenceMessage("en"));
      assert.deepEqual(result.output.citedChunkIds, []);
    }
  });

  it("fails closed with the localized message when the generator returns the parse-failure fallback", async () => {
    const { deps } = makeDeps({
      answerWriter: fakeAnswerWriter({
        result: usableResult({
          structured: false,
          parsedDecision: "insufficient_evidence",
          decision: "insufficient_evidence",
          answer: "Here is some raw model text that never parsed.",
          sanitizedContent: "Here is some raw model text that never parsed.",
          citedChunkIds: [],
        }),
      }).answerWriter,
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.decision, "insufficient_evidence");
      assert.equal(result.output.answer, insufficientEvidenceMessage("en"));
      assert.notEqual(result.output.answer, "Here is some raw model text that never parsed.");
      assert.deepEqual(result.output.citedChunkIds, []);
    }
  });

  it("fails closed with the localized message when the model claimed grounded_answer with no cited chunks", async () => {
    const { deps } = makeDeps({
      answerWriter: fakeAnswerWriter({
        result: usableResult({
          structured: true,
          parsedDecision: "grounded_answer",
          decision: "insufficient_evidence",
          answer: "Three days per week.",
          sanitizedContent: "Three days per week.",
          citedChunkIds: [],
        }),
      }).answerWriter,
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.decision, "insufficient_evidence");
      assert.equal(result.output.answer, insufficientEvidenceMessage("en"));
      assert.notEqual(result.output.answer, "Three days per week.");
      assert.deepEqual(result.output.citedChunkIds, []);
    }
  });

  it("passes through a genuine model-declared insufficient_evidence answer", async () => {
    const { deps } = makeDeps({
      answerWriter: fakeAnswerWriter({
        result: usableResult({
          structured: true,
          parsedDecision: "insufficient_evidence",
          decision: "insufficient_evidence",
          answer: "I could not find enough information.",
          sanitizedContent: "I could not find enough information.",
          citedChunkIds: [],
        }),
      }).answerWriter,
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.decision, "insufficient_evidence");
      assert.equal(result.output.answer, "I could not find enough information.");
      assert.deepEqual(result.output.citedChunkIds, []);
    }
  });

  it("passes through a valid non-grounded decision such as clarification", async () => {
    const { deps } = makeDeps({
      answerWriter: fakeAnswerWriter({
        result: usableResult({
          structured: true,
          parsedDecision: "clarification",
          decision: "clarification",
          answer: "Could you clarify which document you mean?",
          sanitizedContent: "Could you clarify which document you mean?",
          citedChunkIds: [],
        }),
      }).answerWriter,
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.decision, "clarification");
      assert.equal(result.output.answer, "Could you clarify which document you mean?");
    }
  });

  it("uses the Arabic localized message for Arabic requests when failing closed", async () => {
    const { deps } = makeDeps({
      answerWriter: fakeAnswerWriter({
        result: usableResult({
          structured: false,
          parsedDecision: "insufficient_evidence",
          decision: "insufficient_evidence",
          answer: "plain prose that never parsed",
          sanitizedContent: "plain prose that never parsed",
          citedChunkIds: [],
        }),
      }).answerWriter,
    });
    const result = await makeExecutor(deps).execute(runContext(), {
      ...VALID_INPUT,
      language: "ar",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.decision, "insufficient_evidence");
      assert.equal(result.output.answer, insufficientEvidenceMessage("ar"));
    }
  });

  it("reports token/cost metadata on a fail-closed completed result", async () => {
    const { deps } = makeDeps({
      answerWriter: fakeAnswerWriter({
        result: usableResult({
          structured: false,
          parsedDecision: "insufficient_evidence",
          decision: "insufficient_evidence",
          answer: "raw text",
          sanitizedContent: "raw text",
          citedChunkIds: [],
          promptTokens: 90,
          completionTokens: 10,
          totalTokens: 100,
          estimatedCost: 0.0004,
        }),
      }).answerWriter,
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.metadata?.tokensUsed, 100);
      assert.equal(result.metadata?.estimatedCost, 0.0004);
    }
  });

  it("maps an unauthorized provider error to the unauthorized status", async () => {
    const { deps } = makeDeps({
      answerWriter: fakeAnswerWriter({
        error: new AppError(403, "PERMISSION_REQUIRED", "not allowed"),
      }).answerWriter,
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, "unauthorized");
      assert.equal(result.error.code, "PERMISSION_REQUIRED");
    }
  });

  it("maps unexpected errors to AGENT_PROVIDER_ERROR", async () => {
    const { deps } = makeDeps({
      answerWriter: fakeAnswerWriter({
        error: new Error("boom"),
      }).answerWriter,
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, "failed");
      assert.equal(result.error.code, AGENT_PROVIDER_ERROR);
      assert.equal(result.error.message, "Answer generation failed");
    }
  });

  it("generates a grounded answer end-to-end through the real service", async () => {
    const { deps } = makeDeps({
      answerWriter: new AnswerWriterService(new FakeModelAdapter()),
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.decision, "grounded_answer");
      assert.equal(result.output.answer, "Simulated grounded answer.");
      assert.deepEqual(result.output.citedChunkIds, [CHUNK_ID]);
      assert.equal(result.metadata?.modelProvider, "fake");
      assert.ok((result.metadata?.tokensUsed ?? 0) > 0);
    }
  });

  // ── invalid / unusable model content, end-to-end through the real service ──

  const INVALID_CONTENT_CASES: Array<{ name: string; content: string }> = [
    { name: "plain text", content: "The remote work policy allows three days per week." },
    { name: "malformed JSON", content: '{"decision": "grounded_answer", "answer": ' },
    { name: "empty provider output", content: "" },
    { name: "unknown decision", content: '{"decision":"maybe_grounded","answer":"hi","citedChunkIds":["chunk-1"]}' },
    { name: "unknown output key", content: '{"decision":"grounded_answer","answer":"hi","citedChunkIds":["chunk-1"],"confidential":"secret"}' },
    { name: "grounded_answer missing citedChunkIds", content: '{"decision":"grounded_answer","answer":"hi"}' },
    { name: "grounded_answer with empty citedChunkIds", content: '{"decision":"grounded_answer","answer":"hi","citedChunkIds":[]}' },
    { name: "grounded_answer with empty answer", content: '{"decision":"grounded_answer","answer":"","citedChunkIds":["chunk-1"]}' },
  ];

  for (const { name, content } of INVALID_CONTENT_CASES) {
    it(`fails closed with the localized message for ${name}`, async () => {
      const { deps } = makeDeps({
        answerWriter: new AnswerWriterService(scriptedAnswerAdapter({ content })),
      });
      const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.status, "completed");
        assert.equal(result.output.decision, "insufficient_evidence");
        assert.equal(result.output.answer, insufficientEvidenceMessage("en"));
        assert.deepEqual(result.output.citedChunkIds, []);
      }
    });
  }

  it("returns a controlled failed AgentResult when the provider throws a real AppError", async () => {
    const { deps } = makeDeps({
      answerWriter: new AnswerWriterService(
        scriptedAnswerAdapter({
          content: "",
          throwError: new AppError(503, "LLM_PROVIDER_UNAVAILABLE", "provider down"),
        }),
      ),
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, "failed");
      assert.equal(result.error.code, "LLM_PROVIDER_UNAVAILABLE");
    }
  });
});
