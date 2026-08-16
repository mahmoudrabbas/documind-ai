import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import type { DocumentChunkDocument } from "../../db/models/documentChunk.model.js";
import type { KeywordAdapter } from "../../providers/embedding/keywordAdapter.js";
import type { VectorStoreAdapter } from "../../providers/embedding/vectorStoreAdapter.js";
import type { RerankerService } from "../reranker/reranker.service.js";
import type { EvidenceBundle } from "../reranker/reranker.types.js";
import { compileAccessFilters, compileQueryFilters, mergeFilters } from "./filterCompiler.js";
import { FusionEngine } from "./fusionEngine.js";
import type { RetrievalRepository } from "./retrieval.repository.js";
import { createRetrievalService } from "./retrieval.service.js";
import type { AccessContext, RetrievalCandidate } from "./retrieval.types.js";
import type { DocumentRetrievalAuthorizationResult } from "../document-access/documentAccess.retrievalAuthorization.js";

const tenantA = "64a000000000000000000001";
const omar = "64a000000000000000000003";
const documentA = "64a000000000000000000005";
const version = "64a000000000000000000007";

function chunk(
  id: string,
  opts: { documentId?: string; classification?: string } = {},
): DocumentChunkDocument {
  return {
    _id: { toString: () => id },
    tenantId: { toString: () => tenantA },
    documentId: { toString: () => opts.documentId ?? documentA },
    documentVersionId: { toString: () => version },
    text: "protected rag value",
    classification: opts.classification ?? "public",
    pageNumber: 1,
    sectionTitle: "Section",
  } as unknown as DocumentChunkDocument;
}

function bundle(candidates: RetrievalCandidate[]): EvidenceBundle {
  return {
    items: candidates.map((candidate, index) => ({
      rank: index + 1,
      candidate,
      scoreBreakdown: {
        fusionScore: candidate.score,
        rerankScore: 0.9,
        semanticScore: 0.9,
        exactTermScore: 0,
        sourceAuthorityScore: 0,
        versionPreferenceScore: 0,
        totalScore: 0.9,
      },
      citationAnchor: {
        chunkId: candidate.chunkId,
        documentId: candidate.documentId,
        documentVersionId: candidate.documentVersionId,
      },
      textExcerpt: candidate.text,
    })),
    totalTokenCount: candidates.length,
    maxTokenCount: 100,
    inputCandidateCount: candidates.length,
    conflictGroups: [],
    sufficiency: {
      level: candidates.length ? "SUFFICIENT" : "NO_EVIDENCE",
      reasons: candidates.length ? [] : ["no evidence"],
    },
    scoreExplanation: "test",
    accessPolicyVersion: "active-query-time",
    createdAt: new Date().toISOString(),
  };
}

function context(actorId = omar, traceId?: string): AccessContext {
  return {
    tenantId: tenantA,
    actorId,
    baseRole: "EMPLOYEE",
    ...(traceId ? { traceId } : {}),
  };
}

interface HarnessOptions {
  raw: { chunkId: string; score: number }[];
  chunks: DocumentChunkDocument[];
  authorizedActors?: string[];
  activeDocumentIds?: string[];
  bundleItems?: (candidates: RetrievalCandidate[]) => EvidenceBundle;
  corpusAuthorization?: {
    mode: "deny_all" | "constrained";
    allowedDocumentIds?: string[];
    denialReason?: string;
  };
}

