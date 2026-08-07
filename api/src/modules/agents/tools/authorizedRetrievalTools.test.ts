import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AccessContext, RetrievalCandidate } from "../../../modules/retrieval/retrieval.types.js";
import type { RerankerService } from "../../../modules/reranker/reranker.service.js";
import type { EvidenceBundle, SufficiencyLevel } from "../../../modules/reranker/reranker.types.js";
import type { HybridRetrievalService } from "../../../modules/retrieval/retrieval.service.js";
import type { DocumentAccessAuthorizationService } from "../../../modules/document-access/documentAccess.authorization.service.js";
import type { LoadedChunkCandidate } from "./authorizedRetrievalTools.js";
import { ToolRegistry } from "../toolRegistry.js";
import {
  createAuthorizedRetrievalTools,
  registerAuthorizedRetrievalTools,
  type AuthorizedRetrievalDependencies,
} from "./authorizedRetrievalTools.js";

const tenantId = "64a000000000000000000001";
const actorId = "64a000000000000000000003";
const docId = "64a000000000000000000005";
const versionId = "64a000000000000000000007";
const chunkId = "64a000000000000000000009";
const chunkIdB = "64a00000000000000000000b";
const chunkIdC = "64a00000000000000000000d";
const docIdB = "64a00000000000000000000f";

function agentRunContext(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tenantId,
    actorId,
    traceId: "trace-1",
    requestId: "req-1",
    workflowName: "test-workflow",
    agentName: "test-agent",
    actorEmail: "actor@example.com",
    actorRole: "EMPLOYEE",
    ...overrides,
  };
}

function makeCandidate(override: Partial<RetrievalCandidate> = {}): RetrievalCandidate {
  return {
    chunkId,
    documentId: docId,
    documentVersionId: versionId,
    tenantId,
    text: "sample chunk text",
    score: 0.9,
    retrievalMethod: "hybrid",
    ...override,
  };
}

function makeLoadedChunk(override: Partial<LoadedChunkCandidate> = {}): LoadedChunkCandidate {
  return {
    chunkId,
    documentId: docId,
    documentVersionId: versionId,
    tenantId,
    text: "sample chunk text",
    allowAiUse: true,
    status: "ACTIVE",
    confidenceScore: 0.9,
    ...override,
  };
}

function makeBundle(
  sufficiencyLevel: SufficiencyLevel = "SUFFICIENT",
  opts: {
    items?: Array<{ chunkId: string; documentId: string; score: number }>;
    conflictGroups?: EvidenceBundle["conflictGroups"];
    scoreExplanation?: string;
    fallbackReasons?: string[];
  } = {},
): EvidenceBundle {
  const items = opts.items ?? [{ chunkId, documentId: docId, score: 0.9 }];
  const fallback =
    opts.scoreExplanation?.startsWith("Fallback:") || (opts.fallbackReasons?.length ?? 0) > 0;
  return {
    items: items.map((item, i) => ({
      rank: i + 1,
      candidate: {
        chunkId: item.chunkId,
        documentId: item.documentId,
        documentVersionId: versionId,
        tenantId,
        text: "sample chunk text",
        score: item.score,
        retrievalMethod: "hybrid",
      },
      scoreBreakdown: {
        fusionScore: item.score,
        rerankScore: item.score,
        semanticScore: item.score,
        exactTermScore: 0,
        sourceAuthorityScore: 0,
        versionPreferenceScore: 0,
        totalScore: item.score,
      },
      citationAnchor: {
        chunkId: item.chunkId,
        documentId: item.documentId,
        documentVersionId: versionId,
        pageNumber: 1,
        sectionTitle: "Section 1",
      },
      textExcerpt: "sample chunk text",
      expanded: false,
      neighborChunkIds: [],
    })),
    totalTokenCount: 10,
    maxTokenCount: 4000,
    inputCandidateCount: items.length,
    conflictGroups: opts.conflictGroups ?? [],
    sufficiency: {
      level: fallback ? "WEAK" : sufficiencyLevel,
      reasons: opts.fallbackReasons ?? (fallback ? ["Reranker fallback: evidence returned without reranking"] : []),
    },
    scoreExplanation: opts.scoreExplanation ?? "test bundle",
    accessPolicyVersion: "1.0.0",
    createdAt: new Date().toISOString(),
  };
}

