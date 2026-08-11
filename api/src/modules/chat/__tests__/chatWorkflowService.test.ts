import { describe, expect, it, vi } from "vitest";
import type { BaseRole } from "../../../common/auth/baseRoles.js";
import type { MessageSource } from "../../../db/models/message.model.js";
import type { SupervisorRuntimeHooks } from "../../agents/supervisorRuntime.js";
import type { SupervisorDecision } from "../../agents/supervisorDecision.js";
import { insufficientEvidenceMessage } from "../../agents/answerWriter.service.js";
import type { LoadedChunkCandidate } from "../../agents/tools/authorizedRetrievalTools.js";
import { Permission } from "../../permissions/permissions.catalog.js";
import type {
  PermissionEvaluator,
  ResolvedPermissions,
} from "../../permissions/permissions.types.js";
import {
  buildAuthorizedSearchQueryText,
  ChatWorkflowService,
  type ChatWorkflowRepository,
  type ChatWorkflowServiceDependencies,
} from "../chatWorkflowService.js";

describe("buildAuthorizedSearchQueryText", () => {
  it("prioritizes a bounded English expansion for an Arabic search", () => {
    const question = "هل الموظف اللي اشتغل ٣٠ يوم يقدر يطلب العمل عن بعد؟";
    expect(buildAuthorizedSearchQueryText({
      normalizedQuestion: question,
      language: "ar",
      semanticQueries: [
        { text: question, language: "ar", weight: 1 },
        { text: "employee employment remote work", language: "en", weight: 0.7 },
      ],
    })).toBe(`employee employment remote work\n${question}`);
  });

  it("does not append same-language provider paraphrases", () => {
    expect(buildAuthorizedSearchQueryText({
      normalizedQuestion: "trusted normalized question",
      language: "en",
      semanticQueries: [
        { text: "provider rewrite", language: "en", weight: 1 },
      ],
    })).toBe("trusted normalized question");
  });
});

const tenantId = "64b000000000000000000001";
const actorId = "64b000000000000000000002";
const conversationId = "64b000000000000000000003";
const chunkA = "64b000000000000000000011";
const chunkB = "64b000000000000000000012";
const chunkC = "64b000000000000000000013";
const documentA = "64b000000000000000000021";
const documentB = "64b000000000000000000022";
const versionA = "64b000000000000000000031";
const versionB = "64b000000000000000000032";

type Scenario =
  | "grounded"
  | "assistant_identity"
  | "assistant_capabilities"
  | "social"
  | "analytics"
  | "insufficient"
  | "weak"
  | "unsafe"
  | "unsupported"
  | "clarification";

interface RuntimeObservations {
  executeCalls: number;
  startCalls: number;
  completeCalls: number;
  handoffs: Array<{ agent: string; payload: Record<string, unknown> }>;
  tools: Array<{ name: string; input: Record<string, unknown> }>;
  complianceInput?: Record<string, unknown>;
  finalProposal?: Record<string, unknown>;
  sourceCatalogOutput?: Record<string, unknown>;
  decisions: SupervisorDecision[];
}

interface HarnessOptions {
  scenario?: Scenario;
  citationsEnabled?: boolean;
  permissionState?: ResolvedPermissions["customRoleState"];
  permissions?: readonly string[];
  runtimeFailure?: boolean;
  verifierError?: string;
  approvedIds?: string[];
  writerCitations?: string[];
  verifierIds?: string[];
  complianceSourceIds?: string[];
  complianceAnswer?: string;
  searchCandidates?: Array<{
    chunkId: string;
    documentId: string;
    documentVersionId: string;
    score: number;
    pageNumber?: number;
    sectionTitle?: string;
  }>;
  loadedChunks?: LoadedChunkCandidate[];
  titles?: ReadonlyMap<string, string>;
  existingConversationOwner?: string;
  intentReferencedDocumentIds?: string[];
  intentReferencedDocumentTitles?: string[];
  resolvedTitleDocumentIds?: string[];
  secondSearchCandidates?: HarnessOptions["searchCandidates"];
  skipComplianceOutput?: boolean;
  authorizationReject?: boolean;
  missingPersistedActor?: boolean;
  intentLanguage?: "ar" | "en";
  intentNormalizedQuestion?: string;
  intentSemanticQuery?: string;
  intentIsFollowUp?: boolean;
  conversationContextUsed?: boolean;
  analyticsResult?: unknown;
  persistedActor?: Partial<{
    tenantId: string;
    actorId: string;
    baseRole: BaseRole;
    customRoleId: string | null;
    status: string;
  }>;
}

function intentOutput(
  route: Scenario,
  referencedDocumentIds: string[] = [],
  referencedDocumentTitles: string[] = [],
  language: "ar" | "en" = "en",
  normalizedQuestion = "trusted normalized question",
  semanticQuery = "trusted semantic query",
  isFollowUp = false,
  conversationContextUsed = false,
): Record<string, unknown> {
  const intentRoute = ["analytics", "grounded", "insufficient", "weak"].includes(route)
    ? "rag"
    : route.startsWith("assistant_") ? "assistant" : route;
  const assistantKind = route === "assistant_identity"
    ? "identity"
    : route === "assistant_capabilities" ? "capabilities" : null;
  return {
    normalizedQuestion,
    language,
    route: intentRoute,
    intent: assistantKind
      ? route
      : intentRoute === "social" ? "social" : "knowledge_question",
    assistantKind,
    intentConfidence: 0.99,
    referencedDocumentIds,
    clarificationNeeded: intentRoute === "clarification",
    clarification:
      intentRoute === "clarification"
        ? {
            reason: "missing_context",
            suggestedQuestions: ["Which policy?"],
            messageEn: "Which policy do you mean?",
            messageAr: "أي سياسة تقصد؟",
          }
        : null,
    ...(intentRoute === "social" ? { socialSubtype: "greeting" } : {}),
    isFollowUp,
    conversationContextUsed,
    reasonCode: "TRUSTED_INTENT",
    semanticQueries: [{ text: semanticQuery, language: "en", weight: 1 }],
    keywordQueries: [],
    exactTerms: [],
    entities: [],
    referencedDocumentTitles,
    temporalConstraints: [],
    departments: [],
    categories: [],
  };
}

function complianceFor(
  scenario: Scenario,
  answer: string,
  sourceIds: string[],
  verified = true,
  citationsEnabled = true,
  language: "ar" | "en" = "en",
): Record<string, unknown> {
  if (scenario === "unsafe") {
    return { action: "refuse", answer: "This request cannot be processed due to safety policies.", sourceIds: [], reasonCode: "UNSAFE_RESPONSE" };
  }
  if (scenario === "unsupported") {
    return { action: "refuse", answer: "This question is outside the scope of company documents. I can help with questions about company policies and documents.", sourceIds: [], reasonCode: "UNSUPPORTED_REQUEST" };
  }
  if (scenario === "clarification") {
    return { action: "clarify", answer: "Which policy do you mean?", sourceIds: [], reasonCode: "CLARIFICATION_REQUIRED" };
  }
  if (scenario === "insufficient") {
    return { action: "refuse", answer: insufficientEvidenceMessage(language), sourceIds: [], reasonCode: "INSUFFICIENT_EVIDENCE" };
  }
  if (scenario === "weak") {
    return { action: "refuse", answer: insufficientEvidenceMessage(language), sourceIds: [], reasonCode: "INSUFFICIENT_EVIDENCE" };
  }
  if (!verified) {
    return { action: "refuse", answer: "I don't have sufficient authorized evidence to answer that question.", sourceIds: [], reasonCode: "UNVERIFIED_GROUNDED_RESPONSE" };
  }
  return { action: "release", answer, sourceIds, reasonCode: citationsEnabled ? "COMPLIANT_GROUNDED_RESPONSE" : "COMPLIANT_GROUNDED_RESPONSE_CITATIONS_DISABLED" };
}

