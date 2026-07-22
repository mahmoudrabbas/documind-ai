import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRetrievalService, type RetrievalServiceDeps, type HybridRetrievalService } from "./retrieval.service.js";
import { createRetrievalRepository, type RetrievalRepository } from "./retrieval.repository.js";
import { compileAccessFilters, mergeFilters, compileQueryFilters } from "./filterCompiler.js";
import { FusionEngine } from "./fusionEngine.js";
import type { AccessContext, RetrievalQuery, RetrievalResult } from "./retrieval.types.js";
import type { AdapterFilter } from "../../providers/embedding/adapterFilter.types.js";
import type { VectorStoreAdapter } from "../../providers/embedding/vectorStoreAdapter.js";
import type { KeywordAdapter } from "../../providers/embedding/keywordAdapter.js";
import type { EmbeddingAdapter } from "../agents/agents.types.js";
import type { DocumentChunkDocument } from "../../db/models/documentChunk.model.js";

// ---------------------------------------------------------------------------
// Mock adapters
// ---------------------------------------------------------------------------

function createMockVectorAdapter(results: { chunkId: string; score: number }[]): VectorStoreAdapter {
  return {
    search: async (_opts: { vector: number[]; topK: number; filter?: AdapterFilter }) => results,
    deleteVectors: async () => {},
    getVectorCount: async () => results.length,
  } as unknown as VectorStoreAdapter;
}

function createMockKeywordAdapter(results: { chunkId: string; score: number }[]): KeywordAdapter {
  return {
    search: async (_opts: { queryText: string; topK: number; filter?: AdapterFilter }) => results,
    indexDocuments: async () => {},
    removeDocuments: async () => {},
  } as unknown as KeywordAdapter;
}

function createMockEmbeddingAdapter(vectors: number[][] = [[0.1, 0.2, 0.3]]): EmbeddingAdapter {
  return {
    embed: async () => ({ vectors, usage: { totalTokens: 10 } }),
    embedSingle: async () => ({ vector: vectors[0], usage: { totalTokens: 5 } }),
    isReady: async () => true,
    getProviderName: () => "mock",
  } as unknown as EmbeddingAdapter;
}

function createMockRepository(chunks: DocumentChunkDocument[]): RetrievalRepository {
  return {
    findChunksByFilter: async () => chunks,
    countChunksByFilter: async () => chunks.length,
    findChunksByIds: async (_tenantId: string, ids: string[]) =>
      chunks.filter((c) => ids.includes(c._id.toString())),
    getDocumentVersionFilter: async () => ({}),
  } as unknown as RetrievalRepository;
}

