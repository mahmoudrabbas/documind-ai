import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_ALREADY_REGISTERED,
  AGENT_CONTRACT_INVALID,
  AGENT_PROVIDER_ERROR,
  FORBIDDEN,
} from "../../common/errors/errorCodes.js";
import { toAgentId } from "./agentContracts.js";
import type { DocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
import {
  CitationVerifierInputSchema,
  CitationVerifierOutputSchema,
} from "./chatAgentIO.js";
import { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import { createChatAgentRegistry } from "./chatAgents.js";
import type { AgentRunContext } from "./agentRunContext.js";
import {
  CITATION_VERIFICATION_AGENT_ID,
  CITATION_VERIFICATION_AGENT_VERSION,
  CitationVerificationAgentExecutor,
  registerCitationVerificationAgentExecutor,
  type CitationVerificationAgentDependencies,
} from "./citationVerificationAgent.js";
import type { LoadedChunkCandidate } from "./tools/authorizedRetrievalTools.js";

// ── fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = "507f1f77bcf86cd799439011";
const ACTOR_ID = "507f1f77bcf86cd799439012";
const DOC_ID = "507f1f77bcf86cd799439014";
const CHUNK_ID = "507f1f77bcf86cd799439016";
const INVENTED_ID = "507f1f77bcf86cd799439019";

function runContext(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    actorEmail: "employee@example.com",
    actorRole: "EMPLOYEE",
    traceId: "trace-1",
    requestId: "req-1",
    workflowName: "chat-rag-v1",
    agentName: CITATION_VERIFICATION_AGENT_ID,
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

function makeDeps(overrides: Partial<CitationVerificationAgentDependencies> = {}) {
  const loadChunksCalls: Array<{ tenantId: string; chunkIds: readonly string[] }> = [];
  const loadEligibleCalls: Array<{ tenantId: string; documentIds: readonly string[] }> = [];
  const authorizeCalls: string[] = [];

  const loadChunksByIds: CitationVerificationAgentDependencies["loadChunksByIds"] = async (tenantId, chunkIds) => {
    loadChunksCalls.push({ tenantId, chunkIds });
    return chunkIds.map((id) => makeLoadedChunk({ chunkId: id }));
  };

  const loadEligibleDocumentIds: CitationVerificationAgentDependencies["loadEligibleDocumentIds"] = async (tenantId, documentIds) => {
    loadEligibleCalls.push({ tenantId, documentIds });
    return documentIds;
  };

  const authorization = {
    authorizeDocumentAction: async (_ctx: unknown, documentId: string) => {
      authorizeCalls.push(documentId);
    },
  } as unknown as DocumentAccessAuthorizationService;
  const semanticVerifier: CitationVerificationAgentDependencies["semanticVerifier"] = {
    verify: async ({ answerText }) => ({
      claims: answerText ? [answerText] : [],
      unsupportedClaims: [],
    }),
  };

  return {
    deps: {
      loadChunksByIds,
      loadEligibleDocumentIds,
      authorization,
      semanticVerifier,
      ...overrides,
    } as CitationVerificationAgentDependencies,
    loadChunksCalls,
    loadEligibleCalls,
    authorizeCalls,
  };
}

function makeExecutor(deps: CitationVerificationAgentDependencies): CitationVerificationAgentExecutor {
  return new CitationVerificationAgentExecutor({ deps });
}

const VALID_INPUT = {
  decision: "grounded_answer" as const,
  citedChunkIds: [CHUNK_ID],
  approvedEvidenceIds: [CHUNK_ID],
};

// ── schema + registration ───────────────────────────────────────────────────

describe("CitationVerificationAgentExecutor", () => {
  it("exposes the approved contract id, version, and schemas", () => {
    const { deps } = makeDeps();
    const executor = makeExecutor(deps);
    assert.equal(executor.id, toAgentId(CITATION_VERIFICATION_AGENT_ID));
    assert.equal(executor.version, CITATION_VERIFICATION_AGENT_VERSION);
    assert.deepEqual(executor.capabilities, ["read", "search"]);
    assert.equal(executor.inputSchema, CitationVerifierInputSchema);
    assert.equal(executor.outputSchema, CitationVerifierOutputSchema);
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
    const definition = registerCitationVerificationAgentExecutor(registry, deps);
    assert.equal(definition.id, CITATION_VERIFICATION_AGENT_ID);
    assert.equal(definition.status, "active");
    assert.throws(
      () => registerCitationVerificationAgentExecutor(registry, deps),
      (err: unknown) =>
        err instanceof AppError && err.code === AGENT_ALREADY_REGISTERED,
    );
  });

  // ── non-grounded skip ──────────────────────────────────────────────────────

  it("skips non-grounded decisions without touching the evidence layer", async () => {
    const { deps, loadChunksCalls } = makeDeps();
    for (const decision of [
      "insufficient_evidence",
      "clarification",
      "unsupported",
      "unsafe",
    ] as const) {
      const result = await makeExecutor(deps).execute(runContext(), {
        decision,
        citedChunkIds: [INVENTED_ID],
        approvedEvidenceIds: [CHUNK_ID],
      });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.output.verified, true);
        assert.equal(result.output.reasonCode, "CITATIONS_SKIPPED");
        assert.deepEqual(result.output.validatedCitationIds, []);
        assert.deepEqual(result.output.rejectedCitationIds, []);
      }
      assert.equal(loadChunksCalls.length, 0, decision);
    }
  });

  // ── grounded verification ─────────────────────────────────────────────────

  it("loads evidence by id and reauthorizes each parent document for use_in_ai", async () => {
    const { deps, loadChunksCalls, loadEligibleCalls, authorizeCalls } = makeDeps();
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.verified, true);
      assert.equal(result.output.reasonCode, "CITATIONS_VERIFIED");
      assert.deepEqual(result.output.validatedCitationIds, [CHUNK_ID]);
      assert.deepEqual(result.output.rejectedCitationIds, []);
    }
    assert.deepEqual(loadChunksCalls, [
      { tenantId: TENANT_ID, chunkIds: [CHUNK_ID] },
    ]);
    assert.deepEqual(loadEligibleCalls, [{ tenantId: TENANT_ID, documentIds: [DOC_ID] }]);
    assert.deepEqual(authorizeCalls, [DOC_ID]);
  });

  it("keeps the validated subset when some cited ids are not authorized", async () => {
    const { deps, loadChunksCalls } = makeDeps();
    const result = await makeExecutor(deps).execute(runContext(), {
      decision: "grounded_answer",
      citedChunkIds: [CHUNK_ID, INVENTED_ID],
      approvedEvidenceIds: [CHUNK_ID],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.verified, true);
      assert.equal(result.output.reasonCode, "CITATIONS_VERIFIED");
      assert.deepEqual(result.output.validatedCitationIds, [CHUNK_ID]);
      assert.deepEqual(result.output.rejectedCitationIds, [INVENTED_ID]);
    }
    // Only the approved id is loaded server-side; the invented id resolves to nothing.
    assert.deepEqual(loadChunksCalls[0].chunkIds, [CHUNK_ID]);
  });

  it("runs semantic support only after membership and fails closed on unsupported claims", async () => {
    const semanticCalls: unknown[] = [];
    const { deps } = makeDeps({
      semanticVerifier: {
        verify: async (input) => {
          semanticCalls.push(input);
          return {
            claims: ["Employees receive 30 days of annual leave."],
            unsupportedClaims: ["Employees receive 30 days of annual leave."],
          };
        },
      },
    });
    const result = await makeExecutor(deps).execute(runContext(), {
      ...VALID_INPUT,
      answerText: "Employees receive 30 days of annual leave.",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.verified, false);
      assert.equal(result.output.reasonCode, "UNSUPPORTED_CLAIMS");
      assert.deepEqual(result.output.validatedCitationIds, [CHUNK_ID]);
      assert.deepEqual(result.output.unsupportedClaims, [
        "Employees receive 30 days of annual leave.",
      ]);
    }
    assert.equal(semanticCalls.length, 1);
  });

  it("does not invoke semantic verification when citation membership fails", async () => {
    let semanticCalls = 0;
    const { deps } = makeDeps({
      semanticVerifier: {
        verify: async () => {
          semanticCalls += 1;
          return { claims: [], unsupportedClaims: [] };
        },
      },
    });
    const result = await makeExecutor(deps).execute(runContext(), {
      decision: "grounded_answer",
      citedChunkIds: [INVENTED_ID],
      approvedEvidenceIds: [CHUNK_ID],
      answerText: "Invented claim.",
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.output.reasonCode, "MISSING_CITATIONS");
    assert.equal(semanticCalls, 0);
  });

  it("fails closed to MISSING_CITATIONS when no cited id survives authorization", async () => {
    const { deps } = makeDeps();
    const result = await makeExecutor(deps).execute(runContext(), {
      decision: "grounded_answer",
      citedChunkIds: [CHUNK_ID],
      approvedEvidenceIds: [],
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.verified, false);
      assert.equal(result.output.reasonCode, "MISSING_CITATIONS");
      assert.deepEqual(result.output.validatedCitationIds, []);
      assert.deepEqual(result.output.rejectedCitationIds, [CHUNK_ID]);
    }
  });

  it("drops chunks whose parent document fails use_in_ai reauthorization", async () => {
    const { deps } = makeDeps({
      authorization: {
        authorizeDocumentAction: async () => {
          throw new AppError(403, FORBIDDEN, "denied");
        },
      } as unknown as DocumentAccessAuthorizationService,
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.verified, false);
      assert.equal(result.output.reasonCode, "MISSING_CITATIONS");
      assert.deepEqual(result.output.rejectedCitationIds, [CHUNK_ID]);
    }
  });

  it("drops chunks with a non-retrievable status", async () => {
    const { deps } = makeDeps({
      loadChunksByIds: async (_tenantId, chunkIds) =>
        chunkIds.map((id) =>
          makeLoadedChunk({ chunkId: id, allowAiUse: false, status: "ARCHIVED" }),
        ),
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.verified, false);
      assert.deepEqual(result.output.rejectedCitationIds, [CHUNK_ID]);
    }
  });

  it("maps unexpected evidence-loader failures to AGENT_PROVIDER_ERROR", async () => {
    const { deps } = makeDeps({
      loadChunksByIds: async () => {
        throw new Error("db boom");
      },
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, "failed");
      assert.equal(result.error.code, AGENT_PROVIDER_ERROR);
    }
  });

  it("surfaces 403 authorization errors as unauthorized", async () => {
    const { deps } = makeDeps({
      loadEligibleDocumentIds: async () => {
        throw new AppError(403, FORBIDDEN, "denied");
      },
    });
    const result = await makeExecutor(deps).execute(runContext(), VALID_INPUT);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, "unauthorized");
      assert.equal(result.error.code, FORBIDDEN);
    }
  });

  it("reports semantic model metadata when supplied by the verifier", async () => {
    const { deps } = makeDeps({
      semanticVerifier: {
        verify: async () => ({
          claims: ["Supported."],
          unsupportedClaims: [],
          providerKey: "semantic-provider",
          modelName: "semantic-model",
          totalTokens: 12,
          estimatedCost: 0.01,
          latencyMs: 3,
        }),
      },
    });
    const result = await makeExecutor(deps).execute(runContext(), {
      ...VALID_INPUT,
      answerText: "Supported.",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.metadata, {
        modelProvider: "semantic-provider",
        modelName: "semantic-model",
        tokensUsed: 12,
        estimatedCost: 0.01,
        latencyMs: 3,
      });
      assert.ok(result.latencyMs >= 0);
    }
  });
});