function makeHarness(options: HarnessOptions = {}) {
  const scenario = options.scenario ?? "grounded";
  const candidates = options.searchCandidates ?? [
    { chunkId: chunkA, documentId: documentA, documentVersionId: versionA, score: 0.91, pageNumber: 2, sectionTitle: "Alpha" },
    { chunkId: chunkB, documentId: documentB, documentVersionId: versionB, score: 0.73, pageNumber: 4, sectionTitle: "Beta" },
  ];
  const approvedIds = options.approvedIds ?? [chunkA, chunkB];
  const writerCitations = options.writerCitations ?? approvedIds;
  const verifierIds = options.verifierIds ?? writerCitations;
  const complianceSourceIds = options.complianceSourceIds ?? (options.citationsEnabled === false ? [] : verifierIds);
  const complianceAnswer = options.complianceAnswer ?? "SAFE_FINAL";
  const observations: RuntimeObservations = {
    executeCalls: 0,
    startCalls: 0,
    completeCalls: 0,
    handoffs: [],
    tools: [],
    decisions: [],
  };

  const runtime = {
    execute: vi.fn(async (runInput, hooks?: SupervisorRuntimeHooks) => {
      observations.executeCalls += 1;
      observations.startCalls += 1;
      if (options.runtimeFailure) {
        return {
          runId: runInput.runId,
          workflowId: "chat-rag-v1" as const,
          status: "failed" as const,
          output: null,
          error: { code: "INFRASTRUCTURE_FAILURE" },
          totalSteps: 1,
          totalToolCalls: 0,
          totalTokensUsed: 0,
          estimatedCost: 0,
          latencyMs: 1,
          handoffsCount: 0,
          approvalsCount: 0,
          guardrailResult: null,
        };
      }
      if (!hooks) throw new Error("hooks required");
      let state = { ...runInput.input };

      const initialDecision = hooks.resolveDecision?.({
        workflowId: "chat-rag-v1",
        currentAgent: "chat-supervisor",
        currentInput: state,
        proposedDecision: {
          action: "handoff",
          currentAgent: "chat-supervisor",
          nextAgent: "answer-writer-agent",
          reasonCode: "MODEL_SKIPPED_INTENT",
          payload: {},
          toolName: null,
          toolInput: null,
        },
      });
      if (initialDecision) observations.decisions.push(initialDecision);

      const payload = hooks.resolveHandoffPayload?.({
        workflowId: "chat-rag-v1",
        fromAgent: "chat-supervisor",
        toAgent: "intent-query-agent",
        currentInput: state,
        proposedPayload: { tenantId: "spoof", permissions: ["*"] },
      }) ?? {};
      observations.handoffs.push({ agent: "intent-query-agent", payload });
      state = {
        ...state,
        ...intentOutput(
          scenario,
          options.intentReferencedDocumentIds,
          options.intentReferencedDocumentTitles,
          options.intentLanguage,
          options.intentNormalizedQuestion,
          options.intentSemanticQuery,
          options.intentIsFollowUp,
          options.conversationContextUsed,
        ),
      };

      const afterIntentDecision = hooks.resolveDecision?.({
        workflowId: "chat-rag-v1",
        currentAgent: "chat-supervisor",
        currentInput: state,
        proposedDecision: {
          action: "complete",
          currentAgent: "chat-supervisor",
          nextAgent: null,
          result: { answer: "premature" },
          reasonCode: "MODEL_PREMATURE_COMPLETE",
        },
      });
      if (afterIntentDecision) observations.decisions.push(afterIntentDecision);

      if (scenario === "analytics") {
        const toolInput = hooks.resolveToolInput?.({
          workflowId: "chat-rag-v1",
          currentAgent: "chat-supervisor",
          toolName: "analytics_query",
          currentInput: state,
          proposedInput: { metric: "top_queries", period: "month", tenantId: "spoof" },
        }) ?? {};
        observations.tools.push({ name: "analytics_query", input: toolInput });
        hooks.onToolResult?.({
          workflowId: "chat-rag-v1",
          currentAgent: "chat-supervisor",
          toolName: "analytics_query",
          validatedOutput: { result: options.analyticsResult ?? { count: 7 } },
          currentInput: state,
        });
      } else if (scenario === "grounded" || scenario === "insufficient" || scenario === "weak") {
        if ((options.intentReferencedDocumentTitles?.length ?? 0) > 0) {
          const titleInput = hooks.resolveToolInput?.({
            workflowId: "chat-rag-v1",
            currentAgent: "chat-supervisor",
            toolName: "resolve_document_titles",
            currentInput: state,
            proposedInput: { titles: ["forged title"], tenantId: "spoof" },
          }) ?? {};
          observations.tools.push({ name: "resolve_document_titles", input: titleInput });
          const titleOutput = {
            status: "one_match",
            documentIds: options.resolvedTitleDocumentIds ?? [documentA],
            reasonCode: "TITLE_RESOLVED",
          };
          hooks.onToolResult?.({
            workflowId: "chat-rag-v1",
            currentAgent: "chat-supervisor",
            toolName: "resolve_document_titles",
            validatedOutput: titleOutput,
            currentInput: state,
          });
          state = { ...state, ...titleOutput };
        }

        const searchInput = hooks.resolveToolInput?.({
          workflowId: "chat-rag-v1",
          currentAgent: "chat-supervisor",
          toolName: "authorized_hybrid_search",
          currentInput: state,
          proposedInput: { queryText: "forged", documentIds: [documentB], topK: 50 },
        }) ?? {};
        observations.tools.push({ name: "authorized_hybrid_search", input: searchInput });
        const searchOutput = {
          candidates,
          totalCandidates: candidates.length,
          reasonCode: "SEARCH_COMPLETED",
        };
        observations.sourceCatalogOutput = searchOutput;
        hooks.onToolResult?.({
          workflowId: "chat-rag-v1",
          currentAgent: "chat-supervisor",
          toolName: "authorized_hybrid_search",
          validatedOutput: searchOutput,
          currentInput: state,
        });
        state = { ...state, ...searchOutput };

        const afterSearchDecision = hooks.resolveDecision?.({
          workflowId: "chat-rag-v1",
          currentAgent: "chat-supervisor",
          currentInput: state,
          proposedDecision: {
            action: "complete",
            currentAgent: "chat-supervisor",
            nextAgent: null,
            result: { answer: "premature" },
            reasonCode: "MODEL_PREMATURE_COMPLETE",
          },
        });
        if (afterSearchDecision) observations.decisions.push(afterSearchDecision);

        if (options.secondSearchCandidates) {
          const secondSearchInput = hooks.resolveToolInput?.({
            workflowId: "chat-rag-v1",
            currentAgent: "chat-supervisor",
            toolName: "authorized_hybrid_search",
            currentInput: state,
            proposedInput: { queryText: "forged-second", documentIds: [documentB] },
          }) ?? {};
          observations.tools.push({ name: "authorized_hybrid_search", input: secondSearchInput });
          const secondSearchOutput = {
            candidates: options.secondSearchCandidates,
            totalCandidates: options.secondSearchCandidates.length,
            reasonCode: "SEARCH_COMPLETED",
          };
          hooks.onToolResult?.({
            workflowId: "chat-rag-v1",
            currentAgent: "chat-supervisor",
            toolName: "authorized_hybrid_search",
            validatedOutput: secondSearchOutput,
            currentInput: state,
          });
          state = { ...state, ...secondSearchOutput };
        }

        if (candidates.length > 0) {
          const evidenceInput = hooks.resolveToolInput?.({
            workflowId: "chat-rag-v1",
            currentAgent: "chat-supervisor",
            toolName: "evaluate_evidence",
            currentInput: state,
            proposedInput: { question: "forged", candidateIds: [chunkC] },
          }) ?? {};
          observations.tools.push({ name: "evaluate_evidence", input: evidenceInput });
          const evidenceOutput = {
            sufficiency: scenario === "grounded" ? "SUFFICIENT" : scenario === "weak" ? "WEAK" : "NO_EVIDENCE",
            approvedEvidenceIds: scenario === "grounded" ? approvedIds : [],
            rejectedEvidenceIds: scenario === "grounded" ? [] : candidates.map((candidate) => candidate.chunkId),
            reasonCode: scenario === "grounded" ? "EVIDENCE_SUFFICIENT" : scenario === "weak" ? "EVIDENCE_WEAK" : "NO_EVIDENCE",
          };
          hooks.onToolResult?.({
            workflowId: "chat-rag-v1",
            currentAgent: "chat-supervisor",
            toolName: "evaluate_evidence",
            validatedOutput: evidenceOutput,
            currentInput: state,
          });
          state = { ...state, ...evidenceOutput };

          const afterEvidenceDecision = hooks.resolveDecision?.({
            workflowId: "chat-rag-v1",
            currentAgent: "chat-supervisor",
            currentInput: state,
            proposedDecision: {
              action: "complete",
              currentAgent: "chat-supervisor",
              nextAgent: null,
              result: { answer: "premature" },
              reasonCode: "MODEL_PREMATURE_COMPLETE",
            },
          });
          if (afterEvidenceDecision) observations.decisions.push(afterEvidenceDecision);
        }

        if (scenario === "grounded") {
          const writerInput = hooks.resolveHandoffPayload?.({
            workflowId: "chat-rag-v1",
            fromAgent: "chat-supervisor",
            toAgent: "answer-writer-agent",
            currentInput: state,
            proposedPayload: { approvedEvidenceIds: [chunkC], question: "forged" },
          }) ?? {};
          observations.handoffs.push({ agent: "answer-writer-agent", payload: writerInput });
          state = { ...state, decision: "grounded_answer", answer: "WRITER_DRAFT", citedChunkIds: writerCitations };

          const verifierInput = hooks.resolveHandoffPayload?.({
            workflowId: "chat-rag-v1",
            fromAgent: "answer-writer-agent",
            toAgent: "citation-verification-agent",
            currentInput: state,
            proposedPayload: { citedChunkIds: [chunkC], answerText: "forged" },
          }) ?? {};
          observations.handoffs.push({ agent: "citation-verification-agent", payload: verifierInput });
          if (options.verifierError) {
            const code = options.verifierError;
            return {
              runId: runInput.runId,
              workflowId: "chat-rag-v1" as const,
              status: "failed" as const,
              output: null,
              error: { code, message: "citation verification provider error" },
              totalSteps: observations.handoffs.length,
              totalToolCalls: observations.tools.length,
              totalTokensUsed: 0,
              estimatedCost: 0,
              latencyMs: 0,
              handoffsCount: observations.handoffs.length,
              approvalsCount: 0,
              guardrailResult: null,
            };
          }
          state = {
            ...state,
            verified: verifierIds.length > 0,
            validatedCitationIds: verifierIds,
            rejectedCitationIds: [chunkC],
            unsupportedClaims: [],
            reasonCode: verifierIds.length > 0 ? "CITATIONS_VERIFIED" : "MISSING_CITATIONS",
          };
        }
      }

      if (!["assistant_identity", "assistant_capabilities", "social", "analytics"].includes(scenario)) {
        const complianceInput = hooks.resolveHandoffPayload?.({
          workflowId: "chat-rag-v1",
          fromAgent: "chat-supervisor",
          toAgent: "compliance-agent",
          currentInput: state,
          proposedPayload: { answer: "FORGED", citationsEnabled: !options.citationsEnabled, rejectedCitationIds: [chunkC] },
        }) ?? {};
        observations.complianceInput = complianceInput;
        observations.handoffs.push({ agent: "compliance-agent", payload: complianceInput });
        if (!options.skipComplianceOutput) {
          state = {
            ...state,
            ...complianceFor(
              scenario,
              complianceAnswer,
              complianceSourceIds,
              verifierIds.length > 0,
              options.citationsEnabled ?? true,
              options.intentLanguage,
            ),
          };
        }
      }

      const proposal = { action: "release", answer: "FORGED", sourceIds: [chunkC], reasonCode: "FORGED" };
      observations.finalProposal = proposal;
      const output = hooks.resolveCompleteResult?.({
        workflowId: "chat-rag-v1",
        currentAgent: "chat-supervisor",
        currentInput: state,
        proposedResult: proposal,
      }) ?? proposal;
      observations.completeCalls += 1;
      return {
        runId: runInput.runId,
        workflowId: "chat-rag-v1" as const,
        status: "completed" as const,
        output,
        error: null,
        totalSteps: 1,
        totalToolCalls: observations.tools.length,
        totalTokensUsed: 1,
        estimatedCost: 0,
        latencyMs: 1,
        handoffsCount: observations.handoffs.length,
        approvalsCount: 0,
        guardrailResult: null,
      };
    }),
  };

  const messages: Array<{
    role: "user" | "assistant";
    content: string;
    sources: MessageSource[];
  }> = [];
  const repository: ChatWorkflowRepository = {
    createConversation: vi.fn(async () => ({ _id: conversationId, userId: actorId })),
    getConversationById: vi.fn(async () => ({
      _id: conversationId,
      userId: options.existingConversationOwner ?? actorId,
    })),
    countMessages: vi.fn(async () => 0),
    addMessage: vi.fn(async (_tenant, _conversation, role, content, _sequence, sources = []) => {
      messages.push({ role, content, sources });
      return { _id: role === "assistant" ? "assistant-message" : "user-message" };
    }),
  };
  const permissionState = options.permissionState ?? "none";
  const permissionValues = options.permissions ?? [
    Permission.CHAT_CREATE,
    Permission.DOCUMENTS_USE_IN_AI,
    Permission.ANALYTICS_READ,
  ];
  const resolved: ResolvedPermissions = {
    permissions: new Set(permissionValues as Array<(typeof Permission)[keyof typeof Permission]>),
    grants: new Map(),
    baseRole: options.persistedActor?.baseRole ?? "EMPLOYEE",
    customRoleId: permissionState === "none" ? null : "64b000000000000000000099",
    roleVersion: null,
    customRoleState: permissionState,
  };
  const permissionEvaluator: PermissionEvaluator = {
    resolve: vi.fn(async () => resolved),
    evaluate: vi.fn(),
    evict: vi.fn(),
    evictAllForTenant: vi.fn(),
  };
  const persistedActor = {
    tenantId,
    actorId,
    baseRole: "EMPLOYEE" as BaseRole,
    customRoleId: null,
    status: "active",
    ...options.persistedActor,
  };
  const loadPersistedActor = vi.fn(async () =>
    options.missingPersistedActor ? null : persistedActor,
  );
  const createRun = vi.fn(async () => ({ id: "run-1" }));
  const authorizeDocumentAction = vi.fn(async () => {
    if (options.authorizationReject) throw new Error("denied");
  });
  const defaultLoaded: LoadedChunkCandidate[] = candidates.map((candidate) => ({
    ...candidate,
    tenantId,
    text: `text:${candidate.chunkId}`,
    allowAiUse: true,
    status: "ACTIVE",
  }));
  const reportKnowledgeGap = vi.fn(async () => undefined);
  const auditWriter = { write: vi.fn(async () => true) };
  const dependencies: ChatWorkflowServiceDependencies = {
    composition: { runtime, workflow: { id: "chat-rag-v1" } },
    repository,
    authorize: vi.fn(async (context) => ({
      tenantId,
      actorId,
      actorEmail: "persisted@example.com",
      actorRole: "EMPLOYEE" as BaseRole,
      actorKind: "USER" as const,
      traceId: context.traceId,
      requestId: context.requestId,
    })),
    permissionEvaluator,
    loadPersistedActor,
    loadSettings: vi.fn(async () => ({
      citationsEnabled: options.citationsEnabled ?? true,
      maxTokens: 1024,
    })),
    createRun,
    authorizedRetrieval: {
      authorization: { authorizeDocumentAction } as never,
      loadChunksByIds: vi.fn(async () => options.loadedChunks ?? defaultLoaded),
      loadEligibleDocumentIds: vi.fn(async () => candidates.map((candidate) => candidate.documentId)),
    },
    loadDocumentTitles: vi.fn(async () => options.titles ?? new Map([
      [documentA, "Document A"],
      [documentB, "Document B"],
    ])),
    reportKnowledgeGap,
    auditWriter,
    runMetadata: { modelProvider: "test-provider", modelName: "test-model" },
  };
  const service = new ChatWorkflowService(dependencies);

  return {
    service,
    dependencies,
    observations,
    messages,
    createRun,
    permissionEvaluator,
    loadPersistedActor,
    authorizeDocumentAction,
    reportKnowledgeGap,
  };
}

