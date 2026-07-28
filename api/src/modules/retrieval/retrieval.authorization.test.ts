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

const tenantA = "64a000000000000000000001";
const tenantB = "64a000000000000000000002";
const omar = "64a000000000000000000003";
const sara = "64a000000000000000000004";
const documentA = "64a000000000000000000005";
const documentB = "64a000000000000000000006";
const version = "64a000000000000000000007";

function chunk(id: string, tenantId = tenantA, documentId = documentA, allowAiUse = true): DocumentChunkDocument {
  return { _id: { toString: () => id }, tenantId: { toString: () => tenantId }, documentId: { toString: () => documentId }, documentVersionId: { toString: () => version }, text: "protected rag value", classification: "public", allowAiUse, pageNumber: 1, sectionTitle: "Secret" } as unknown as DocumentChunkDocument;
}

function context(actorId = omar): AccessContext {
  return { tenantId: tenantA, actorId, baseRole: "EMPLOYEE" };
}

function bundle(candidates: RetrievalCandidate[]): EvidenceBundle {
  return { items: candidates.map((candidate, index) => ({ rank: index + 1, candidate, scoreBreakdown: { fusionScore: candidate.score, rerankScore: candidate.score, semanticScore: candidate.score, exactTermScore: 0, sourceAuthorityScore: 0, versionPreferenceScore: 0, totalScore: candidate.score }, citationAnchor: { chunkId: candidate.chunkId, documentId: candidate.documentId, documentVersionId: candidate.documentVersionId }, textExcerpt: candidate.text })), totalTokenCount: candidates.length, maxTokenCount: 100, inputCandidateCount: candidates.length, conflictGroups: [], sufficiency: { level: candidates.length ? "SUFFICIENT" : "NO_EVIDENCE", reasons: [] }, scoreExplanation: "test", accessPolicyVersion: "active-query-time", createdAt: new Date().toISOString() };
}

function harness() {
  // Deliberately stale false metadata proves it is never an authorization
  // source or a false-negative backend/post-hydration gate.
  const chunks = [chunk("chunk-a", tenantA, documentA, false), chunk("chunk-cross", tenantB, documentB)];
  const access = new Map<string, boolean>([[`${omar}:${documentA}`, true], [`${sara}:${documentA}`, false]]);
  const authorizationContexts: AccessContext[] = [];
  const rerankerInputs: RetrievalCandidate[][] = [];
  const raw = [{ chunkId: "chunk-a", score: 0.9 }, { chunkId: "chunk-cross", score: 0.8 }];
  const vectorAdapter = { providerKey: "test-vector", search: async () => raw } as unknown as VectorStoreAdapter;
  const keywordAdapter = { providerKey: "test-keyword", search: async () => raw } as unknown as KeywordAdapter;
  const repository = { findChunksByIds: async (requestedTenant: string, ids: string[]) => chunks.filter((item) => item.tenantId.toString() === requestedTenant && ids.includes(item._id.toString())) } as unknown as RetrievalRepository;
  const rerankerService = { buildEvidenceBundle: async (candidates: RetrievalCandidate[]) => { rerankerInputs.push(candidates); return bundle(candidates); } } as RerankerService;
  const service = createRetrievalService({
    vectorAdapter, keywordAdapter,
    embeddingAdapter: { embed: async () => ({ vectors: [[1, 0]], usage: { totalTokens: 1 } }) } as never,
    fusionEngine: new FusionEngine(),
    filterCompiler: { compileAccessFilters, compileQueryFilters, mergeFilters },
    repository, rerankerService,
    resolveAccessContext: async (input) => ({ ...input, baseRole: "EMPLOYEE", customRoleId: "64a000000000000000000008", departmentIds: ["64a000000000000000000009"], requiredAction: "use_in_ai" }),
    authorizeDocumentForAi: async (input, documentId) => {
      authorizationContexts.push(input);
      if (!access.get(`${input.actorId}:${documentId}`)) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
    },
  });
  return { service, access, authorizationContexts, rerankerInputs };
}

describe("query-time RAG document authorization", () => {
  test("authorized use_in_ai returns evidence and citation anchors", async () => {
    const { service } = harness();
    const result = await service.hybridSearch({ queryText: "secret", topK: 5 }, context());
    assert.deepEqual(result.candidates.map((candidate) => candidate.chunkId), ["chunk-a"]);
    assert.equal(result.evidenceBundle?.items[0]?.citationAnchor.documentId, documentA);
  });

  test("readable but AI-unauthorized document is excluded from vector, keyword, reranker, evidence, and citations", async () => {
    const { service, access, rerankerInputs } = harness();
    access.set(`${omar}:${documentA}`, false);
    const vector = await service.vectorSearch({ queryText: "secret", topK: 5 }, context());
    const keyword = await service.keywordSearch({ queryText: "secret", topK: 5 }, context());
    const hybrid = await service.hybridSearch({ queryText: "secret", topK: 5 }, context());
    assert.equal(vector.diagnostics.vectorCandidateCount, 0);
    assert.equal(keyword.diagnostics.keywordCandidateCount, 0);
    assert.deepEqual(hybrid.candidates, []);
    assert.ok(rerankerInputs.every((input) => input.length === 0));
    assert.deepEqual(hybrid.evidenceBundle?.items, []);
  });

  test("revocation is immediate for identical and paraphrased queries without reindexing", async () => {
    const { service, access } = harness();
    assert.equal((await service.hybridSearch({ queryText: "secret", topK: 5 }, context())).candidates.length, 1);
    access.set(`${omar}:${documentA}`, false);
    assert.equal((await service.hybridSearch({ queryText: "secret", topK: 5 }, context())).candidates.length, 0);
    assert.equal((await service.hybridSearch({ queryText: "tell me the protected value", topK: 5 }, context())).candidates.length, 0);
  });

  test("grant is immediate even when existing chunk metadata is stale false", async () => {
    const testHarness = harness();
    testHarness.access.set(`${omar}:${documentA}`, false);
    assert.equal((await testHarness.service.hybridSearch({ queryText: "secret", topK: 5 }, context())).candidates.length, 0);
    testHarness.access.set(`${omar}:${documentA}`, true);
    assert.equal((await testHarness.service.hybridSearch({ queryText: "secret", topK: 5 }, context())).candidates.length, 1);
  });

  test("two users in one tenant receive different results from the current policy decision", async () => {
    const { service } = harness();
    assert.equal((await service.hybridSearch({ queryText: "secret", topK: 5 }, context(omar))).candidates.length, 1);
    assert.equal((await service.hybridSearch({ queryText: "secret", topK: 5 }, context(sara))).candidates.length, 0);
  });

  test("cross-tenant raw chunk IDs never survive tenant-scoped hydration", async () => {
    const { service } = harness();
    const result = await service.hybridSearch({ queryText: "secret", topK: 5 }, context());
    assert.ok(result.candidates.every((candidate) => candidate.tenantId === tenantA));
    assert.ok(result.candidates.every((candidate) => candidate.documentId !== documentB));
  });

  test("authorization receives resolved role, department, identity, tenant, and use_in_ai action", async () => {
    const { service, authorizationContexts } = harness();
    await service.hybridSearch({ queryText: "secret", topK: 5 }, context());
    assert.ok(authorizationContexts.length > 0);
    assert.deepEqual(authorizationContexts[0], { tenantId: tenantA, actorId: omar, baseRole: "EMPLOYEE", customRoleId: "64a000000000000000000008", departmentIds: ["64a000000000000000000009"], requiredAction: "use_in_ai" });
  });
});