function makeDeps(overrides: Partial<AuthorizedRetrievalDependencies> = {}) {
  const retrievalCalls: Array<{ query: unknown; ctx: AccessContext }> = [];
  const rerankerCalls: Array<{ candidates: RetrievalCandidate[]; queryText: string }> = [];
  const resolveDocumentHintsCalls: Array<{ rawIds: readonly string[]; rawTitles?: readonly string[] }> = [];
  const loadChunksCalls: Array<{ tenantId: string; chunkIds: readonly string[] }> = [];
  const loadEligibleCalls: Array<{ tenantId: string; documentIds: readonly string[] }> = [];
  const authorizeCalls: string[] = [];

  const retrieval: HybridRetrievalService = {
    hybridSearch: async (query: unknown, ctx: AccessContext) => {
      retrievalCalls.push({ query, ctx });
      const candidates = [makeCandidate()];
      return {
        candidates,
        totalCandidates: 1,
        filterSummary: {
          tenantFilter: true,
          roleFilter: "EMPLOYEE",
          permissionScopes: [],
          explicitFilters: [],
          versionFilter: false,
        },
        diagnostics: { totalLatencyMs: 5, vectorCandidateCount: 1, keywordCandidateCount: 1, traceId: "trace-1" },
      };
    },
    vectorSearch: async () => ({ candidates: [], totalCandidates: 0, filterSummary: {} as never, diagnostics: {} as never }),
    keywordSearch: async () => ({ candidates: [], totalCandidates: 0, filterSummary: {} as never, diagnostics: {} as never }),
  } as unknown as HybridRetrievalService;

  const reranker: RerankerService = {
    buildEvidenceBundle: async (candidates, queryText) => {
      rerankerCalls.push({ candidates, queryText });
      return makeBundle();
    },
  } as RerankerService;

  const authorization = {
    resolveActor: async () => ({
      tenantId,
      actorId,
      baseRole: "EMPLOYEE" as const,
      customRoleId: null,
      departmentIds: [] as string[],
    }),
    authorizeDocumentAction: async (_ctx: unknown, documentId: string) => {
      authorizeCalls.push(documentId);
    },
    authorizeDocumentsAction: async () => undefined,
    buildDiscoverPipeline: async () => [],
  } as unknown as DocumentAccessAuthorizationService;

  const resolveDocumentHints: AuthorizedRetrievalDependencies["resolveDocumentHints"] = async (
    rawIds,
    _context,
    rawTitles = [],
  ) => {
    resolveDocumentHintsCalls.push({ rawIds, rawTitles });
    return {
      referencedDocumentIds: [],
      referencedDocumentTitles: [],
      ambiguousTitleMatches: false,
      unresolvedTitleHints: [],
    };
  };

  const loadChunksByIds: AuthorizedRetrievalDependencies["loadChunksByIds"] = async (_tenantId, chunkIds) => {
    loadChunksCalls.push({ tenantId: _tenantId, chunkIds });
    return chunkIds.map((id) => makeLoadedChunk({ chunkId: id }));
  };

  const loadEligibleDocumentIds: AuthorizedRetrievalDependencies["loadEligibleDocumentIds"] = async (_tenantId, documentIds) => {
    loadEligibleCalls.push({ tenantId: _tenantId, documentIds });
    return documentIds;
  };

  return {
    deps: {
      retrieval,
      reranker,
      authorization,
      resolveDocumentHints,
      loadChunksByIds,
      loadEligibleDocumentIds,
      ...overrides,
    } as AuthorizedRetrievalDependencies,
    retrievalCalls,
    rerankerCalls,
    resolveDocumentHintsCalls,
    loadChunksCalls,
    loadEligibleCalls,
    authorizeCalls,
  };
}

function toolOf(name: string, deps: AuthorizedRetrievalDependencies) {
  return createAuthorizedRetrievalTools(deps).find((t) => t.schema.name === name)!;
}

// ── Schema validation + trusted context rejection ─────────────────────────