async function executeHarness(harness: ReturnType<typeof makeHarness>, message = "What is the policy?") {
  return harness.service.execute(
    { message, conversationId },
    {
      tenantId: "client-tenant-is-ignored",
      actorId: "client-actor-is-ignored",
      actorEmail: "client@example.com",
      actorRole: "SUPER_ADMIN",
      traceId: "trace-1",
      requestId: "request-1",
    },
  );
}

describe("ChatWorkflowService lifecycle and trusted context", () => {
  it("creates one AgentRun and executes the Supervisor runtime once", async () => {
    const harness = makeHarness();
    await executeHarness(harness);
    expect(harness.createRun).toHaveBeenCalledTimes(1);
    expect(harness.observations.executeCalls).toBe(1);
  });

  it("leaves start/complete lifecycle ownership with the runtime exactly once", async () => {
    const harness = makeHarness();
    await executeHarness(harness);
    expect(harness.observations.startCalls).toBe(1);
    expect(harness.observations.completeCalls).toBe(1);
  });

  it("builds execution context from the persisted actor and server permissions", async () => {
    const harness = makeHarness();
    await executeHarness(harness);
    const runtimeInput = (harness.dependencies.composition.runtime.execute as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(runtimeInput.context).toMatchObject({
      tenantId,
      actorId,
      actorRole: "EMPLOYEE",
      actorEmail: "persisted@example.com",
      permissions: expect.arrayContaining([Permission.CHAT_CREATE]),
    });
    expect(runtimeInput.context.permissions).not.toContain("*");
  });

  it("passes an active persisted actor without a custom role to PermissionEvaluator", async () => {
    const harness = makeHarness();
    await executeHarness(harness);
    expect(harness.loadPersistedActor).toHaveBeenCalledWith(tenantId, actorId);
    expect(harness.permissionEvaluator.resolve).toHaveBeenCalledWith({
      tenantId,
      actorId,
      baseRole: "EMPLOYEE",
      customRoleId: null,
    });
  });

  it("passes the exact persisted custom role and base role to PermissionEvaluator", async () => {
    const customRoleId = "64b000000000000000000099";
    const harness = makeHarness({
      persistedActor: { baseRole: "COMPANY_ADMIN", customRoleId },
      permissionState: "active",
    });
    await executeHarness(harness);
    expect(harness.permissionEvaluator.resolve).toHaveBeenCalledWith({
      tenantId,
      actorId,
      baseRole: "COMPANY_ADMIN",
      customRoleId,
    });
  });

  it("uses custom-role grants returned by the evaluator in AgentExecutionContext", async () => {
    const harness = makeHarness({
      persistedActor: { customRoleId: "64b000000000000000000099" },
      permissionState: "active",
      permissions: [Permission.CHAT_CREATE, Permission.ANALYTICS_READ],
    });
    await executeHarness(harness);
    const runtimeInput = vi.mocked(harness.dependencies.composition.runtime.execute).mock.calls[0][0];
    expect(runtimeInput.context.permissions).toEqual(
      expect.arrayContaining([Permission.CHAT_CREATE, Permission.ANALYTICS_READ]),
    );
  });

  it("fails closed before run creation when the persisted actor is missing", async () => {
    const harness = makeHarness({ missingPersistedActor: true });
    await expect(executeHarness(harness)).rejects.toMatchObject({ statusCode: 403 });
    expect(harness.createRun).not.toHaveBeenCalled();
    expect(harness.dependencies.composition.runtime.execute).not.toHaveBeenCalled();
  });

  it("fails closed when the tenant-scoped actor lookup returns another tenant", async () => {
    const harness = makeHarness({
      persistedActor: { tenantId: "64b000000000000000000099" },
    });
    await expect(executeHarness(harness)).rejects.toMatchObject({ statusCode: 403 });
    expect(harness.permissionEvaluator.resolve).not.toHaveBeenCalled();
    expect(harness.createRun).not.toHaveBeenCalled();
  });

  it("fails closed when the persisted actor is not active", async () => {
    const harness = makeHarness({ persistedActor: { status: "disabled" } });
    await expect(executeHarness(harness)).rejects.toMatchObject({ statusCode: 403 });
    expect(harness.permissionEvaluator.resolve).not.toHaveBeenCalled();
    expect(harness.createRun).not.toHaveBeenCalled();
  });

  it.each(["missing", "archived", "invalid"] as const)(
    "fails closed for %s persisted custom-role state",
    async (permissionState) => {
      const customRoleId = "64b000000000000000000099";
      const harness = makeHarness({
        permissionState,
        persistedActor: { customRoleId },
      });
      await expect(executeHarness(harness)).rejects.toMatchObject({ statusCode: 403 });
      expect(harness.permissionEvaluator.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ customRoleId }),
      );
      expect(harness.createRun).not.toHaveBeenCalled();
      expect(harness.dependencies.composition.runtime.execute).not.toHaveBeenCalled();
    },
  );

  it("does not broaden an invalid assigned custom role to base-role permissions", async () => {
    const customRoleId = "64b000000000000000000099";
    const harness = makeHarness({
      persistedActor: { customRoleId },
      permissionState: "invalid",
      permissions: [Permission.CHAT_CREATE],
    });
    await expect(executeHarness(harness)).rejects.toMatchObject({ statusCode: 403 });
    expect(harness.permissionEvaluator.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ customRoleId }),
    );
    expect(harness.createRun).not.toHaveBeenCalled();
    expect(harness.dependencies.composition.runtime.execute).not.toHaveBeenCalled();
  });

  it("rejects an assigned custom role if the evaluator reports no assignment", async () => {
    const harness = makeHarness({
      persistedActor: { customRoleId: "64b000000000000000000099" },
      permissionState: "none",
      permissions: [Permission.CHAT_CREATE],
    });
    await expect(executeHarness(harness)).rejects.toMatchObject({ statusCode: 403 });
    expect(harness.createRun).not.toHaveBeenCalled();
    expect(harness.dependencies.composition.runtime.execute).not.toHaveBeenCalled();
  });

  it("ignores client and model attempts to spoof customRoleId", async () => {
    const persistedCustomRoleId = "64b000000000000000000099";
    const harness = makeHarness({
      persistedActor: { customRoleId: persistedCustomRoleId },
      permissionState: "active",
    });
    await harness.service.execute(
      { message: "hello", conversationId, customRoleId: "client-role" },
      {
        tenantId: "client-tenant-is-ignored",
        actorId: "client-actor-is-ignored",
        actorEmail: "client@example.com",
        actorRole: "SUPER_ADMIN",
        traceId: "trace-1",
        requestId: "request-1",
      },
    );
    expect(harness.permissionEvaluator.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ baseRole: "EMPLOYEE", customRoleId: persistedCustomRoleId }),
    );
    expect(harness.observations.handoffs[0].payload).not.toHaveProperty("customRoleId");
  });

  it("does not own a pre-Intent QUESTION_ASKED recorder", async () => {
    const harness = makeHarness({ runtimeFailure: true });
    expect(harness.dependencies).not.toHaveProperty("recordQuestionAsked");
    await expect(executeHarness(harness)).rejects.toMatchObject({
      code: "CHAT_WORKFLOW_FAILED",
    });
  });

  it("denies when server-derived permissions omit CHAT_CREATE", async () => {
    const harness = makeHarness({ permissions: [Permission.DOCUMENTS_USE_IN_AI] });
    await expect(executeHarness(harness)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("enforces conversation ownership before creating a run", async () => {
    const harness = makeHarness({ existingConversationOwner: "64b000000000000000000099" });
    await expect(executeHarness(harness)).rejects.toMatchObject({ statusCode: 404 });
    expect(harness.createRun).not.toHaveBeenCalled();
  });

  it("does not persist assistant success when runtime infrastructure fails", async () => {
    const harness = makeHarness({ runtimeFailure: true });
    await expect(executeHarness(harness)).rejects.toMatchObject({ code: "CHAT_WORKFLOW_FAILED" });
    expect(harness.messages.filter((message) => message.role === "assistant")).toHaveLength(0);
  });

  it("fails the workflow on a citation-verification provider error instead of emitting an insufficient-evidence answer", async () => {
    const harness = makeHarness({ verifierError: "LLM_RATE_LIMITED" });
    await expect(executeHarness(harness)).rejects.toMatchObject({
      code: "CHAT_WORKFLOW_FAILED",
      statusCode: 502,
    });
    expect(harness.observations.handoffs).toContainEqual(
      expect.objectContaining({ agent: "citation-verification-agent" }),
    );
    // The verifier failure must not degrade into an insufficient-evidence
    // refusal: no assistant answer (refuse or release) is persisted.
    expect(harness.messages.filter((message) => message.role === "assistant")).toHaveLength(0);
  });
});

describe("ChatWorkflowService trusted projections and provenance", () => {
  it("ignores model authoritative fields in the Intent handoff", async () => {
    const harness = makeHarness({ scenario: "social" });
    await executeHarness(harness, "hello");
    expect(harness.observations.handoffs[0].payload).toEqual({ conversationId, question: "hello" });
  });

  it("projects exact approved evidence to Answer Writer", async () => {
    const harness = makeHarness({ approvedIds: [chunkB] });
    await executeHarness(harness);
    const writer = harness.observations.handoffs.find((entry) => entry.agent === "answer-writer-agent");
    expect(writer?.payload.approvedEvidenceIds).toEqual([chunkB]);
  });

  it("projects trusted direct-question settings without conversation content", async () => {
    const harness = makeHarness();
    vi.mocked(harness.dependencies.loadSettings).mockResolvedValueOnce({
      citationsEnabled: false,
      maxTokens: 1536,
    });
    await executeHarness(harness);
    const writer = harness.observations.handoffs.find((entry) => entry.agent === "answer-writer-agent");
    expect(writer?.payload).toMatchObject({
      task: "direct_question",
      citationsEnabled: false,
      maxTokens: 1536,
    });
    expect(writer?.payload).not.toHaveProperty("historyFromDb");
  });

  it("uses summary retrieval/generation settings for summary questions", async () => {
    const harness = makeHarness({
      intentNormalizedQuestion: "Summarize the policy in detail",
    });
    await executeHarness(harness, "Summarize the policy in detail");
    expect(harness.observations.tools[0].input.topK).toBe(12);
    const writer = harness.observations.handoffs.find((entry) => entry.agent === "answer-writer-agent");
    expect(writer?.payload).toMatchObject({
      task: "document_summary",
      maxTokens: 2048,
    });
  });

  it("projects exact writer answer/citations and approved evidence to Citation Verification", async () => {
    const harness = makeHarness({ approvedIds: [chunkA], writerCitations: [chunkA] });
    await executeHarness(harness);
    const verifier = harness.observations.handoffs.find((entry) => entry.agent === "citation-verification-agent");
    expect(verifier?.payload).toMatchObject({
      answerText: "WRITER_DRAFT",
      questionText: "trusted normalized question",
      citedChunkIds: [chunkA],
      approvedEvidenceIds: [chunkA],
    });
  });

  it("projects minimal Compliance input without rejectedCitationIds", async () => {
    const harness = makeHarness();
    await executeHarness(harness);
    expect(harness.observations.complianceInput).toMatchObject({
      answer: "WRITER_DRAFT",
      citationsEnabled: true,
      citationVerification: {
        verified: true,
        validatedCitationIds: [chunkA, chunkB],
      },
    });
    expect(harness.observations.complianceInput).not.toHaveProperty("rejectedCitationIds");
    expect(harness.observations.complianceInput).not.toHaveProperty("candidates");
  });

  it("uses the standalone normalized question and server topK for search", async () => {
    const harness = makeHarness();
    await executeHarness(harness);
    expect(harness.observations.tools[0]).toEqual({
      name: "authorized_hybrid_search",
      input: { queryText: "trusted normalized question", topK: 5 },
    });
  });

  it("constrains search to exact trusted Intent document IDs", async () => {
    const harness = makeHarness({
      intentReferencedDocumentIds: [documentA],
      searchCandidates: [
        { chunkId: chunkA, documentId: documentA, documentVersionId: versionA, score: 0.91 },
      ],
      approvedIds: [chunkA],
      writerCitations: [chunkA],
      verifierIds: [chunkA],
      complianceSourceIds: [chunkA],
    });
    await executeHarness(harness);
    expect(harness.observations.tools[0].input).toEqual({
      queryText: "trusted normalized question",
      topK: 5,
      documentIds: [documentA],
    });
  });

  it("uses the exact current search batch as evidence input", async () => {
    const harness = makeHarness();
    await executeHarness(harness);
    expect(harness.observations.tools[1]).toEqual({
      name: "evaluate_evidence",
      input: { question: "trusted normalized question", candidateIds: [chunkA, chunkB] },
    });
  });

  it("isolates a self-contained probation turn from a previous expense topic", async () => {
    const resolved = "Can an employee use annual leave during probation?";
    const harness = makeHarness({
      intentNormalizedQuestion: resolved,
      intentSemanticQuery: "Who approves an expense of EGP 7,500?",
      searchCandidates: [
        { chunkId: chunkB, documentId: documentB, documentVersionId: versionB, score: 0.93, pageNumber: 4 },
      ],
      approvedIds: [chunkB],
      writerCitations: [chunkB],
      verifierIds: [chunkB],
      complianceSourceIds: [chunkB],
      complianceAnswer: "Annual leave cannot be used during probation.",
    });

    const response = await executeHarness(harness, resolved);
    const writer = harness.observations.handoffs.find((entry) => entry.agent === "answer-writer-agent");
    expect(harness.observations.tools[0]?.input.queryText).toBe(resolved);
    expect(writer?.payload).toMatchObject({ question: resolved, approvedEvidenceIds: [chunkB] });
    expect(writer?.payload).not.toHaveProperty("historyFromDb");
    expect(response.answer).not.toMatch(/EGP 7,500|Department Head/i);
    expect(response.sources?.map((source) => source.chunkId)).toEqual([chunkB]);
  });

  it("isolates a self-contained expense turn from a previous probation topic", async () => {
    const resolved = "Who approves an expense of EGP 7,500?";
    const harness = makeHarness({
      intentNormalizedQuestion: resolved,
      intentSemanticQuery: "Can an employee use annual leave during probation?",
      searchCandidates: [
        { chunkId: chunkA, documentId: documentA, documentVersionId: versionA, score: 0.94, pageNumber: 3 },
      ],
      approvedIds: [chunkA],
      writerCitations: [chunkA],
      verifierIds: [chunkA],
      complianceSourceIds: [chunkA],
      complianceAnswer: "The Department Head approves an expense of EGP 7,500.",
    });

    const response = await executeHarness(harness, resolved);
    const writer = harness.observations.handoffs.find((entry) => entry.agent === "answer-writer-agent");
    expect(harness.observations.tools[0]?.input.queryText).toBe(resolved);
    expect(writer?.payload).toMatchObject({ question: resolved, approvedEvidenceIds: [chunkA] });
    expect(response.answer).not.toMatch(/annual leave|probation/i);
    expect(response.sources?.map((source) => source.chunkId)).toEqual([chunkA]);
  });

  it("uses a standalone resolved question for a genuine probation follow-up", async () => {
    const resolved = "Can a full-time employee use annual leave during probation?";
    const harness = makeHarness({
      intentNormalizedQuestion: resolved,
      intentIsFollowUp: true,
      conversationContextUsed: true,
      approvedIds: [chunkB],
      writerCitations: [chunkB],
      verifierIds: [chunkB],
      complianceSourceIds: [chunkB],
    });

    await executeHarness(harness, "What about during probation?");
    const writer = harness.observations.handoffs.find((entry) => entry.agent === "answer-writer-agent");
    expect(harness.observations.tools[0]?.input.queryText).toBe(resolved);
    expect(harness.observations.tools[1]?.input.question).toBe(resolved);
    expect(writer?.payload.question).toBe(resolved);
    expect(writer?.payload).not.toHaveProperty("historyFromDb");
  });

  it("uses a standalone resolved question for a referential amount follow-up", async () => {
    const resolved = "Who approves an expense of EGP 15,000?";
    const harness = makeHarness({
      intentNormalizedQuestion: resolved,
      intentIsFollowUp: true,
      conversationContextUsed: true,
      approvedIds: [chunkA],
      writerCitations: [chunkA],
      verifierIds: [chunkA],
      complianceSourceIds: [chunkA],
    });

    await executeHarness(harness, "What about EGP 15,000?");
    const writer = harness.observations.handoffs.find((entry) => entry.agent === "answer-writer-agent");
    expect(harness.observations.tools[0]?.input.queryText).toBe(resolved);
    expect(harness.observations.tools[1]?.input.question).toBe(resolved);
    expect(writer?.payload.question).toBe(resolved);
  });

  it("fails closed when evidence approves an ID outside this run's candidates", async () => {
    const harness = makeHarness({ approvedIds: [chunkC] });
    await expect(executeHarness(harness)).rejects.toMatchObject({ code: "CHAT_WORKFLOW_AUTHORITY_INVALID" });
  });

  it("uses only the latest search batch for evidence provenance", async () => {
    const harness = makeHarness({
      secondSearchCandidates: [
        { chunkId: chunkB, documentId: documentB, documentVersionId: versionB, score: 0.8 },
      ],
      approvedIds: [chunkA],
    });
    await expect(executeHarness(harness)).rejects.toMatchObject({
      code: "CHAT_WORKFLOW_AUTHORITY_INVALID",
    });
  });

  it("fails closed when writer citations broaden approved evidence", async () => {
    const harness = makeHarness({ approvedIds: [chunkA], writerCitations: [chunkA, chunkB] });
    await expect(executeHarness(harness)).rejects.toMatchObject({ code: "CHAT_WORKFLOW_AUTHORITY_INVALID" });
  });

  it("fails closed when verifier IDs broaden writer citations", async () => {
    const harness = makeHarness({ approvedIds: [chunkA, chunkB], writerCitations: [chunkA], verifierIds: [chunkB] });
    await expect(executeHarness(harness)).rejects.toMatchObject({ code: "CHAT_WORKFLOW_AUTHORITY_INVALID" });
  });

  it("fails closed when Compliance sources broaden verified citations", async () => {
    const harness = makeHarness({ approvedIds: [chunkA, chunkB], writerCitations: [chunkA], verifierIds: [chunkA], complianceSourceIds: [chunkB] });
    await expect(executeHarness(harness)).rejects.toMatchObject({ code: "CHAT_WORKFLOW_AUTHORITY_INVALID" });
  });

  it("isolates source catalogs between sequential runs", async () => {
    const first = makeHarness({ searchCandidates: [{ chunkId: chunkA, documentId: documentA, documentVersionId: versionA, score: 0.9 }], approvedIds: [chunkA] });
    const second = makeHarness({ searchCandidates: [{ chunkId: chunkB, documentId: documentB, documentVersionId: versionB, score: 0.8 }], approvedIds: [chunkB], writerCitations: [chunkB], verifierIds: [chunkB], complianceSourceIds: [chunkB] });
    const [one, two] = await Promise.all([executeHarness(first), executeHarness(second)]);
    expect(one.sources?.map((source) => source.chunkId)).toEqual([chunkA]);
    expect(two.sources?.map((source) => source.chunkId)).toEqual([chunkB]);
  });

  it("keeps the runtime source catalog free of raw text", async () => {
    const harness = makeHarness();
    await executeHarness(harness);
    expect(JSON.stringify(harness.observations.sourceCatalogOutput)).not.toContain("text:");
    expect(harness.observations.sourceCatalogOutput?.candidates).not.toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.anything() })]));
  });
});

