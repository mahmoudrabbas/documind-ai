import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_ALREADY_REGISTERED,
  AGENT_CONTRACT_INVALID,
  AGENT_PROVIDER_ERROR,
  ENTITLEMENT_EXCEEDED,
  INTENT_QUERY_CONTEXT_UNAUTHORIZED,
  RATE_LIMITED,
} from "../../common/errors/errorCodes.js";
import type { IntentClassValue, QueryPlan } from "../intent-query/intentQuery.types.js";
import type { IntentQueryService } from "../intent-query/intentQuery.service.js";
import type { AgentRunContext } from "./agentRunContext.js";
import { createChatAgentRegistry } from "./chatAgents.js";
import { IntentAgentInputSchema, IntentAgentOutputSchema } from "./chatAgentIO.js";
import { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import {
  INTENT_QUERY_AGENT_ID,
  INTENT_QUERY_AGENT_VERSION,
  IntentQueryAgentExecutor,
  mapQueryPlanToAgentOutput,
  registerIntentQueryAgentExecutor,
} from "./intentQueryAgent.js";

// ── fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = "507f1f77bcf86cd799439011";
const ACTOR_ID = "507f1f77bcf86cd799439012";
const CONVERSATION_ID = "507f1f77bcf86cd799439013";

function baseQueryPlan(): QueryPlan {
  return {
    schemaVersion: "1.0.0",
    normalizedQuestion: "What is the leave policy?",
    originalQuestion: "What is the leave policy?",
    language: "en",
    detectedIntent: "knowledge_question",
    intentConfidence: 0.92,
    route: "rag",
    socialSubtype: "acknowledgement",
    entities: [],
    temporalConstraints: [],
    referencedDocumentIds: [],
    referencedDocumentTitles: [],
    departments: [],
    categories: [],
    exactTerms: [],
    semanticQueries: [{ text: "leave policy", language: "en", weight: 1 }],
    keywordQueries: [],
    clarificationNeeded: false,
    clarification: null,
    isFollowUp: false,
    conversationContextUsed: false,
    promptVersion: "1.0.0",
    modelVersion: "fake",
    processingMetadata: {
      tokensUsed: 120,
      latencyMs: 15,
      estimatedCost: 0.0012,
      fallbackUsed: false,
    },
  };
}

function plan(overrides: Partial<QueryPlan> = {}): QueryPlan {
  return { ...baseQueryPlan(), ...overrides };
}

function runContext(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    actorEmail: "employee@example.com",
    actorRole: "EMPLOYEE",
    traceId: "trace-1",
    requestId: "req-1",
    workflowName: "chat-rag-v1",
    agentName: INTENT_QUERY_AGENT_ID,
    runId: "run-1",
    stepIndex: 1,
    maxSteps: 10,
    maxToolCalls: 20,
    maxTokens: 100_000,
    budgetMs: 60_000,
    ...overrides,
  };
}

const VALID_INPUT = {
  conversationId: CONVERSATION_ID,
  question: "What is the leave policy?",
};

interface CapturedAnalyzeCall {
  rawInput: unknown;
  context: unknown;
}

function fakeService(options: {
  plan?: QueryPlan;
  error?: unknown;
  onAnalyze?: (rawInput: unknown, context: unknown) => void;
} = {}): { service: IntentQueryService; calls: CapturedAnalyzeCall[] } {
  const calls: CapturedAnalyzeCall[] = [];
  const service = {
    analyzeQuery: async (rawInput: unknown, context: unknown) => {
      calls.push({ rawInput, context });
      options.onAnalyze?.(rawInput, context);
      if (options.error !== undefined) {
        throw options.error;
      }
      return options.plan ?? baseQueryPlan();
    },
  } as unknown as IntentQueryService;
  return { service, calls };
}

function makeExecutor(
  service: IntentQueryService,
): IntentQueryAgentExecutor {
  return new IntentQueryAgentExecutor({ service });
}

// ── A. Contract shape & registration ────────────────────────────────────────