describe("authorizedRetrievalTools — schema & input validation", () => {
  const tools = createAuthorizedRetrievalTools(makeDeps().deps);

  test("resolve_document_titles rejects unknown fields (strict)", () => {
    const tool = tools.find((t) => t.schema.name === "resolve_document_titles")!;
    assert.throws(() => tool.schema.inputSchema.parse({ documentIds: [docId], bogus: true }));
  });

  test("resolve_document_titles rejects tenantId injection", () => {
    const tool = tools.find((t) => t.schema.name === "resolve_document_titles")!;
    assert.throws(() =>
      tool.schema.inputSchema.parse({
        titles: ["Employee Handbook"],
        tenantId: "evil-tenant",
      }),
    );
  });

  test("resolve_document_titles requires at least one title", () => {
    const tool = tools.find((t) => t.schema.name === "resolve_document_titles")!;
    assert.throws(() => tool.schema.inputSchema.parse({ titles: [] }));
    assert.throws(() => tool.schema.inputSchema.parse({}));
  });

  test("resolve_document_titles rejects empty title strings", () => {
    const tool = tools.find((t) => t.schema.name === "resolve_document_titles")!;
    assert.throws(() => tool.schema.inputSchema.parse({ titles: ["   "] }));
  });

  test("authorized_hybrid_search rejects actorRole injection", () => {
    const tool = tools.find((t) => t.schema.name === "authorized_hybrid_search")!;
    assert.throws(() =>
      tool.schema.inputSchema.parse({
        queryText: "test",
        actorRole: "SUPER_ADMIN",
      }),
    );
  });

  test("authorized_hybrid_search rejects runId injection", () => {
    const tool = tools.find((t) => t.schema.name === "authorized_hybrid_search")!;
    assert.throws(() =>
      tool.schema.inputSchema.parse({
        queryText: "test",
        runId: "evil-run",
      }),
    );
  });

  test("evaluate_evidence rejects baseRole injection", () => {
    const tool = tools.find((t) => t.schema.name === "evaluate_evidence")!;
    assert.throws(() =>
      tool.schema.inputSchema.parse({
        question: "test",
        candidateIds: [chunkId],
        baseRole: "SUPER_ADMIN",
      }),
    );
  });

  test("evaluate_evidence requires candidateIds", () => {
    const tool = tools.find((t) => t.schema.name === "evaluate_evidence")!;
    assert.throws(() =>
      tool.schema.inputSchema.parse({
        question: "test",
      }),
    );
    assert.throws(() =>
      tool.schema.inputSchema.parse({
        question: "test",
        candidateIds: [],
      }),
    );
  });

  test("authorized_hybrid_search rejects invalid ObjectId in documentIds", () => {
    const tool = tools.find((t) => t.schema.name === "authorized_hybrid_search")!;
    assert.throws(() =>
      tool.schema.inputSchema.parse({
        queryText: "test",
        documentIds: ["not-a-valid-id"],
      }),
    );
  });

  test("evaluate_evidence rejects invalid ObjectId in candidateIds", () => {
    const tool = tools.find((t) => t.schema.name === "evaluate_evidence")!;
    assert.throws(() =>
      tool.schema.inputSchema.parse({
        question: "test",
        candidateIds: ["not-a-valid-id"],
      }),
    );
  });

  test("authorized_hybrid_search rejects empty queryText", () => {
    const tool = tools.find((t) => t.schema.name === "authorized_hybrid_search")!;
    assert.throws(() => tool.schema.inputSchema.parse({ queryText: "" }));
  });

  test("authorized_hybrid_search rejects topK > 50", () => {
    const tool = tools.find((t) => t.schema.name === "authorized_hybrid_search")!;
    assert.throws(() =>
      tool.schema.inputSchema.parse({ queryText: "test", topK: 51 }),
    );
  });

  test("authorized_hybrid_search defaults topK to 10", () => {
    const tool = tools.find((t) => t.schema.name === "authorized_hybrid_search")!;
    const parsed = tool.schema.inputSchema.parse({ queryText: "test" }) as { topK: number };
    assert.equal(parsed.topK, 10);
  });
});

// ── Handler: trusted context field rejection via assertion ─────────────────

describe("authorizedRetrievalTools — trusted context assertion", () => {
  const { deps } = makeDeps();

  test("resolve_document_titles handler rejects tenantId in input", async () => {
    const tool = toolOf("resolve_document_titles", deps);
    await assert.rejects(
      () =>
        tool.handler(agentRunContext(), {
          titles: ["Employee Handbook"],
          tenantId: "evil",
        }),
      (err: unknown) =>
        err instanceof Error && err.message.includes("tenantId"),
    );
  });

  test("authorized_hybrid_search handler rejects actorId in input", async () => {
    const tool = toolOf("authorized_hybrid_search", deps);
    await assert.rejects(
      () =>
        tool.handler(agentRunContext(), {
          queryText: "hello",
          actorId: "evil",
        }),
      (err: unknown) =>
        err instanceof Error && err.message.includes("actorId"),
    );
  });

  test("authorized_hybrid_search handler rejects permissions in input", async () => {
    const tool = toolOf("authorized_hybrid_search", deps);
    await assert.rejects(
      () =>
        tool.handler(agentRunContext(), {
          queryText: "hello",
          permissions: ["SUPER_ADMIN"],
        }),
      (err: unknown) =>
        err instanceof Error && err.message.includes("permissions"),
    );
  });

  test("evaluate_evidence handler rejects requestId in input", async () => {
    const tool = toolOf("evaluate_evidence", deps);
    await assert.rejects(
      () =>
        tool.handler(agentRunContext(), {
          question: "test",
          candidateIds: [chunkId],
          requestId: "evil",
        }),
      (err: unknown) =>
        err instanceof Error && err.message.includes("requestId"),
    );
  });
});

