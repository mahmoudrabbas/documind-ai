import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRetrievalService, type RetrievalServiceDeps } from "./retrieval.service.js";
import type { RetrievalRepository } from "./retrieval.repository.js";
import { compileAccessFilters, mergeFilters, compileQueryFilters } from "./filterCompiler.js";
import { FusionEngine } from "./fusionEngine.js";
import type { AccessContext, RetrievalQuery } from "./retrieval.types.js";
import type { AdapterFilter } from "../../providers/embedding/adapterFilter.types.js";
import type { VectorStoreAdapter } from "../../providers/embedding/vectorStoreAdapter.js";
import type { KeywordAdapter } from "../../providers/embedding/keywordAdapter.js";
import type { EmbeddingAdapter } from "../agents/agents.types.js";
import type { DocumentChunkDocument } from "../../db/models/documentChunk.model.js";

const VALID_IDS = {
  doc1: "64a1b2c3d4e5f6a7b8c9d0f1",
  doc2: "64a1b2c3d4e5f6a7b8c9d0f2",
  ver1: "64a1b2c3d4e5f6a7b8c9d0a1",
  tenant1: "64a1b2c3d4e5f6a7b8c90001",
  actor1: "64a1b2c3d4e5f6a7b8c90002",
};

interface VectorCall {
  vector: number[];
  topK: number;
  filter?: AdapterFilter;
}

interface KeywordCall {
  queryText: string;
  topK: number;
  filter?: AdapterFilter;
}

function createRecordingVectorAdapter(
  responder: (call: VectorCall) => { chunkId: string; score: number }[],
): VectorStoreAdapter & { calls: VectorCall[] } {
  const calls: VectorCall[] = [];
  return {
    calls,
    search: async (opts: VectorCall) => {
      calls.push(opts);
      return responder(opts);
    },
    deleteVectors: async () => {},
    getVectorCount: async () => 0,
  } as unknown as VectorStoreAdapter & { calls: VectorCall[] };
}

function createRecordingKeywordAdapter(
  responder: (call: KeywordCall) => { chunkId: string; score: number }[],
): KeywordAdapter & { calls: KeywordCall[] } {
  const calls: KeywordCall[] = [];
  return {
    calls,
    search: async (opts: KeywordCall) => {
      calls.push(opts);
      return responder(opts);
    },
    indexDocuments: async () => {},
    removeDocuments: async () => {},
  } as unknown as KeywordAdapter & { calls: KeywordCall[] };
}

function createEmbeddingSequence(vectors: number[][]): EmbeddingAdapter {
  let i = 0;
  return {
    embed: async ({ inputs }: { inputs: string[] }) => ({
      vectors: inputs.map(() => vectors[i++] ?? vectors[vectors.length - 1]!),
      usage: { totalTokens: 10 },
    }),
    embedSingle: async () => ({ vector: [0.1, 0.2, 0.3], usage: { totalTokens: 5 } }),
    isReady: async () => true,
    getProviderName: () => "mock",
  } as unknown as EmbeddingAdapter;
}

function makeChunk(id: string, documentId: string, overrides: Partial<Record<string, unknown>> = {}): DocumentChunkDocument {
  return {
    _id: { toString: () => id } as unknown,
    tenantId: { toString: () => VALID_IDS.tenant1 } as unknown,
    documentId: { toString: () => documentId } as unknown,
    documentVersionId: { toString: () => VALID_IDS.ver1 } as unknown,
    text: `Text for ${id}`,
    classification: "public",
    allowAiUse: true,
    pageNumber: 1,
    sectionTitle: "Section 1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as DocumentChunkDocument;
}

function makeMockRepository(chunks: DocumentChunkDocument[]): RetrievalRepository {
  return {
    findChunksByFilter: async () => chunks,
    countChunksByFilter: async () => chunks.length,
    findChunksByIds: async (_tenantId: string, ids: string[]) =>
      chunks.filter((c) => ids.includes(c._id.toString())),
    getDocumentVersionFilter: async () => ({}),
  } as unknown as RetrievalRepository;
}

function makeAccessContext(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    tenantId: VALID_IDS.tenant1,
    actorId: VALID_IDS.actor1,
    baseRole: "EMPLOYEE",
    permissionScopes: {
      selfOnly: false,
      departmentIds: [],
      documentCategories: [],
      documentClassifications: [],
    },
    ...overrides,
  };
}