describe("intent-query-agent contract", () => {
  it("uses the exact approved agent id", () => {
    const { service } = fakeService();
    assert.equal(makeExecutor(service).id, "intent-query-agent");
    assert.equal(INTENT_QUERY_AGENT_ID, "intent-query-agent");
  });

  it("exposes a version string", () => {
    const { service } = fakeService();
    assert.equal(typeof makeExecutor(service).version, "string");
    assert.equal(INTENT_QUERY_AGENT_VERSION, "1.0.0");
  });

  it("declares only the read capability", () => {
    const { service } = fakeService();
    assert.deepEqual(makeExecutor(service).capabilities, ["read"]);
  });

  it("uses the canonical IntentAgentInputSchema", () => {
    const { service } = fakeService();
    assert.equal(makeExecutor(service).inputSchema, IntentAgentInputSchema);
  });

  it("uses the canonical IntentAgentOutputSchema", () => {
    const { service } = fakeService();
    assert.equal(makeExecutor(service).outputSchema, IntentAgentOutputSchema);
  });

  it("register helper registers the executor with the approved registry", () => {
    const { service } = fakeService();
    const registry = new AgentExecutorRegistry(createChatAgentRegistry());
    const definition = registerIntentQueryAgentExecutor(registry, service);
    assert.equal(registry.hasExecutor("intent-query-agent"), true);
    assert.equal(definition.id, "intent-query-agent");
    assert.equal(definition.status, "active");
  });

  it("register helper rejects duplicate registration", () => {
    const { service } = fakeService();
    const registry = new AgentExecutorRegistry(createChatAgentRegistry());
    registerIntentQueryAgentExecutor(registry, service);
    assert.throws(
      () => registerIntentQueryAgentExecutor(registry, service),
      (error: unknown) =>
        error instanceof AppError && error.code === AGENT_ALREADY_REGISTERED,
    );
  });

  it("returns the same executor via registry lookup", () => {
    const { service } = fakeService();
    const registry = new AgentExecutorRegistry(createChatAgentRegistry());
    registerIntentQueryAgentExecutor(registry, service);
    assert.equal(registry.getExecutor("intent-query-agent").id, "intent-query-agent");
  });
});

// ── B. Input validation (fail-closed) ───────────────────────────────────────

describe("intent-query-agent input validation", () => {
  it("accepts a valid input and completes", async () => {
    const { service } = fakeService();
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
  });

  it("rejects input without a conversationId", async () => {
    const { service } = fakeService();
    const result = await makeExecutor(service).execute(runContext(), {
      question: "What is the leave policy?",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_CONTRACT_INVALID);
  });

  it("rejects an empty question", async () => {
    const { service } = fakeService();
    const result = await makeExecutor(service).execute(runContext(), {
      conversationId: CONVERSATION_ID,
      question: "",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, AGENT_CONTRACT_INVALID);
  });

  it("rejects non-object input", async () => {
    const { service } = fakeService();
    const result = await makeExecutor(service).execute(runContext(), "not-an-object");
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, AGENT_CONTRACT_INVALID);
  });

  it("rejects null input", async () => {
    const { service } = fakeService();
    const result = await makeExecutor(service).execute(runContext(), null);
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, AGENT_CONTRACT_INVALID);
  });

  it("rejects unknown input keys (strict)", async () => {
    const { service } = fakeService();
    const result = await makeExecutor(service).execute(runContext(), {
      ...VALID_INPUT,
      tenantId: TENANT_ID,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, AGENT_CONTRACT_INVALID);
  });

  it("rejects an over-long question", async () => {
    const { service } = fakeService();
    const result = await makeExecutor(service).execute(runContext(), {
      conversationId: CONVERSATION_ID,
      question: "x".repeat(2001),
    });
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, AGENT_CONTRACT_INVALID);
  });

  it("forwards the validated question to the service", async () => {
    const { service, calls } = fakeService();
    await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const call = calls[0].rawInput as Record<string, unknown>;
    assert.equal(call.question, "What is the leave policy?");
    assert.equal(call.conversationId, CONVERSATION_ID);
  });

  it("forwards language and referencedDocumentIds when present", async () => {
    const { service, calls } = fakeService();
    await makeExecutor(service).execute(runContext(), {
      conversationId: CONVERSATION_ID,
      question: "What is the leave policy?",
      language: "ar",
      referencedDocumentIds: ["64a000000000000000000001"],
    });
    const call = calls[0].rawInput as Record<string, unknown>;
    assert.equal(call.language, "ar");
    assert.deepEqual(call.referencedDocumentIds, ["64a000000000000000000001"]);
  });

  it("uses the same bounded conversation context window as the chat path", async () => {
    const { service, calls } = fakeService();
    await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const call = calls[0].rawInput as Record<string, unknown>;
    assert.equal(call.maxContext, 5);
  });

  it("forwards the trusted run-context identity to the service", async () => {
    const { service, calls } = fakeService();
    await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const call = calls[0].context as Record<string, unknown>;
    assert.equal(call.tenantId, TENANT_ID);
    assert.equal(call.actorId, ACTOR_ID);
    assert.equal(call.actorEmail, "employee@example.com");
    assert.equal(call.actorRole, "EMPLOYEE");
    assert.equal(call.traceId, "trace-1");
    assert.equal(call.requestId, "req-1");
  });

  it("never reads identity from the handoff payload", async () => {
    const { service, calls } = fakeService();
    await makeExecutor(service).execute(runContext(), {
      ...VALID_INPUT,
    });
    const call = calls[0].rawInput as Record<string, unknown>;
    assert.equal("tenantId" in call, false);
    assert.equal("actorId" in call, false);
    assert.equal("actorRole" in call, false);
  });
});