// ── Handler: agent context requirement (fail closed) ───────────────────────

describe("authorizedRetrievalTools — agent context requirement", () => {
  test("authorized_hybrid_search fails closed when neither trusted actorRole nor persisted actor is available", async () => {
    const { deps } = makeDeps();
    const failingDeps = {
      ...deps,
      authorization: {
        resolveActor: async () => {
          throw new Error("not found");
        },
      } as unknown as DocumentAccessAuthorizationService,
    };
    const tool = toolOf("authorized_hybrid_search", failingDeps);
    const plainContext = agentRunContext() as Record<string, unknown>;
    delete plainContext["actorRole"];
    delete plainContext["actorEmail"];
    await assert.rejects(
      () =>
        tool.handler(plainContext as never, {
          queryText: "hello",
        }),
      (err: unknown) =>
        err instanceof Error && err.message.includes("authenticated"),
    );
  });

  test("authorized_hybrid_search resolves persisted actor when actorRole absent", async () => {
    const { deps } = makeDeps();
    const tool = toolOf("authorized_hybrid_search", deps);
    const plainContext = agentRunContext() as Record<string, unknown>;
    delete plainContext["actorRole"];
    const result = (await tool.handler(plainContext as never, {
      queryText: "hello",
    })) as { candidates: unknown[]; totalCandidates: number };
    assert.equal(result.totalCandidates, 1);
    assert.ok(Array.isArray(result.candidates));
  });
});

// ── Handler: resolve_document_titles ───────────────────────────────────────

describe("authorizedRetrievalTools — resolve_document_titles handler", () => {
  test("returns one_match with resolved ids", async () => {
    const calls: Array<{ rawIds: readonly string[]; rawTitles?: readonly string[] }> = [];
    const { deps } = makeDeps({
      resolveDocumentHints: async (rawIds, _ctx, rawTitles = []) => {
        calls.push({ rawIds, rawTitles });
        return {
          referencedDocumentIds: [docId],
          referencedDocumentTitles: ["Employee Handbook"],
          ambiguousTitleMatches: false,
          unresolvedTitleHints: [],
        };
      },
    });
    const tool = toolOf("resolve_document_titles", deps);

    const result = (await tool.handler(agentRunContext(), {
      titles: ["Employee Handbook"],
    })) as { status: string; documentIds: string[]; reasonCode: string };

    assert.equal(result.status, "one_match");
    assert.deepEqual(result.documentIds, [docId]);
    assert.equal(result.reasonCode, "MATCH_FOUND");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]!.rawIds, []);
    assert.deepEqual(calls[0]!.rawTitles, ["Employee Handbook"]);
  });

  test("returns no_match for unresolvable titles", async () => {
    const { deps } = makeDeps({
      resolveDocumentHints: async () => ({
        referencedDocumentIds: [],
        referencedDocumentTitles: [],
        ambiguousTitleMatches: false,
        unresolvedTitleHints: ["Nonexistent"],
      }),
    });
    const tool = toolOf("resolve_document_titles", deps);

    const result = (await tool.handler(agentRunContext(), {
      titles: ["Nonexistent"],
    })) as { status: string; documentIds: string[]; reasonCode: string };

    assert.equal(result.status, "no_match");
    assert.deepEqual(result.documentIds, []);
    assert.equal(result.reasonCode, "NO_MATCH");
  });

  test("returns ambiguous without ids when a title matches multiple documents", async () => {
    const { deps } = makeDeps({
      resolveDocumentHints: async () => ({
        referencedDocumentIds: [],
        referencedDocumentTitles: [],
        ambiguousTitleMatches: true,
        unresolvedTitleHints: [],
      }),
    });
    const tool = toolOf("resolve_document_titles", deps);

    const result = (await tool.handler(agentRunContext(), {
      titles: ["Shared Title"],
    })) as { status: string; documentIds: string[]; reasonCode: string };

    assert.equal(result.status, "ambiguous");
    assert.deepEqual(result.documentIds, []);
    assert.equal(result.reasonCode, "AMBIGUOUS_TITLE");
  });

  test("unauthorized / cross-tenant / nonexistent titles are indistinguishable no_match", async () => {
    const { deps } = makeDeps({
      resolveDocumentHints: async () => ({
        referencedDocumentIds: [],
        referencedDocumentTitles: [],
        ambiguousTitleMatches: false,
        unresolvedTitleHints: ["Foreign Secret"],
      }),
    });
    const tool = toolOf("resolve_document_titles", deps);

    const result = (await tool.handler(agentRunContext(), {
      titles: ["Foreign Secret"],
    })) as { status: string; documentIds: string[]; reasonCode: string };

    assert.equal(result.status, "no_match");
    assert.deepEqual(result.documentIds, []);
    assert.equal(result.reasonCode, "NO_MATCH");
  });
});