function makeQuery(overrides: Partial<RetrievalQuery> = {}): RetrievalQuery {
  return {
    queryText: "what is the remote work policy",
    topK: 10,
    ...overrides,
  };
}

function buildDeps(
  chunks: DocumentChunkDocument[],
  overrides: Partial<RetrievalServiceDeps> = {},
): RetrievalServiceDeps {
  return {
    vectorAdapter: createRecordingVectorAdapter(() => []),
    keywordAdapter: createRecordingKeywordAdapter(() => []),
    embeddingAdapter: createEmbeddingSequence([[0.1, 0.2, 0.3]]),
    fusionEngine: new FusionEngine({
      strategies: [
        { method: "vector", weight: 0.6 },
        { method: "keyword", weight: 0.4 },
      ],
      rrfK: 60,
      maxCandidates: 20,
    }),
    filterCompiler: {
      compileAccessFilters,
      compileQueryFilters,
      mergeFilters,
    },
    repository: makeMockRepository(chunks),
    findOwnedDocumentIds: async (_tenantId, _actorId, docIds) => docIds,
    resolveAccessContext: async (context) => ({ ...context, requiredAction: "use_in_ai" }),
    authorizeDocumentForAi: async () => {},
    ...overrides,
  };
}

describe("RetrievalService - multi-variant queries", () => {
  it("embeds and searches each semantic variant, keeping the best per-chunk score", async () => {
    const chunks = [
      makeChunk("chunkA", VALID_IDS.doc1),
      makeChunk("chunkB", VALID_IDS.doc2),
    ];
    const vectorAdapter = createRecordingVectorAdapter((call) => {
      if (call.vector[0] === 0.5) return [{ chunkId: "chunkA", score: 0.5 }];
      return [{ chunkId: "chunkB", score: 0.9 }];
    });

    const service = createRetrievalService(
      buildDeps(chunks, {
        vectorAdapter,
        embeddingAdapter: createEmbeddingSequence([[0.5, 0, 0], [0.7, 0, 0]]),
      }),
    );

    const result = await service.hybridSearch(
      makeQuery({ queryVariants: ["ترجمة الاستعلام"] }),
      makeAccessContext(),
    );

    assert.equal(vectorAdapter.calls.length, 2, "primary + one variant searched");
    const scores = Object.fromEntries(result.candidates.map((c) => [c.chunkId, c.score]));
    assert.ok(scores["chunkA"]! > 0, "chunkA present");
    assert.ok(scores["chunkB"]! >= 0.9, "best variant score retained for chunkB");
  });

  it("deduplicates the same chunk surfaced by multiple variants", async () => {
    const chunks = [makeChunk("chunkA", VALID_IDS.doc1)];
    const vectorAdapter = createRecordingVectorAdapter(() => [
      { chunkId: "chunkA", score: 0.4 },
    ]);

    const service = createRetrievalService(
      buildDeps(chunks, {
        vectorAdapter,
        embeddingAdapter: createEmbeddingSequence([[0.5, 0, 0], [0.7, 0, 0], [0.9, 0, 0]]),
      }),
    );

    const result = await service.hybridSearch(
      makeQuery({ queryVariants: ["variante uno", "variante dos"] }),
      makeAccessContext(),
    );

    assert.equal(vectorAdapter.calls.length, 3, "primary + 2 variants searched");
    assert.equal(result.candidates.length, 1, "chunk appears exactly once");
    assert.ok(result.candidates[0]!.score >= 0.4, "best score kept");
  });

  it("searches each keyword variant and keeps the best per-chunk score", async () => {
    const chunks = [makeChunk("chunkK", VALID_IDS.doc1)];
    const keywordAdapter = createRecordingKeywordAdapter((call) => {
      if (call.queryText === "what is the remote work policy") {
        return [{ chunkId: "chunkK", score: 0.3 }];
      }
      return [{ chunkId: "chunkK", score: 0.8 }];
    });

    const service = createRetrievalService(
      buildDeps(chunks, { keywordAdapter }),
    );

    const result = await service.hybridSearch(
      makeQuery({ keywordTexts: ["سياسة العمل عن بعد"] }),
      makeAccessContext(),
    );

    assert.equal(keywordAdapter.calls.length, 2, "primary + one keyword variant searched");
    assert.equal(result.candidates.length, 1);
    assert.ok(result.candidates[0]!.score >= 0.8, "best keyword score retained");
  });

  it("caps the number of semantic variants at three", async () => {
    const vectorAdapter = createRecordingVectorAdapter(() => []);
    const service = createRetrievalService(
      buildDeps([], { vectorAdapter }),
    );

    await service.hybridSearch(
      makeQuery({ queryVariants: ["v1", "v2", "v3", "v4", "v5"] }),
      makeAccessContext(),
    );

    assert.equal(
      vectorAdapter.calls.filter((call) => call.filter?.classification).length,
      3,
      "authorized execution remains capped at 3 total texts",
    );
    assert.equal(vectorAdapter.calls.length, 6, "a zero-result scope probe repeats the bounded set");
  });

  it("preserves the canonical query and balances exact and generated keyword plans", async () => {
    const keywordAdapter = createRecordingKeywordAdapter(() => []);
    const service = createRetrievalService(
      buildDeps([], { keywordAdapter }),
    );

    await service.hybridSearch(
      makeQuery({
        exactTerms: ["P1", "$25"],
        keywordTexts: ["remote work policy"],
        filter: { documentIds: [VALID_IDS.doc1] },
      }),
      makeAccessContext(),
    );

    const scopedCalls = keywordAdapter.calls.filter((call) => call.filter?.classification);
    assert.deepEqual(
      scopedCalls.map((call) => call.queryText),
      ["what is the remote work policy", "$25", "remote work policy"],
    );
    assert.ok(scopedCalls.every((call) =>
      call.filter?.documentIds?.includes(VALID_IDS.doc1)
    ));
    assert.equal(keywordAdapter.calls.length, 6, "a zero-result scope probe repeats the bounded set");
  });

  it("selects diverse high-precision anchors deterministically when only exact terms exist", async () => {
    const keywordAdapter = createRecordingKeywordAdapter(() => []);
    const service = createRetrievalService(buildDeps([], { keywordAdapter }));

    await service.hybridSearch(
      makeQuery({ exactTerms: ["$25", "90 days", "P1", "30 minutes", "MFA", "VPN"] }),
      makeAccessContext(),
    );

    assert.deepEqual(
      keywordAdapter.calls
        .filter((call) => call.filter?.classification)
        .map((call) => call.queryText),
      ["what is the remote work policy", "$25", "P1"],
    );
  });

  it("keeps exact-term representation when many generated keyword plans exist", async () => {
    const keywordAdapter = createRecordingKeywordAdapter(() => []);
    const service = createRetrievalService(buildDeps([], { keywordAdapter }));

    await service.hybridSearch(
      makeQuery({
        exactTerms: ["$25"],
        keywordTexts: [
          "hybrid schedule",
          "remote work policy",
          "company-wide flexible remote work eligibility policy",
        ],
      }),
      makeAccessContext(),
    );

    assert.deepEqual(
      keywordAdapter.calls
        .filter((call) => call.filter?.classification)
        .map((call) => call.queryText),
      [
        "what is the remote work policy",
        "$25",
        "company-wide flexible remote work eligibility policy",
      ],
    );
  });

  it("deduplicates lexical plans case-insensitively and ignores empty or malformed entries", async () => {
    const keywordAdapter = createRecordingKeywordAdapter(() => []);
    const service = createRetrievalService(buildDeps([], { keywordAdapter }));

    await service.hybridSearch(
      makeQuery({
        exactTerms: [" MFA ", "mfa", "", 42 as unknown as string],
        keywordTexts: [
          "MFA",
          " WHAT IS THE REMOTE WORK POLICY ",
          " remote work policy ",
          "REMOTE WORK POLICY",
          "   ",
        ],
      }),
      makeAccessContext(),
    );

    assert.deepEqual(
      keywordAdapter.calls
        .filter((call) => call.filter?.classification)
        .map((call) => call.queryText),
      ["what is the remote work policy", "MFA", "remote work policy"],
    );
  });

  it("does not let a selected exact anchor bypass document authorization", async () => {
    const hidden = makeChunk("hidden-chunk", VALID_IDS.doc1);
    const keywordAdapter = createRecordingKeywordAdapter((call) =>
      call.queryText === "$25" ? [{ chunkId: "hidden-chunk", score: 0.9 }] : []
    );
    const service = createRetrievalService(buildDeps([hidden], {
      keywordAdapter,
      authorizeDocumentForAi: async () => {
        throw new Error("denied");
      },
    }));

    const result = await service.hybridSearch(
      makeQuery({ exactTerms: ["$25"], keywordTexts: ["remote work policy"] }),
      makeAccessContext(),
    );

    assert.deepEqual(result.candidates, []);
    assert.equal(result.diagnostics.authorizationFiltered, true);
  });
});