function harness(options: HarnessOptions) {
  const authorizationContexts: AccessContext[] = [];
  const rerankerInputs: RetrievalCandidate[][] = [];
  const authorizedActors = new Set(options.authorizedActors ?? [omar]);
  const activeDocumentIds = new Set(options.activeDocumentIds ?? [documentA]);
  const searchFilters: unknown[][] = [];
  const vectorAdapter = {
    providerKey: "test-vector",
    search: async (request: { filter?: unknown }) => {
      searchFilters.push([request.filter]);
      return options.raw;
    },
  } as unknown as VectorStoreAdapter;
  const keywordAdapter = {
    providerKey: "test-keyword",
    search: async (request: { filter?: unknown }) => {
      searchFilters.push([request.filter]);
      return options.raw;
    },
  } as unknown as KeywordAdapter;  const repository = {
    findChunksByIds: async (tenant: string, ids: string[]) =>
      options.chunks.filter(
        (item) =>
          item.tenantId.toString() === tenant && ids.includes(item._id.toString()),
      ),
  } as unknown as RetrievalRepository;
  const rerankerService = {
    buildEvidenceBundle: async (candidates: RetrievalCandidate[]) => {
      rerankerInputs.push(candidates);
      return (options.bundleItems ?? bundle)(candidates);
    },
  } as RerankerService;
  const service = createRetrievalService({
    vectorAdapter,
    keywordAdapter,
    embeddingAdapter: {
      embed: async () => ({ vectors: [[1, 0]], usage: { totalTokens: 1 } }),
    } as never,
    fusionEngine: new FusionEngine(),
    filterCompiler: { compileAccessFilters, compileQueryFilters, mergeFilters },
    repository,
    rerankerService,
    resolveAccessContext: async (input) => ({
      ...input,
      requiredAction: "use_in_ai" as const,
    }),
    findActiveDocumentIds: async (_tenantId: string, ids: string[]) =>
      ids.filter((id) => activeDocumentIds.has(id)),
    ...(options.corpusAuthorization
      ? {
          resolveRetrievalAuthorization: async (): Promise<DocumentRetrievalAuthorizationResult> => ({
            filter: {
              schemaVersion: 1,
              evaluationContractVersion: 1,
              tenantId: tenantA,
              actorId: omar,
              action: "use_in_ai" as const,
              mode: options.corpusAuthorization!.mode,
              failClosed: true as const,
              requiresCurrentPolicyRevalidation: true as const,
              allowedDocumentIds: options.corpusAuthorization!.allowedDocumentIds ?? [],
              deniedDocumentIds: [],
              allowedOwnerIds: [],
              allowedCategoryIds: [],
              allowedDepartmentIds: [],
              allowedClassifications: [],
              policyVersions: [],
            },
            ...(options.corpusAuthorization!.denialReason
              ? {
                  denialReason: options.corpusAuthorization!.denialReason as DocumentRetrievalAuthorizationResult["denialReason"],
                }
              : {}),
            resolvedDocumentCount: 0,
          }),
        }
      : {}),
    authorizeDocumentForAi: async (input, documentId) => {
      authorizationContexts.push(input);
      if (
        !authorizedActors.has(input.actorId) ||
        documentId !== documentA
      ) {
        throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
      }
    },
  });
  return { service, authorizationContexts, rerankerInputs, searchFilters };
}