function makeChunk(overrides: Partial<Record<string, unknown>> = {}): DocumentChunkDocument {
  const id = (overrides._id as string) ?? "chunk1";
  return {
    _id: { toString: () => id } as unknown,
    tenantId: { toString: () => "t1" } as unknown,
    documentId: { toString: () => "doc1" } as unknown,
    documentVersionId: { toString: () => "ver1" } as unknown,
    text: "Sample chunk text",
    classification: "public",
    allowAiUse: true,
    pageNumber: 1,
    sectionTitle: "Section 1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as DocumentChunkDocument;
}

function makeAccessContext(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    tenantId: "t1",
    actorId: "actor1",
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
    queryText: "What is the policy on remote work?",
    topK: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("Phase 4 — createRetrievalService", () => {
  function buildDeps(overrides: Partial<RetrievalServiceDeps> = {}): RetrievalServiceDeps {
    return {
      vectorAdapter: createMockVectorAdapter([
        { chunkId: "chunk1", score: 0.9 },
        { chunkId: "chunk2", score: 0.8 },
      ]),
      keywordAdapter: createMockKeywordAdapter([
        { chunkId: "chunk1", score: 0.7 },
        { chunkId: "chunk3", score: 0.6 },
      ]),
      embeddingAdapter: createMockEmbeddingAdapter(),
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
      repository: createMockRepository([
        makeChunk({ _id: "chunk1", text: "Remote work policy content", classification: "public" }),
        makeChunk({ _id: "chunk2", text: "Second chunk", classification: "internal" }),
        makeChunk({ _id: "chunk3", text: "Third chunk", classification: "public" }),
      ]),
      ...overrides,
    };
  }

  it("hybridSearch returns candidates from both backends", async () => {
    const service = createRetrievalService(buildDeps());
    const result = await service.hybridSearch(makeQuery(), makeAccessContext());

    assert.ok(Array.isArray(result.candidates), "candidates is array");
    assert.ok(result.totalCandidates >= 1, "has at least 1 candidate");
    assert.ok(typeof result.diagnostics.traceId === "string", "traceId is string");
    assert.equal(result.filterSummary.tenantFilter, true, "tenantFilter is true");
  });

  it("hybridSearch returns candidates with hydrated fields", async () => {
    const service = createRetrievalService(buildDeps());
    const result = await service.hybridSearch(makeQuery(), makeAccessContext());
    const first = result.candidates[0];

    assert.ok(first.chunkId, "candidate has chunkId");
    assert.ok(first.documentId, "candidate has documentId");
    assert.ok(first.text, "candidate has text");
    assert.ok(first.score >= 0, "candidate has score >= 0");
  });

  it("hybridSearch filters out chunks with allowAiUse=false", async () => {
    const repo = createMockRepository([
      makeChunk({ _id: "chunk1", allowAiUse: true }),
      makeChunk({ _id: "chunk2", allowAiUse: false }),
    ]);

    const service = createRetrievalService(
      buildDeps({
        repository: repo,
        vectorAdapter: createMockVectorAdapter([
          { chunkId: "chunk1", score: 0.9 },
          { chunkId: "chunk2", score: 0.8 },
        ]),
        keywordAdapter: createMockKeywordAdapter([
          { chunkId: "chunk1", score: 0.7 },
          { chunkId: "chunk2", score: 0.6 },
        ]),
      }),
    );

    const result = await service.hybridSearch(makeQuery(), makeAccessContext());
    const chunkIds = result.candidates.map((c) => c.chunkId);
    assert.ok(!chunkIds.includes("chunk2"), "chunk2 (allowAiUse=false) excluded");
  });

  it("vectorSearch works with only vector backend", async () => {
    const service = createRetrievalService(buildDeps());
    const result = await service.vectorSearch(makeQuery(), makeAccessContext());

    assert.ok(result.candidates.length >= 1, "has candidates");
    assert.equal(result.diagnostics.keywordCandidateCount, 0, "keyword count is 0");
  });

  it("keywordSearch works with only keyword backend", async () => {
    const service = createRetrievalService(buildDeps());
    const result = await service.keywordSearch(makeQuery(), makeAccessContext());

    assert.ok(result.candidates.length >= 1, "has candidates");
    assert.equal(result.diagnostics.vectorCandidateCount, 0, "vector count is 0");
  });

  it("hybridSearch throws RETRIEVAL_UNAVAILABLE when both backends fail", async () => {
    const failingVector = {
      search: async () => { throw new Error("vector down"); },
      deleteVectors: async () => {},
      getVectorCount: async () => 0,
    } as unknown as VectorStoreAdapter;

    const failingKeyword = {
      search: async () => { throw new Error("keyword down"); },
      indexDocuments: async () => {},
      removeDocuments: async () => {},
    } as unknown as KeywordAdapter;

    const service = createRetrievalService(
      buildDeps({
        vectorAdapter: failingVector,
        keywordAdapter: failingKeyword,
      }),
    );

    await assert.rejects(
      () => service.hybridSearch(makeQuery(), makeAccessContext()),
      (err: Error) => {
        assert.ok(err.message.includes("RETRIEVAL_UNAVAILABLE") || err.message.includes("unavailable"));
        return true;
      },
    );
  });

  it("validateQuery rejects empty queryText", async () => {
    const service = createRetrievalService(buildDeps());

    await assert.rejects(
      () => service.hybridSearch(makeQuery({ queryText: "" }), makeAccessContext()),
      (err: Error) => {
        assert.ok(err.message.includes("queryText"), "mentions queryText");
        return true;
      },
    );
  });

  it("validateQuery rejects topK=0", async () => {
    const service = createRetrievalService(buildDeps());

    await assert.rejects(
      () => service.hybridSearch(makeQuery({ topK: 0 }), makeAccessContext()),
      (err: Error) => {
        assert.ok(err.message.includes("topK"), "mentions topK");
        return true;
      },
    );
  });

  it("validateQuery rejects topK=200 (exceeds max)", async () => {
    const service = createRetrievalService(buildDeps());

    await assert.rejects(
      () => service.hybridSearch(makeQuery({ topK: 200 }), makeAccessContext()),
      (err: Error) => {
        assert.ok(err.message.includes("topK"), "mentions topK");
        return true;
      },
    );
  });

  it("filterSummary includes correct permission scope keys", async () => {
    const ctx = makeAccessContext({
      permissionScopes: {
        selfOnly: true,
        departmentIds: ["d1"],
        documentCategories: ["hr"],
        documentClassifications: [],
      },
    });

    const service = createRetrievalService(buildDeps());
    const result = await service.hybridSearch(makeQuery(), ctx);

    assert.ok(result.filterSummary.permissionScopes.includes("selfOnly"), "has selfOnly");
    assert.ok(result.filterSummary.permissionScopes.includes("departmentIds"), "has departmentIds");
    assert.ok(result.filterSummary.permissionScopes.includes("documentCategories"), "has documentCategories");
  });

  it("diagnostics includes traceId", async () => {
    const service = createRetrievalService(buildDeps());
    const result = await service.hybridSearch(makeQuery(), makeAccessContext());

    assert.ok(typeof result.diagnostics.traceId === "string", "traceId is string");
    assert.ok(result.diagnostics.traceId.length > 0, "traceId is not empty");
    assert.ok(typeof result.diagnostics.totalLatencyMs === "number", "totalLatencyMs is number");
  });

  it("hybridSearch gracefully handles one backend failing", async () => {
    const failingVector = {
      search: async () => { throw new Error("vector down"); },
      deleteVectors: async () => {},
      getVectorCount: async () => 0,
    } as unknown as VectorStoreAdapter;

    const service = createRetrievalService(
      buildDeps({ vectorAdapter: failingVector }),
    );

    const result = await service.hybridSearch(makeQuery(), makeAccessContext());
    assert.ok(result.candidates.length >= 1, "still has candidates from keyword");
  });

  it("keywordSearch throws when keyword backend fails", async () => {
    const failingKeyword = {
      search: async () => { throw new Error("keyword down"); },
      indexDocuments: async () => {},
      removeDocuments: async () => {},
    } as unknown as KeywordAdapter;

    const service = createRetrievalService(
      buildDeps({ keywordAdapter: failingKeyword }),
    );

    await assert.rejects(
      () => service.keywordSearch(makeQuery(), makeAccessContext()),
      (err: Error) => {
        assert.ok(err.message.includes("RETRIEVAL_UNAVAILABLE") || err.message.includes("unavailable"));
        return true;
      },
    );
  });

  it("vectorSearch throws when vector backend fails", async () => {
    const failingVector = {
      search: async () => { throw new Error("vector down"); },
      deleteVectors: async () => {},
      getVectorCount: async () => 0,
    } as unknown as VectorStoreAdapter;

    const service = createRetrievalService(
      buildDeps({ vectorAdapter: failingVector }),
    );

    await assert.rejects(
      () => service.vectorSearch(makeQuery(), makeAccessContext()),
      (err: Error) => {
        assert.ok(err.message.includes("RETRIEVAL_UNAVAILABLE") || err.message.includes("unavailable"));
        return true;
      },
    );
  });
});

describe("Phase 4 — createRetrievalRepository", () => {
  it("returns object with expected methods", () => {
    const repo = createRetrievalRepository();
    assert.equal(typeof repo.findChunksByFilter, "function");
    assert.equal(typeof repo.countChunksByFilter, "function");
    assert.equal(typeof repo.findChunksByIds, "function");
    assert.equal(typeof repo.getDocumentVersionFilter, "function");
  });
});