describe("RetrievalService - authorization provenance", () => {
  for (const scope of ["department", "category", "classification"] as const) {
    it(`detects ${scope} scope filtering without exposing candidates`, async () => {
      const hidden = makeChunk("hidden-chunk", VALID_IDS.doc1, {
        classification: "confidential",
        department: "Executive",
        category: "Compensation",
      });
      const vectorAdapter = createRecordingVectorAdapter((call) =>
        call.filter?.[scope] ? [] : [{ chunkId: "hidden-chunk", score: 0.9 }]
      );
      const keywordAdapter = createRecordingKeywordAdapter((call) =>
        call.filter?.[scope] ? [] : [{ chunkId: "hidden-chunk", score: 0.9 }]
      );
      const contextOverrides: Partial<AccessContext> = scope === "department"
        ? { resolvedDepartmentFilter: ["HR"] }
        : scope === "category"
          ? { resolvedCategoryFilter: ["Policies"] }
          : { permissionScopes: {
              selfOnly: false,
              departmentIds: [],
              documentCategories: [],
              documentClassifications: ["public"],
            } };
      const service = createRetrievalService(buildDeps([hidden], {
        vectorAdapter,
        keywordAdapter,
        findActiveDocumentIds: async () => [VALID_IDS.doc1],
      }));

      const result = await service.hybridSearch(
        makeQuery(),
        makeAccessContext(contextOverrides),
      );

      assert.deepEqual(result.candidates, []);
      assert.equal(result.diagnostics.authorizationFiltered, true);
    });
  }

  it("detects self-only filtering after candidate retrieval", async () => {
    const hidden = makeChunk("hidden-chunk", VALID_IDS.doc1);
    const candidates = [{ chunkId: "hidden-chunk", score: 0.9 }];
    const service = createRetrievalService(buildDeps([hidden], {
      vectorAdapter: createRecordingVectorAdapter(() => candidates),
      keywordAdapter: createRecordingKeywordAdapter(() => candidates),
      findActiveDocumentIds: async () => [VALID_IDS.doc1],
      findOwnedDocumentIds: async () => [],
    }));

    const result = await service.hybridSearch(
      makeQuery(),
      makeAccessContext({
        permissionScopes: {
          selfOnly: true,
          departmentIds: [],
          documentCategories: [],
          documentClassifications: [],
        },
      }),
    );

    assert.deepEqual(result.candidates, []);
    assert.equal(result.diagnostics.authorizationFiltered, true);
  });

  it("does not let a cross-tenant probe candidate affect authorization provenance", async () => {
    const foreignChunk = makeChunk("foreign-chunk", VALID_IDS.doc2, {
      tenantId: { toString: () => "64a1b2c3d4e5f6a7b8c90009" },
    });
    const vectorAdapter = createRecordingVectorAdapter((call) =>
      call.filter?.classification ? [] : [{ chunkId: "foreign-chunk", score: 0.9 }]
    );
    const service = createRetrievalService(buildDeps([], {
      vectorAdapter,
      keywordAdapter: createRecordingKeywordAdapter(() => []),
      repository: {
        findChunksByIds: async (tenantId: string, ids: string[]) =>
          foreignChunk.tenantId.toString() === tenantId && ids.includes("foreign-chunk")
            ? [foreignChunk]
            : [],
      } as unknown as RetrievalRepository,
    }));

    const result = await service.hybridSearch(makeQuery(), makeAccessContext());

    assert.deepEqual(result.candidates, []);
    assert.equal(result.diagnostics.authorizationFiltered, false);
  });
});