describe("ChatWorkflowService terminal authority and persistence", () => {
  it("returns and persists exact Compliance answer/source order, ignoring forged complete result", async () => {
    const harness = makeHarness({ complianceSourceIds: [chunkB, chunkA] });
    const response = await executeHarness(harness);
    expect(response.answer).toBe("SAFE_FINAL");
    expect(response.sources?.map((source) => source.chunkId)).toEqual([chunkB, chunkA]);
    expect(harness.messages.at(-1)).toMatchObject({ content: "SAFE_FINAL" });
  });

  it("preserves exact retrieval scores and canonical persisted/returned metadata", async () => {
    const harness = makeHarness({ complianceSourceIds: [chunkB, chunkA] });
    const response = await executeHarness(harness);
    expect(response.sources?.map((source) => source.score)).toEqual([0.73, 0.91]);
    const persisted = harness.messages.at(-1)?.sources ?? [];
    expect(persisted).toEqual(response.sources?.map((source) => ({
      chunkId: source.chunkId,
      documentId: source.documentId,
      documentTitle: source.documentTitle,
      sectionTitle: source.sectionTitle,
      pageNumber: source.pageNumber,
      score: source.score,
    })));
    expect(persisted[0]).not.toHaveProperty("text");
    expect(persisted[0]).not.toHaveProperty("documentVersionId");
  });

  it("fails closed when final source catalog metadata is absent", async () => {
    const harness = makeHarness({ complianceSourceIds: [chunkC], approvedIds: [chunkA, chunkB], verifierIds: [chunkA, chunkB] });
    await expect(executeHarness(harness)).rejects.toMatchObject({ code: "CHAT_WORKFLOW_AUTHORITY_INVALID" });
  });

  it("fails closed when required Compliance output is absent", async () => {
    const harness = makeHarness({ skipComplianceOutput: true });
    await expect(executeHarness(harness)).rejects.toThrow();
    expect(harness.messages.filter((message) => message.role === "assistant")).toHaveLength(0);
  });

  it("fails closed when final chunk metadata cannot be loaded", async () => {
    const harness = makeHarness({ loadedChunks: [] });
    await expect(executeHarness(harness)).rejects.toMatchObject({ code: "CHAT_WORKFLOW_AUTHORITY_INVALID" });
  });

  it("fails closed when a final document title cannot be loaded", async () => {
    const harness = makeHarness({ titles: new Map() });
    await expect(executeHarness(harness)).rejects.toMatchObject({ code: "CHAT_WORKFLOW_AUTHORITY_INVALID" });
  });

  it("fails closed when final document reauthorization is denied", async () => {
    const harness = makeHarness({ authorizationReject: true });
    await expect(executeHarness(harness)).rejects.toThrow("denied");
    expect(harness.messages.filter((message) => message.role === "assistant")).toHaveLength(0);
  });

  it("fails closed on cross-tenant final chunk materialization", async () => {
    const harness = makeHarness({
      loadedChunks: [
        {
          chunkId: chunkA,
          documentId: documentA,
          documentVersionId: versionA,
          tenantId: "64b000000000000000000099",
          text: "cross tenant",
          allowAiUse: true,
          status: "ACTIVE",
        },
      ],
      complianceSourceIds: [chunkA],
    });
    await expect(executeHarness(harness)).rejects.toMatchObject({
      code: "CHAT_WORKFLOW_AUTHORITY_INVALID",
    });
  });

  it("materializes a newly indexed READY chunk when legacy allowAiUse metadata is absent", async () => {
    const harness = makeHarness({
      loadedChunks: [
        {
          chunkId: chunkA,
          documentId: documentA,
          documentVersionId: versionA,
          tenantId,
          text: "The deployment uses a blue-green release strategy.",
          status: "EMBEDDED",
        },
      ],
      complianceSourceIds: [chunkA],
      approvedIds: [chunkA],
      verifierIds: [chunkA],
      titles: new Map([[documentA, "Deployment Guide"]]),
    });

    const response = await executeHarness(harness);

    expect(response.sources?.[0]).toMatchObject({
      chunkId: chunkA,
      documentId: documentA,
      documentTitle: "Deployment Guide",
    });
    expect(harness.authorizeDocumentAction).toHaveBeenCalledWith(
      { tenantId, actorId },
      documentA,
      "use_in_ai",
    );
  });

  it("reauthorizes every final document before persistence", async () => {
    const harness = makeHarness();
    await executeHarness(harness);
    expect(harness.authorizeDocumentAction).toHaveBeenCalledTimes(2);
    expect(harness.authorizeDocumentAction).toHaveBeenCalledWith({ tenantId, actorId }, documentA, "use_in_ai");
  });

  it("still verifies grounded answers when citations are disabled and exposes no sources", async () => {
    const harness = makeHarness({ citationsEnabled: false, complianceSourceIds: [] });
    const response = await executeHarness(harness);
    const verifier = harness.observations.handoffs.find((entry) => entry.agent === "citation-verification-agent");
    expect(verifier).toBeDefined();
    expect(harness.observations.complianceInput?.citationsEnabled).toBe(false);
    expect(response.sources).toBeUndefined();
    expect(harness.messages.at(-1)?.sources).toEqual([]);
  });

  it("uses response-only chunk text without changing citation identity", async () => {
    const harness = makeHarness({ complianceSourceIds: [chunkA] });
    const response = await executeHarness(harness);
    expect(response.sources).toHaveLength(1);
    expect(response.sources?.[0]).toMatchObject({
      chunkId: chunkA,
      text: `text:${chunkA}`,
    });
    expect(harness.messages.at(-1)?.sources.map((source) => source.chunkId)).toEqual([chunkA]);
  });

  it("writes one retrieval audit with safe correlation metadata", async () => {
    const harness = makeHarness();
    await executeHarness(harness);
    expect(harness.dependencies.auditWriter?.write).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.auditWriter?.write).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: conversationId,
        metadata: expect.objectContaining({ runId: "run-1", traceId: "trace-1", requestId: "request-1" }),
      }),
    );
  });

  it("writes retrieval audit actorRole from the current evaluated base role", async () => {
    const harness = makeHarness({
      persistedActor: { baseRole: "COMPANY_ADMIN" },
    });
    await executeHarness(harness);
    expect(harness.dependencies.auditWriter?.write).toHaveBeenCalledWith(
      expect.objectContaining({ actorRole: "COMPANY_ADMIN" }),
    );
  });

  it("preserves safe settings defaults when tenant settings are unavailable", async () => {
    const harness = makeHarness();
    vi.mocked(harness.dependencies.loadSettings).mockRejectedValueOnce(new Error("settings unavailable"));
    const response = await executeHarness(harness);
    expect(response.sources).toHaveLength(2);
    const writer = harness.observations.handoffs.find((entry) => entry.agent === "answer-writer-agent");
    expect(writer?.payload.maxTokens).toBe(1024);
  });

  it("never releases an unverified grounded answer", async () => {
    const harness = makeHarness({ verifierIds: [], complianceSourceIds: [] });
    const response = await executeHarness(harness);
    expect(response.answer).not.toBe("WRITER_DRAFT");
    expect(response.sources).toEqual([]);
    expect(harness.messages.at(-1)?.sources).toEqual([]);
  });
});