describe("retrieval diagnostics typed outcomes", () => {
  test("uses the trusted request traceId instead of generating a new one", async () => {
    const { service } = harness({
      raw: [{ chunkId: "chunk-a", score: 0.9 }],
      chunks: [chunk("chunk-a")],
    });
    const trustedTraceId = "0197b2c0-0000-7000-8000-000000000001";
    const result = await service.hybridSearch(
      { queryText: "leave policy", topK: 5 },
      context(omar, trustedTraceId),
    );
    assert.equal(result.diagnostics.traceId, trustedTraceId);
  });

  test("reports AUTHORIZED_RESULTS with evidence counts when content is returned", async () => {
    const { service } = harness({
      raw: [{ chunkId: "chunk-a", score: 0.9 }],
      chunks: [chunk("chunk-a")],
    });
    const result = await service.hybridSearch(
      { queryText: "leave policy", topK: 5 },
      context(),
    );
    assert.equal(result.diagnostics.retrievalOutcome, "AUTHORIZED_RESULTS");
    assert.equal(result.diagnostics.approvedEvidenceCount, 1);
    assert.equal(result.diagnostics.rejectedEvidenceCount, 0);
    assert.equal(result.diagnostics.authorizationRestricted, false);
  });

  test("reports NO_SEARCH_MATCHES when both backends return nothing", async () => {
    const { service } = harness({ raw: [], chunks: [] });
    const result = await service.hybridSearch(
      { queryText: "leave policy", topK: 5 },
      context(),
    );
    assert.equal(result.diagnostics.retrievalOutcome, "NO_SEARCH_MATCHES");
    assert.equal(result.diagnostics.zeroCandidateReason, "NO_RAW_SEARCH_RESULTS");
  });

  test("reports NO_AUTHORIZED_DOCUMENTS when raw candidates existed but authorization denied all", async () => {
    const { service } = harness({
      raw: [{ chunkId: "chunk-a", score: 0.9 }],
      chunks: [chunk("chunk-a")],
      authorizedActors: [],
    });
    const result = await service.hybridSearch(
      { queryText: "leave policy", topK: 5 },
      context(),
    );
    assert.equal(result.diagnostics.retrievalOutcome, "NO_AUTHORIZED_DOCUMENTS");
    assert.equal(result.diagnostics.authorizationRestricted, true);
  });

  test("reports NO_RETRIEVABLE_CONTENT when authorized candidates exist but hydration removes them", async () => {
    const { service } = harness({
      raw: [{ chunkId: "chunk-a", score: 0.9 }],
      chunks: [chunk("chunk-a")],
      activeDocumentIds: [],
    });
    const result = await service.hybridSearch(
      { queryText: "leave policy", topK: 5 },
      context(),
    );
    assert.equal(result.diagnostics.retrievalOutcome, "NO_RETRIEVABLE_CONTENT");
  });

  test("deny_all corpus returns a typed fail-closed result without searching", async () => {
    const { service, searchFilters } = harness({
      raw: [{ chunkId: "chunk-a", score: 0.9 }],
      chunks: [chunk("chunk-a")],
      corpusAuthorization: {
        mode: "deny_all",
        denialReason: "PERMISSION_REQUIRED",
      },
    });
    const result = await service.hybridSearch(
      { queryText: "leave policy", topK: 5 },
      context(),
    );
    assert.equal(result.totalCandidates, 0);
    assert.equal(result.diagnostics.retrievalOutcome, "NO_AUTHORIZED_DOCUMENTS");
    assert.equal(result.diagnostics.zeroCandidateReason, "PERMISSION_REQUIRED");
    assert.equal(result.diagnostics.authorizationRestricted, true);
    assert.equal(searchFilters.length, 0);
  });

  test("constrained corpus prefilters search by authorized document ids and ignores chunk metadata scopes", async () => {
    const { service, searchFilters } = harness({
      raw: [{ chunkId: "chunk-a", score: 0.9 }],
      chunks: [chunk("chunk-a", { classification: "confidential" })],
      corpusAuthorization: {
        mode: "constrained",
        allowedDocumentIds: [documentA],
      },
    });
    const result = await service.hybridSearch(
      { queryText: "leave policy", topK: 5 },
      context(),
    );
    // An EMPLOYEE reaching a confidential document through an explicit policy
    // grant must not be blocked by the base-role classification ceiling.
    assert.equal(result.diagnostics.retrievalOutcome, "AUTHORIZED_RESULTS");
    assert.ok(searchFilters.length > 0);
    for (const [filter] of searchFilters) {
      assert.deepEqual((filter as { documentIds?: string[] }).documentIds, [documentA]);
      assert.equal((filter as { classification?: unknown }).classification, undefined);
      assert.equal((filter as { department?: unknown }).department, undefined);
      assert.equal((filter as { category?: unknown }).category, undefined);
    }
  });

  test("user-requested document filters only narrow the authorized corpus", async () => {
    const other = "64a0000000000000000000ab";
    const { service, searchFilters } = harness({
      raw: [],
      chunks: [],
      corpusAuthorization: {
        mode: "constrained",
        allowedDocumentIds: [documentA, other],
      },
    });
    await service.hybridSearch(
      { queryText: "leave policy", topK: 5, filter: { documentIds: [other] } },
      context(),
    );
    for (const [filter] of searchFilters) {
      assert.deepEqual((filter as { documentIds?: string[] }).documentIds, [other]);
    }
  });

  test("large authorized corpora are searched in batches of at most 500 without truncation", async () => {
    const allowedDocumentIds = Array.from(
      { length: 501 },
      (_, index) =>
        `64a000000000000000000${String(index).padStart(3, "0")}`,
    );
    const { service, searchFilters } = harness({
      raw: [],
      chunks: [],
      corpusAuthorization: { mode: "constrained", allowedDocumentIds },
    });
    await service.hybridSearch({ queryText: "leave policy", topK: 5 }, context());
    const batches = searchFilters
      .map(([filter]) => (filter as { documentIds?: string[] }).documentIds ?? [])
      .filter((ids) => ids.length > 0);
    assert.ok(batches.length >= 2);
    for (const ids of batches) {
      assert.ok(ids.length <= 500);
    }
    const union = new Set(batches.flat());
    assert.equal(union.size, 501);
  });
});