// ── Handler: authorized_hybrid_search ──────────────────────────────────────

describe("authorizedRetrievalTools — authorized_hybrid_search handler", () => {
  test("delegates to retrieval service with server-derived accessContext", async () => {
    const { deps, retrievalCalls } = makeDeps();
    const tool = toolOf("authorized_hybrid_search", deps);

    const result = (await tool.handler(agentRunContext(), {
      queryText: "policies",
      topK: 5,
      documentIds: [docId],
    })) as {
      candidates: Array<{ chunkId: string; documentId: string }>;
      totalCandidates: number;
      reasonCode: string;
    };

    assert.equal(retrievalCalls.length, 1);
    assert.deepEqual(retrievalCalls[0]!.query, {
      queryText: "policies",
      topK: 5,
      filter: { documentIds: [docId] },
    });

    const ctx = retrievalCalls[0]!.ctx;
    assert.equal(ctx.tenantId, tenantId);
    assert.equal(ctx.actorId, actorId);
    assert.equal(ctx.actorEmail, "actor@example.com");
    assert.equal(ctx.baseRole, "EMPLOYEE");
    assert.equal(ctx.requiredAction, "use_in_ai");

    assert.equal(result.totalCandidates, 1);
    assert.equal(result.candidates[0]?.documentId, docId);
    assert.equal(result.candidates[0]?.chunkId, chunkId);
    assert.equal(result.reasonCode, "SEARCH_COMPLETED");
  });

  test("returns metadata-only candidates without chunk text or evidence sufficiency", async () => {
    const secret = "TOP SECRET CHUNK TEXT";
    const { deps } = makeDeps({
      retrieval: {
        hybridSearch: async () => ({
          candidates: [
            makeCandidate({ text: secret, chunkId, documentId: docId }),
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
    });
    const tool = toolOf("authorized_hybrid_search", deps);

    const result = await tool.handler(agentRunContext(), { queryText: "policies" });
    const json = JSON.stringify(result);

    assert.equal(json.includes(secret), false);
    assert.equal(json.includes("textExcerpt"), false);
    assert.equal(json.includes("evidenceBundle"), false);
    assert.equal(json.includes("sufficiency"), false);
    assert.equal(json.includes("isSufficient"), false);
  });

  test("propagates retrieval failure as AppError", async () => {
    const failingDeps: AuthorizedRetrievalDependencies = {
      ...makeDeps().deps,
      retrieval: {
        hybridSearch: async () => {
          throw new Error("backend down");
        },
        vectorSearch: async () => ({}) as never,
        keywordSearch: async () => ({}) as never,
      } as unknown as HybridRetrievalService,
    };
    const tool = toolOf("authorized_hybrid_search", failingDeps);

    await assert.rejects(
      () =>
        tool.handler(agentRunContext(), {
          queryText: "failed",
        }),
      (err: unknown) =>
        err instanceof Error &&
        err.message === "Hybrid retrieval failed",
    );
  });
});

// ── Handler: evaluate_evidence ─────────────────────────────────────────────

describe("authorizedRetrievalTools — evaluate_evidence handler", () => {
  test("loads candidates server-side, reauthorizes, and approves SUFFICIENT evidence", async () => {
    const rerankerCallsLocal: Array<{ candidates: RetrievalCandidate[]; queryText: string }> = [];
    const { deps, loadChunksCalls, loadEligibleCalls, authorizeCalls } = makeDeps({
      reranker: {
        buildEvidenceBundle: async (candidates, queryText) => {
          rerankerCallsLocal.push({ candidates, queryText });
          return makeBundle("SUFFICIENT", {
            items: candidates.map((c) => ({
              chunkId: c.chunkId,
              documentId: c.documentId,
              score: 0.9,
            })),
          });
        },
      } as RerankerService,
    });
    const tool = toolOf("evaluate_evidence", deps);

    const result = (await tool.handler(agentRunContext(), {
      question: "what is the leave policy?",
      candidateIds: [chunkId],
    })) as {
      sufficiency: string;
      approvedEvidenceIds: string[];
      rejectedEvidenceIds: string[];
      reasonCode: string;
    };

    assert.equal(result.sufficiency, "SUFFICIENT");
    assert.deepEqual(result.approvedEvidenceIds, [chunkId]);
    assert.deepEqual(result.rejectedEvidenceIds, []);
    assert.equal(result.reasonCode, "EVIDENCE_SUFFICIENT");

    assert.deepEqual(loadChunksCalls[0]!.chunkIds, [chunkId]);
    assert.deepEqual(loadEligibleCalls[0]!.documentIds, [docId]);
    assert.deepEqual(authorizeCalls, [docId]);
    assert.equal(rerankerCallsLocal.length, 1);
    assert.equal(rerankerCallsLocal[0]!.queryText, "what is the leave policy?");
    assert.equal(rerankerCallsLocal[0]!.candidates.length, 1);
  });

  test("WEAK bundles approve nothing", async () => {
    const { deps } = makeDeps({
      reranker: {
        buildEvidenceBundle: async () =>
          makeBundle("WEAK", { items: [{ chunkId, documentId: docId, score: 0.3 }] }),
      } as RerankerService,
    });
    const tool = toolOf("evaluate_evidence", deps);

    const result = (await tool.handler(agentRunContext(), {
      question: "test",
      candidateIds: [chunkId],
    })) as {
      sufficiency: string;
      approvedEvidenceIds: string[];
      rejectedEvidenceIds: string[];
      reasonCode: string;
    };

    assert.equal(result.sufficiency, "WEAK");
    assert.deepEqual(result.approvedEvidenceIds, []);
    assert.deepEqual(result.rejectedEvidenceIds, [chunkId]);
  });

  test("NO_EVIDENCE bundles approve nothing", async () => {
    const { deps } = makeDeps({
      reranker: {
        buildEvidenceBundle: async () => makeBundle("NO_EVIDENCE", { items: [] }),
      } as RerankerService,
    });
    const tool = toolOf("evaluate_evidence", deps);

    const result = (await tool.handler(agentRunContext(), {
      question: "test",
      candidateIds: [chunkId],
    })) as {
      sufficiency: string;
      approvedEvidenceIds: string[];
      rejectedEvidenceIds: string[];
      reasonCode: string;
    };

    assert.equal(result.sufficiency, "NO_EVIDENCE");
    assert.deepEqual(result.approvedEvidenceIds, []);
    assert.deepEqual(result.rejectedEvidenceIds, [chunkId]);
  });

  test("CONFLICTING bundles approve nothing", async () => {
    const { deps } = makeDeps({
      reranker: {
        buildEvidenceBundle: async () =>
          makeBundle("CONFLICTING", {
            items: [
              { chunkId, documentId: docId, score: 0.9 },
              { chunkId: chunkIdB, documentId: docIdB, score: 0.9 },
            ],
            conflictGroups: [{ conflictId: "c1", description: "conflict", itemIndices: [0, 1] }],
          }),
      } as RerankerService,
    });
    const tool = toolOf("evaluate_evidence", deps);

    const result = (await tool.handler(agentRunContext(), {
      question: "test",
      candidateIds: [chunkId, chunkIdB],
    })) as {
      sufficiency: string;
      approvedEvidenceIds: string[];
      rejectedEvidenceIds: string[];
      reasonCode: string;
    };

    assert.equal(result.sufficiency, "CONFLICTING");
    assert.deepEqual(result.approvedEvidenceIds, []);
    assert.deepEqual(result.rejectedEvidenceIds, [chunkId, chunkIdB]);
  });

  test("reranker failure approves nothing (fails closed)", async () => {
    const { deps } = makeDeps({
      reranker: {
        buildEvidenceBundle: async () => {
          throw new Error("reranker down");
        },
      } as RerankerService,
    });
    const tool = toolOf("evaluate_evidence", deps);

    const result = (await tool.handler(agentRunContext(), {
      question: "test",
      candidateIds: [chunkId],
    })) as {
      sufficiency: string;
      approvedEvidenceIds: string[];
      rejectedEvidenceIds: string[];
      reasonCode: string;
    };

    assert.equal(result.sufficiency, "NO_EVIDENCE");
    assert.deepEqual(result.approvedEvidenceIds, []);
    assert.deepEqual(result.rejectedEvidenceIds, [chunkId]);
    assert.equal(result.reasonCode, "RERANKER_UNAVAILABLE");
  });

  test("raw-similarity fallback bundle never approves evidence (scoreExplanation)", async () => {
    const { deps } = makeDeps({
      reranker: {
        buildEvidenceBundle: async () =>
          makeBundle("WEAK", {
            items: [{ chunkId, documentId: docId, score: 0.9 }],
            scoreExplanation: "Fallback: reranker unavailable, returning raw candidates",
          }),
      } as RerankerService,
    });
    const tool = toolOf("evaluate_evidence", deps);

    const result = (await tool.handler(agentRunContext(), {
      question: "test",
      candidateIds: [chunkId],
    })) as {
      sufficiency: string;
      approvedEvidenceIds: string[];
      rejectedEvidenceIds: string[];
      reasonCode: string;
    };

    assert.equal(result.sufficiency, "NO_EVIDENCE");
    assert.deepEqual(result.approvedEvidenceIds, []);
    assert.deepEqual(result.rejectedEvidenceIds, [chunkId]);
    assert.equal(result.reasonCode, "RERANKER_UNAVAILABLE");
  });

  test("raw-similarity fallback bundle never approves evidence (reasons)", async () => {
    const { deps } = makeDeps({
      reranker: {
        buildEvidenceBundle: async () =>
          makeBundle("WEAK", {
            items: [{ chunkId, documentId: docId, score: 0.9 }],
            fallbackReasons: ["Reranker fallback: evidence returned without reranking"],
          }),
      } as RerankerService,
    });
    const tool = toolOf("evaluate_evidence", deps);

    const result = (await tool.handler(agentRunContext(), {
      question: "test",
      candidateIds: [chunkId],
    })) as {
      sufficiency: string;
      approvedEvidenceIds: string[];
      rejectedEvidenceIds: string[];
      reasonCode: string;
    };

    assert.equal(result.sufficiency, "NO_EVIDENCE");
    assert.deepEqual(result.approvedEvidenceIds, []);
    assert.deepEqual(result.rejectedEvidenceIds, [chunkId]);
    assert.equal(result.reasonCode, "RERANKER_UNAVAILABLE");
  });

  test("approved evidence ids are a subset of authorized candidate ids", async () => {
    const { deps } = makeDeps({
      loadChunksByIds: async (_tenantId, chunkIds) =>
        chunkIds
          .filter((id) => id !== chunkIdC)
          .map((id) =>
            makeLoadedChunk({
              chunkId: id,
              documentId: id === chunkIdB ? docIdB : docId,
            }),
          ),
      reranker: {
        buildEvidenceBundle: async () =>
          makeBundle("SUFFICIENT", {
            items: [{ chunkId, documentId: docId, score: 0.9 }],
          }),
      } as RerankerService,
    });
    const tool = toolOf("evaluate_evidence", deps);

    const result = (await tool.handler(agentRunContext(), {
      question: "test",
      candidateIds: [chunkId, chunkIdB, chunkIdC],
    })) as {
      sufficiency: string;
      approvedEvidenceIds: string[];
      rejectedEvidenceIds: string[];
    };

    assert.equal(result.sufficiency, "SUFFICIENT");
    assert.deepEqual(result.approvedEvidenceIds, [chunkId]);
    assert.ok(
      result.approvedEvidenceIds.every((id) => [chunkId, chunkIdB].includes(id)),
    );
    assert.deepEqual(result.rejectedEvidenceIds.sort(), [chunkIdB, chunkIdC].sort());
    for (const id of result.rejectedEvidenceIds) {
      assert.equal(result.approvedEvidenceIds.includes(id), false);
    }
  });

  test("no all-candidate fallback: unapproved authorized candidates stay rejected", async () => {
    const { deps } = makeDeps({
      reranker: {
        buildEvidenceBundle: async () =>
          makeBundle("SUFFICIENT", {
            items: [
              { chunkId, documentId: docId, score: 0.9 },
              { chunkId: chunkIdB, documentId: docIdB, score: 0.05 },
            ],
          }),
      } as RerankerService,
    });
    const tool = toolOf("evaluate_evidence", deps);

    const result = (await tool.handler(agentRunContext(), {
      question: "test",
      candidateIds: [chunkId, chunkIdB],
    })) as {
      sufficiency: string;
      approvedEvidenceIds: string[];
      rejectedEvidenceIds: string[];
    };

    assert.equal(result.sufficiency, "SUFFICIENT");
    assert.deepEqual(result.approvedEvidenceIds, [chunkId]);
    assert.deepEqual(result.rejectedEvidenceIds, [chunkIdB]);
  });

  test("excludes chunks that are not allowAiUse or are non-retrievable status", async () => {
    const { deps, rerankerCalls } = makeDeps({
      loadChunksByIds: async (_tenantId, chunkIds) =>
        chunkIds.map((id) =>
          makeLoadedChunk({
            chunkId: id,
            allowAiUse: id !== chunkIdB,
            status: id === chunkIdC ? "RETIRED" : "ACTIVE",
          }),
        ),
    });
    const tool = toolOf("evaluate_evidence", deps);

    const result = (await tool.handler(agentRunContext(), {
      question: "test",
      candidateIds: [chunkId, chunkIdB, chunkIdC],
    })) as {
      sufficiency: string;
      approvedEvidenceIds: string[];
      rejectedEvidenceIds: string[];
    };

    assert.equal(result.sufficiency, "SUFFICIENT");
    assert.deepEqual(result.approvedEvidenceIds, [chunkId]);
    assert.deepEqual(result.rejectedEvidenceIds.sort(), [chunkIdB, chunkIdC].sort());
    assert.equal(rerankerCalls.length, 1);
    assert.deepEqual(rerankerCalls[0]!.candidates.map((c) => c.chunkId), [chunkId]);
  });

  test("cross-tenant and unauthorized candidates never reach the reranker", async () => {
    const { deps, rerankerCalls, authorizeCalls } = makeDeps({
      loadChunksByIds: async (_tenantId, chunkIds) =>
        chunkIds
          .filter((id) => id !== chunkIdC)
          .map((id) =>
            makeLoadedChunk({
              chunkId: id,
              documentId: id === chunkIdB ? docIdB : docId,
            }),
          ),
      loadEligibleDocumentIds: async (_tenantId, documentIds) =>
        documentIds.filter((id) => id !== docIdB),
      authorization: {
        resolveActor: async () => ({ tenantId, actorId, baseRole: "EMPLOYEE" as const, customRoleId: null, departmentIds: [] }),
        authorizeDocumentAction: async (_ctx: unknown, documentId: string) => {
          authorizeCalls.push(documentId);
          if (documentId === docIdB) throw new Error("denied");
        },
        authorizeDocumentsAction: async () => undefined,
        buildDiscoverPipeline: async () => [],
      } as unknown as DocumentAccessAuthorizationService,
    });
    const tool = toolOf("evaluate_evidence", deps);

    const result = (await tool.handler(agentRunContext(), {
      question: "test",
      candidateIds: [chunkId, chunkIdB, chunkIdC],
    })) as {
      sufficiency: string;
      approvedEvidenceIds: string[];
      rejectedEvidenceIds: string[];
      reasonCode: string;
    };

    assert.equal(result.sufficiency, "SUFFICIENT");
    assert.deepEqual(result.approvedEvidenceIds, [chunkId]);
    assert.deepEqual(result.rejectedEvidenceIds.sort(), [chunkIdB, chunkIdC].sort());
    assert.equal(rerankerCalls.length, 1);
    assert.deepEqual(rerankerCalls[0]!.candidates.map((c) => c.chunkId), [chunkId]);
  });
});

// ── Registration ────────────────────────────────────────────────────────────

describe("authorizedRetrievalTools — registration", () => {
  test("registerAuthorizedRetrievalTools registers all three tools", () => {
    const { deps } = makeDeps();
    const registry = new ToolRegistry();
    registerAuthorizedRetrievalTools(registry, deps);

    const names = registry.list().map((t) => t.schema.name);
    assert.deepEqual(names, [
      "resolve_document_titles",
      "authorized_hybrid_search",
      "evaluate_evidence",
    ]);
  });

  test("ToolRegistry rejects duplicate registration", () => {
    const { deps } = makeDeps();
    const registry = new ToolRegistry();
    registerAuthorizedRetrievalTools(registry, deps);

    assert.throws(() => registerAuthorizedRetrievalTools(registry, deps));
  });

  test("ToolRegistry.execute routes to handler", async () => {
    const { deps } = makeDeps();
    const registry = new ToolRegistry();
    registerAuthorizedRetrievalTools(registry, deps);

    const result = await registry.execute(
      agentRunContext() as never,
      "authorized_hybrid_search",
      { queryText: "test query" },
      async () => true,
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.ok(result.output !== null);
  });
});

// ── Output schema purity ────────────────────────────────────────────────────

describe("authorizedRetrievalTools — output contains no sensitive data", () => {
  const { deps } = makeDeps();
  const tools = createAuthorizedRetrievalTools(deps);

  test("authorized_hybrid_search output has no 'text' or 'textExcerpt' keys", () => {
    const tool = tools.find(
      (t) => t.schema.name === "authorized_hybrid_search",
    )!;
    const json = JSON.stringify(
      (tool.schema.outputSchema as unknown as { shape: unknown }).shape,
    );
    assert.equal(json.includes("text"), false);
    assert.equal(json.includes("textExcerpt"), false);
  });

  test("evaluate_evidence output has no 'text' or 'textExcerpt' keys at top level", () => {
    const tool = tools.find(
      (t) => t.schema.name === "evaluate_evidence",
    )!;
    const json = JSON.stringify(
      (tool.schema.outputSchema as unknown as { shape: unknown }).shape,
    );
    assert.equal(json.includes("text"), false);
    assert.equal(json.includes("textExcerpt"), false);
  });
});