describe("ChatWorkflowService controlled short paths", () => {
  it("replaces a stage-invalid initial Supervisor handoff with trusted Intent execution", async () => {
    const harness = makeHarness({ scenario: "insufficient", searchCandidates: [] });
    await executeHarness(
      harness,
      "Does the company provide family health insurance?",
    );
    expect(harness.observations.decisions[0]).toMatchObject({
      action: "handoff",
      nextAgent: "intent-query-agent",
      reasonCode: "INTENT_REQUIRED",
    });
  });

  it("returns controlled English insufficient evidence when search finds no chunks", async () => {
    const harness = makeHarness({ scenario: "insufficient", searchCandidates: [] });
    const response = await executeHarness(
      harness,
      "Does the company provide family health insurance?",
    );
    expect(harness.observations.tools.map((tool) => tool.name)).toEqual([
      "authorized_hybrid_search",
    ]);
    expect(harness.observations.decisions.at(-1)).toMatchObject({
      action: "handoff",
      nextAgent: "compliance-agent",
      reasonCode: "NO_SEARCH_RESULTS",
    });
    expect(response.answer).toContain("sufficient authorized evidence");
    expect(response.sources).toEqual([]);
  });

  it("returns controlled Arabic insufficient evidence when search finds no chunks", async () => {
    const harness = makeHarness({
      scenario: "insufficient",
      searchCandidates: [],
      intentLanguage: "ar",
    });
    const response = await executeHarness(harness, "هل توفر الشركة تأميناً صحياً للعائلة؟");
    expect(response.answer).toContain("لم أتمكن من العثور على معلومات كافية");
    expect(response.sources).toEqual([]);
  });

  it("routes weak evidence to Compliance refusal without exposing weak sources", async () => {
    const harness = makeHarness({ scenario: "weak" });
    const response = await executeHarness(
      harness,
      "Does the company provide family health insurance?",
    );
    expect(harness.observations.tools.map((tool) => tool.name)).toEqual([
      "authorized_hybrid_search",
      "evaluate_evidence",
    ]);
    expect(harness.observations.decisions.at(-1)).toMatchObject({
      action: "handoff",
      nextAgent: "compliance-agent",
      reasonCode: "INSUFFICIENT_EVIDENCE",
    });
    expect(response.sources).toEqual([]);
  });

  it("returns deterministic social output with no retrieval, Compliance, or sources", async () => {
    const harness = makeHarness({ scenario: "social" });
    const response = await executeHarness(harness, "hello");
    expect(response).toMatchObject({ answer: "Hello! How can I help you today?", sources: [] });
    expect(harness.observations.tools).toEqual([]);
    expect(harness.observations.complianceInput).toBeUndefined();
    expect(harness.messages.at(-1)?.sources).toEqual([]);
  });

  it("returns deterministic DocuMind identity and capabilities with no retrieval, Compliance, or sources", async () => {
    const identity = makeHarness({ scenario: "assistant_identity", intentLanguage: "ar" });
    const identityResponse = await executeHarness(identity, "انت مين؟");
    expect(identityResponse.answer).toContain("DocuMind AI");
    expect(identityResponse.answer).toContain("مستندات الشركة");
    expect(identityResponse.sources).toEqual([]);
    expect(identity.observations.tools).toEqual([]);
    expect(identity.observations.complianceInput).toBeUndefined();
    expect(identity.messages.at(-1)?.sources).toEqual([]);

    const capabilities = makeHarness({ scenario: "assistant_capabilities", citationsEnabled: false });
    const capabilitiesResponse = await executeHarness(capabilities, "What can you do?");
    expect(capabilitiesResponse.answer).toContain("Arabic or English");
    expect(capabilitiesResponse.answer).toContain("authorized to access");
    expect(capabilitiesResponse.sources).toEqual([]);
    expect(capabilities.observations.tools).toEqual([]);
    expect(capabilities.observations.complianceInput).toBeUndefined();
  });

  it("routes analytics through one controlled tool and deterministic formatter", async () => {
    const harness = makeHarness({ scenario: "analytics" });
    const response = await executeHarness(harness, "How many documents are uploaded?");
    expect(harness.observations.handoffs[0]).toMatchObject({
      agent: "intent-query-agent",
      payload: { conversationId, question: "How many documents are uploaded?" },
    });
    expect(harness.observations.tools).toEqual([
      { name: "analytics_query", input: { metric: "document_count", period: "week" } },
    ]);
    expect(response.answer).toBe("You currently have 7 uploaded documents.");
    expect(response.sources).toEqual([]);
    expect(harness.observations.complianceInput).toBeUndefined();
  });

  it("localizes Arabic analytics after Intent and keeps the response source-less", async () => {
    const harness = makeHarness({
      scenario: "analytics",
      intentLanguage: "ar",
      analyticsResult: { count: 3 },
    });
    const response = await executeHarness(harness, "كم عدد المستندات؟");
    expect(harness.observations.handoffs[0]?.agent).toBe("intent-query-agent");
    expect(harness.observations.tools).toEqual([
      { name: "analytics_query", input: { metric: "document_count", period: "week" } },
    ]);
    expect(response.answer).toContain("3 مستندات");
    expect(response.sources).toEqual([]);
    expect(harness.reportKnowledgeGap).not.toHaveBeenCalled();
  });

  it("formats top queries only from the controlled analytics tool result", async () => {
    const harness = makeHarness({
      scenario: "analytics",
      analyticsResult: [
        { query: "leave policy", count: 4 },
        { query: "remote work", count: 2 },
      ],
    });
    const response = await executeHarness(harness, "What are the top queries this month?");
    expect(harness.observations.tools).toEqual([
      { name: "analytics_query", input: { metric: "top_queries", period: "month" } },
    ]);
    expect(response.answer).toContain("leave policy");
    expect(response.answer).toContain("4");
    expect(response.sources).toEqual([]);
  });

  it("keeps document-content count wording on controlled RAG", async () => {
    const harness = makeHarness({ scenario: "grounded" });
    await executeHarness(harness, "How many questions are in the employee handbook?");
    expect(harness.observations.tools.map((tool) => tool.name)).toEqual([
      "authorized_hybrid_search",
      "evaluate_evidence",
    ]);
    expect(harness.observations.tools.some((tool) => tool.name === "analytics_query")).toBe(false);
  });

  it("continues a RAG-compatible deterministic fallback through evidence and insufficient Compliance", async () => {
    const harness = makeHarness({ scenario: "insufficient" });
    const response = await executeHarness(harness, "What is the leave policy?");
    expect(harness.observations.tools.map((tool) => tool.name)).toEqual([
      "authorized_hybrid_search",
      "evaluate_evidence",
    ]);
    expect(harness.observations.complianceInput).toMatchObject({
      route: "rag",
      answerDecision: "insufficient_evidence",
    });
    expect(response.answer).toContain("sufficient authorized evidence");
    expect(response.sources).toEqual([]);
  });

  it("uses the Arabic summary task and reviewed summary budgets", async () => {
    const harness = makeHarness({
      intentLanguage: "ar",
      intentNormalizedQuestion: "لخص سياسة العمل عن بعد بالتفصيل",
    });
    await executeHarness(harness, "لخص سياسة العمل عن بعد بالتفصيل");
    expect(harness.observations.tools[0]?.input.topK).toBe(12);
    const writer = harness.observations.handoffs.find((entry) => entry.agent === "answer-writer-agent");
    expect(writer?.payload).toMatchObject({
      task: "document_summary",
      language: "ar",
      maxTokens: 2048,
    });
  });

  it("keeps a title-only document reference on restricted RAG instead of analytics", async () => {
    const harness = makeHarness({
      scenario: "grounded",
      intentReferencedDocumentIds: [],
      intentReferencedDocumentTitles: ["Onboarding 2026"],
      resolvedTitleDocumentIds: [documentA],
      searchCandidates: [
        {
          chunkId: chunkA,
          documentId: documentA,
          documentVersionId: versionA,
          score: 0.91,
        },
      ],
      approvedIds: [chunkA],
      writerCitations: [chunkA],
      verifierIds: [chunkA],
      complianceSourceIds: [chunkA],
    });
    const response = await executeHarness(
      harness,
      "How many questions are in Onboarding 2026?",
    );
    expect(harness.observations.tools.map((tool) => tool.name)).toEqual([
      "resolve_document_titles",
      "authorized_hybrid_search",
      "evaluate_evidence",
    ]);
    expect(harness.observations.tools[0]).toEqual({
      name: "resolve_document_titles",
      input: { titles: ["Onboarding 2026"] },
    });
    expect(harness.observations.tools[1]).toEqual({
      name: "authorized_hybrid_search",
      input: {
        queryText: "trusted normalized question",
        topK: 5,
        documentIds: [documentA],
      },
    });
    expect(harness.observations.tools).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "analytics_query" })]),
    );
    expect(response.answer).toBe("SAFE_FINAL");
  });

  it.each([
    ["unsafe", "UNSAFE_RESPONSE"],
    ["unsupported", "UNSUPPORTED_REQUEST"],
    ["clarification", "CLARIFICATION_REQUIRED"],
  ] as const)("uses Compliance for %s and persists zero sources", async (scenario, reasonCode) => {
    const harness = makeHarness({ scenario });
    const response = await executeHarness(harness);
    expect(harness.observations.complianceInput).toBeDefined();
    expect(harness.messages.at(-1)?.sources).toEqual([]);
    expect(response.sources).toEqual([]);
    expect((harness.observations.finalProposal as { reasonCode: string }).reasonCode).toBe("FORGED");
    expect(harness.messages.at(-1)?.content).not.toBe("FORGED");
    expect(harness.observations.complianceInput).not.toHaveProperty("rejectedCitationIds");
    expect(reasonCode).toBeTruthy();
  });

  it("records an insufficient-evidence Knowledge Gap best-effort", async () => {
    const harness = makeHarness({ scenario: "insufficient" });
    const response = await executeHarness(harness);
    expect(response.sources).toEqual([]);
    expect(harness.reportKnowledgeGap).toHaveBeenCalledTimes(1);
  });

  it("records an unverified-grounded Knowledge Gap and never releases the draft", async () => {
    const harness = makeHarness({ verifierIds: [], complianceSourceIds: [] });
    const response = await executeHarness(harness);
    expect(response.answer).not.toBe("WRITER_DRAFT");
    expect(response.sources).toEqual([]);
    expect(harness.reportKnowledgeGap).toHaveBeenCalledTimes(1);
  });

  it("does not record a Knowledge Gap for a grounded compliant answer", async () => {
    const harness = makeHarness();
    await executeHarness(harness);
    expect(harness.reportKnowledgeGap).not.toHaveBeenCalled();
  });

  it("does not report Knowledge Gaps for social, analytics, unsafe, unsupported, or clarification", async () => {
    for (const scenario of ["social", "analytics", "unsafe", "unsupported", "clarification"] as const) {
      const harness = makeHarness({ scenario });
      const message = scenario === "analytics" ? "How many documents are uploaded?" : "hello";
      await executeHarness(harness, message);
      expect(harness.reportKnowledgeGap).not.toHaveBeenCalled();
    }
  });

  it("does not write retrieval audit events for source-less social or analytics", async () => {
    for (const scenario of ["social", "analytics"] as const) {
      const harness = makeHarness({ scenario });
      await executeHarness(
        harness,
        scenario === "analytics" ? "How many documents are uploaded?" : "hello",
      );
      expect(harness.dependencies.auditWriter?.write).not.toHaveBeenCalled();
    }
  });

  it("keeps Knowledge Gap failures best-effort after trusted assistant persistence", async () => {
    const harness = makeHarness({ scenario: "insufficient" });
    harness.reportKnowledgeGap.mockRejectedValueOnce(new Error("gap unavailable"));
    const response = await executeHarness(harness);
    expect(response.answer).toContain("sufficient authorized evidence");
    expect(harness.messages.at(-1)?.role).toBe("assistant");
  });
});