// ── C. Output mapping ───────────────────────────────────────────────────────

describe("intent-query-agent output mapping", () => {
  it("maps a rag plan into the contract output", async () => {
    const { service } = fakeService({
      plan: plan({
        normalizedQuestion: "Leave policy summary",
        language: "en",
        detectedIntent: "knowledge_question",
        intentConfidence: 0.92,
        route: "rag",
        referencedDocumentIds: ["64a000000000000000000001"],
        isFollowUp: true,
      }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    const output = result.ok ? result.output : null;
    assert.equal(output?.normalizedQuestion, "Leave policy summary");
    assert.equal(output?.language, "en");
    assert.equal(output?.route, "rag");
    assert.equal(output?.intent, "knowledge_question");
    assert.equal(output?.intentConfidence, 0.92);
    assert.deepEqual(output?.referencedDocumentIds, ["64a000000000000000000001"]);
    assert.equal(output?.isFollowUp, true);
  });

  it("maps intent from the canonical detectedIntent field", async () => {
    const { service } = fakeService({
      plan: plan({ detectedIntent: "summarization", route: "rag" }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.equal(output?.intent, "summarization");
  });

  it("maps clarification flags and payload", async () => {
    const { service } = fakeService({
      plan: plan({
        route: "clarification",
        clarificationNeeded: true,
        clarification: {
          reason: "ambiguous_intent",
          suggestedQuestions: ["Which document?"],
          messageEn: "Could you clarify?",
        },
      }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.equal(output?.clarificationNeeded, true);
    assert.equal(output?.clarification?.reason, "ambiguous_intent");
    assert.equal(output?.clarification?.messageEn, "Could you clarify?");
  });

  it("maps social subtype only on the social route", async () => {
    const { service } = fakeService({
      plan: plan({
        route: "social",
        detectedIntent: "social",
        socialSubtype: "greeting",
      }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.equal(output?.socialSubtype, "greeting");
  });

  it("omits socialSubtype on non-social routes", async () => {
    const { service } = fakeService({ plan: plan({ route: "rag" }) });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.equal("socialSubtype" in (output ?? {}), false);
  });

  it("emits the full search plan on the rag route", async () => {
    const { service } = fakeService({
      plan: plan({
        route: "rag",
        semanticQueries: [
          { text: "leave policy", language: "en", weight: 1 },
          { text: "vacation rules", language: "en", weight: 0.8 },
        ],
        keywordQueries: [{ terms: ["leave"], language: "en", mustMatch: true }],
        exactTerms: ["Leave Policy"],
        referencedDocumentTitles: ["Employee Handbook"],
        departments: ["HR"],
        categories: ["Benefits"],
        entities: [
          {
            text: "HR",
            type: "department",
            language: "en",
            preserveExact: false,
          },
        ],
        temporalConstraints: [
          { type: "after", value: "2024-01-01", rawText: "since 2024" },
        ],
      }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.equal(output?.semanticQueries.length, 2);
    assert.equal(output?.keywordQueries.length, 1);
    assert.deepEqual(output?.exactTerms, ["Leave Policy"]);
    assert.deepEqual(output?.referencedDocumentTitles, ["Employee Handbook"]);
    assert.deepEqual(output?.departments, ["HR"]);
    assert.deepEqual(output?.categories, ["Benefits"]);
    assert.equal(output?.entities.length, 1);
    assert.equal(output?.temporalConstraints.length, 1);
  });

  it("derives RAG_REQUIRED reason code on the rag route", async () => {
    const { service } = fakeService({ plan: plan({ route: "rag" }) });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.equal(output?.reasonCode, "RAG_REQUIRED");
  });

  it("derives SOCIAL_INTENT reason code on the social route", async () => {
    const { service } = fakeService({
      plan: plan({ route: "social", detectedIntent: "social" }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.equal(output?.reasonCode, "SOCIAL_INTENT");
  });

  it("derives UNSUPPORTED_INTENT reason code on the unsupported route", async () => {
    const { service } = fakeService({
      plan: plan({ route: "unsupported", detectedIntent: "unsupported" }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.equal(output?.reasonCode, "UNSUPPORTED_INTENT");
  });

  it("derives UNSAFE_INTENT reason code on the unsafe route", async () => {
    const { service } = fakeService({
      plan: plan({ route: "unsafe", detectedIntent: "unsafe" }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.equal(output?.reasonCode, "UNSAFE_INTENT");
  });

  it("derives CLARIFICATION_REQUIRED reason code on the clarification route", async () => {
    const { service } = fakeService({
      plan: plan({ route: "clarification", clarificationNeeded: true }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.equal(output?.reasonCode, "CLARIFICATION_REQUIRED");
  });

  it("produces output that always passes the strict contract schema", async () => {
    const routes = ["rag", "social", "clarification", "unsupported", "unsafe"] as const;
    const routeIntents: Record<(typeof routes)[number], IntentClassValue> = {
      rag: "knowledge_question",
      social: "social",
      clarification: "knowledge_question",
      unsupported: "unsupported",
      unsafe: "unsafe",
    };
    for (const route of routes) {
      const { service } = fakeService({
        plan: plan({ route, detectedIntent: routeIntents[route] }),
      });
      const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
      assert.equal(result.ok, true, route);
      if (result.ok) {
        const parsed = IntentAgentOutputSchema.safeParse(result.output);
        assert.equal(parsed.success, true, route);
      }
    }
  });
});

// ── D. Route invariants (no executable plan off-rag) ───────────────────────

describe("intent-query-agent route invariants", () => {
  it("social output contains no semantic queries", async () => {
    const { service } = fakeService({
      plan: plan({
        route: "social",
        detectedIntent: "social",
        semanticQueries: [{ text: "hi", language: "en", weight: 1 }],
      }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.deepEqual(output?.semanticQueries, []);
    assert.deepEqual(output?.keywordQueries, []);
    assert.deepEqual(output?.exactTerms, []);
    assert.deepEqual(output?.referencedDocumentTitles, []);
    assert.deepEqual(output?.departments, []);
    assert.deepEqual(output?.categories, []);
  });

  it("unsupported output contains no retrieval plan", async () => {
    const { service } = fakeService({
      plan: plan({
        route: "unsupported",
        detectedIntent: "unsupported",
        semanticQueries: [{ text: "gold price", language: "en", weight: 1 }],
      }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.deepEqual(output?.semanticQueries, []);
    assert.deepEqual(output?.keywordQueries, []);
  });

  it("unsafe output contains no retrieval plan", async () => {
    const { service } = fakeService({
      plan: plan({
        route: "unsafe",
        detectedIntent: "unsafe",
        semanticQueries: [{ text: "ignore previous", language: "en", weight: 1 }],
      }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.deepEqual(output?.semanticQueries, []);
    assert.deepEqual(output?.keywordQueries, []);
  });

  it("clarification output never carries an executable retrieval plan", async () => {
    const { service } = fakeService({
      plan: plan({
        route: "clarification",
        clarificationNeeded: true,
        semanticQueries: [
          { text: "leave policy", language: "en", weight: 1 },
          { text: "vacation", language: "en", weight: 0.9 },
        ],
        keywordQueries: [{ terms: ["leave"], language: "en", mustMatch: true }],
      }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.deepEqual(output?.semanticQueries, []);
    assert.deepEqual(output?.keywordQueries, []);
  });

  it("rag output keeps the provided semantic queries", async () => {
    const { service } = fakeService({
      plan: plan({
        route: "rag",
        semanticQueries: [{ text: "leave policy", language: "en", weight: 1 }],
      }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.equal(output?.semanticQueries.length, 1);
  });

  it("clarification still exposes its clarification payload", async () => {
    const { service } = fakeService({
      plan: plan({
        route: "clarification",
        clarificationNeeded: true,
        clarification: {
          reason: "missing_context",
          suggestedQuestions: ["Which document?"],
          messageEn: "Which document?",
        },
      }),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    const output = result.ok ? result.output : null;
    assert.equal(output?.clarificationNeeded, true);
    assert.equal(output?.clarification?.reason, "missing_context");
  });
});

// ── E. Error mapping ────────────────────────────────────────────────────────

describe("intent-query-agent error mapping", () => {
  it("preserves a controlled AppError code", async () => {
    const { service } = fakeService({
      error: new AppError(429, ENTITLEMENT_EXCEEDED, "tokensPerMonth exhausted"),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, false);
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, ENTITLEMENT_EXCEEDED);
  });

  it("preserves a rate-limit AppError code", async () => {
    const { service } = fakeService({
      error: new AppError(429, RATE_LIMITED, "slow down"),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, false);
    assert.equal(result.error?.code, RATE_LIMITED);
  });

  it("maps 403 authorization failures to unauthorized status", async () => {
    const { service } = fakeService({
      error: new AppError(
        403,
        INTENT_QUERY_CONTEXT_UNAUTHORIZED,
        "document not accessible",
      ),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, false);
    assert.equal(result.status, "unauthorized");
    assert.equal(result.error?.code, INTENT_QUERY_CONTEXT_UNAUTHORIZED);
  });

  it("maps 401 failures to unauthorized status", async () => {
    const { service } = fakeService({
      error: new AppError(401, "AUTHENTICATION_FAILED", "expired"),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, false);
    assert.equal(result.status, "unauthorized");
    assert.equal(result.error?.code, "AUTHENTICATION_FAILED");
  });

  it("collapses unexpected non-AppError failures to AGENT_PROVIDER_ERROR", async () => {
    const { service } = fakeService({
      error: new Error("provider exploded"),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, false);
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AGENT_PROVIDER_ERROR);
  });

  it("never leaks the raw provider message on unexpected failures", async () => {
    const { service } = fakeService({
      error: new Error("SECRET_PROVIDER_DETAILS"),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, false);
    assert.equal(result.error?.message.includes("SECRET_PROVIDER_DETAILS"), false);
  });

  it("reports latency on failed results", async () => {
    const { service } = fakeService({
      error: new AppError(500, "AGENT_PROVIDER_ERROR", "boom"),
    });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, false);
    assert.equal(typeof result.latencyMs, "number");
  });
});

// ── F. Tracing metadata ─────────────────────────────────────────────────────

describe("intent-query-agent tracing metadata", () => {
  it("reports the model provider key", async () => {
    const { service } = fakeService({ plan: plan({ modelVersion: "fake" }) });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    assert.equal(result.metadata?.modelProvider, "fake");
  });

  it("reports the model name", async () => {
    const { service } = fakeService({ plan: plan({ modelVersion: "groq" }) });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    assert.equal(result.metadata?.modelName, "groq");
  });

  it("reports the prompt version", async () => {
    const { service } = fakeService({ plan: plan({ promptVersion: "1.0.0" }) });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    assert.equal(result.metadata?.promptVersion, "1.0.0");
  });

  it("reports no promptVersionId when none exists", async () => {
    const { service } = fakeService();
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    assert.equal(result.metadata?.promptVersionId, null);
  });

  it("reports tokens used from the plan processing metadata", async () => {
    const { service } = fakeService({ plan: plan() });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    assert.equal(result.metadata?.tokensUsed, 120);
  });

  it("reports estimated cost from the plan processing metadata", async () => {
    const { service } = fakeService({ plan: plan() });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    assert.equal(result.metadata?.estimatedCost, 0.0012);
  });

  it("reports the LLM latency from the plan processing metadata", async () => {
    const { service } = fakeService({ plan: plan() });
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    assert.equal(result.metadata?.latencyMs, 15);
  });

  it("reports wall-clock execution latency on the result", async () => {
    const { service } = fakeService();
    const result = await makeExecutor(service).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    assert.equal(typeof result.latencyMs, "number");
    assert.ok(result.latencyMs >= 0);
  });
});

// ── G. Output schema conformance & bounds ───────────────────────────────────

describe("IntentAgentOutputSchema (Issue 3 extension)", () => {
  it("keeps legacy minimal outputs valid (backward compatible)", () => {
    const value = {
      normalizedQuestion: "Leave policy summary",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.92,
      referencedDocumentIds: ["64a000000000000000000001"],
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, true);
  });

  it("defaults search-plan arrays to empty", () => {
    const parsed = IntentAgentOutputSchema.parse({
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.9,
    });
    assert.deepEqual(parsed.semanticQueries, []);
    assert.deepEqual(parsed.keywordQueries, []);
    assert.deepEqual(parsed.exactTerms, []);
    assert.deepEqual(parsed.referencedDocumentTitles, []);
    assert.deepEqual(parsed.departments, []);
    assert.deepEqual(parsed.categories, []);
  });

  it("accepts a fully-populated search-plan output", () => {
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.9,
      reasonCode: "RAG_REQUIRED",
      semanticQueries: [{ text: "a", language: "en", weight: 1 }],
      keywordQueries: [{ terms: ["a"], language: "en", mustMatch: false }],
      exactTerms: ["A"],
      entities: [
        { text: "HR", type: "department", language: "en", preserveExact: false },
      ],
      referencedDocumentTitles: ["Handbook"],
      temporalConstraints: [{ type: "after", value: "2024", rawText: "after" }],
      departments: ["HR"],
      categories: ["Policies"],
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, true);
  });

  it("rejects chain-of-thought keys", () => {
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.9,
      chainOfThought: "secret reasoning",
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
  });

  it("rejects raw document content keys", () => {
    for (const key of ["documentText", "chunkText", "rawContent", "prompt"]) {
      const value = {
        normalizedQuestion: "q",
        language: "en",
        route: "rag",
        intent: "knowledge_question",
        intentConfidence: 0.9,
        [key]: "secret document body",
      };
      assert.equal(IntentAgentOutputSchema.safeParse(value).success, false, key);
    }
  });

  it("rejects unknown top-level keys (strict)", () => {
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.9,
      injected: true,
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
  });

  it("bounds semanticQueries at 10", () => {
    const queries = Array.from({ length: 11 }, (_, i) => ({
      text: `q${i}`,
      language: "en",
      weight: 1,
    }));
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.9,
      semanticQueries: queries,
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
  });

  it("bounds keywordQueries at 10", () => {
    const queries = Array.from({ length: 11 }, (_, i) => ({
      terms: [`t${i}`],
      language: "en",
      mustMatch: false,
    }));
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.9,
      keywordQueries: queries,
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
  });

  it("bounds exactTerms at 30", () => {
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.9,
      exactTerms: Array.from({ length: 31 }, (_, i) => `t${i}`),
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
  });

  it("bounds entities at 50", () => {
    const entities = Array.from({ length: 51 }, (_, i) => ({
      text: `e${i}`,
      type: "other",
      language: "en",
      preserveExact: false,
    }));
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.9,
      entities,
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
  });

  it("bounds referencedDocumentTitles at 20", () => {
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.9,
      referencedDocumentTitles: Array.from({ length: 21 }, (_, i) => `doc${i}`),
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
  });

  it("bounds departments at 20", () => {
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.9,
      departments: Array.from({ length: 21 }, (_, i) => `d${i}`),
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
  });

  it("bounds categories at 20", () => {
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.9,
      categories: Array.from({ length: 21 }, (_, i) => `c${i}`),
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
  });

  it("bounds reasonCode at 100 chars", () => {
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.9,
      reasonCode: "X".repeat(101),
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
  });

  it("bounds individual semantic query text at 1000 chars", () => {
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "knowledge_question",
      intentConfidence: 0.9,
      semanticQueries: [{ text: "x".repeat(1001), language: "en", weight: 1 }],
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
  });

  it("validates route literals", () => {
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "not-a-route",
      intent: "knowledge_question",
      intentConfidence: 0.9,
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
  });

  it("validates intent literals", () => {
    const value = {
      normalizedQuestion: "q",
      language: "en",
      route: "rag",
      intent: "made_up_intent",
      intentConfidence: 0.9,
    };
    assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
  });

  it("validates confidence range", () => {
    for (const confidence of [-0.1, 1.1]) {
      const value = {
        normalizedQuestion: "q",
        language: "en",
        route: "rag",
        intent: "knowledge_question",
        intentConfidence: confidence,
      };
      assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
    }
  });
});

// ── K. mapQueryPlanToAgentOutput pure function ──────────────────────────────

describe("mapQueryPlanToAgentOutput", () => {
  it("maps every query-plan field deterministically", () => {
    const output = mapQueryPlanToAgentOutput(
      plan({
        route: "rag",
        referencedDocumentIds: ["64a000000000000000000001"],
      }),
    );
    assert.equal(output.reasonCode, "RAG_REQUIRED");
    assert.equal(output.semanticQueries.length, 1);
  });

  it("is a pure function that never mutates the input plan", () => {
    const input = plan({ route: "rag" });
    const snapshot = JSON.stringify(input);
    mapQueryPlanToAgentOutput(input);
    assert.equal(JSON.stringify(input), snapshot);
  });
});