describe("ChatWorkflowService stage progress emission", () => {
  async function executeWithStages(
    harness: ReturnType<typeof makeHarness>,
    onStage: (stage: string) => void,
    message = "What is the policy?",
  ) {
    return harness.service.execute(
      { message, conversationId },
      {
        tenantId: "client-tenant-is-ignored",
        actorId: "client-actor-is-ignored",
        actorEmail: "client@example.com",
        actorRole: "SUPER_ADMIN",
        traceId: "trace-1",
        requestId: "request-1",
        onStage,
      },
    );
  }

  it("emits the full RAG stage sequence in order", async () => {
    const harness = makeHarness({ scenario: "grounded" });
    const stages: string[] = [];
    await executeWithStages(harness, (stage) => stages.push(stage));
    expect(stages).toEqual([
      "intent",
      "search",
      "evidence",
      "answer",
      "verify",
      "finalize",
    ]);
  });

  it("skips answer and verify on the insufficient-evidence path", async () => {
    const harness = makeHarness({ scenario: "insufficient" });
    const stages: string[] = [];
    await executeWithStages(harness, (stage) => stages.push(stage));
    expect(stages).toEqual(["intent", "search", "evidence", "finalize"]);
  });

  it("emits only intent for the social short path", async () => {
    const harness = makeHarness({ scenario: "social" });
    const stages: string[] = [];
    await executeWithStages(harness, (stage) => stages.push(stage), "hello");
    expect(stages).toEqual(["intent"]);
  });

  it("completes the run when the stage listener throws", async () => {
    const harness = makeHarness({ scenario: "grounded" });
    const response = await executeWithStages(harness, () => {
      throw new Error("listener exploded");
    });
    expect(response.answer).toBe("SAFE_FINAL");
  });
});
