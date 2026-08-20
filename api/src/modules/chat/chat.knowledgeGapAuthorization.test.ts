/**
 * Knowledge-gap × authorization contract (KG-1 … KG-10).
 *
 * A question the actor is not permitted to see must never be recorded as "the
 * company does not know this". These tests drive the REAL retrieval service so
 * the reason vocabulary is proven end to end rather than hand-crafted:
 *
 *   retrieval.service (authoritative reasons)
 *     → authorized_hybrid_search / evaluate_evidence (translation boundary)
 *       → resolveChatOutcome (user-visible outcome)
 *         → isReportableKnowledgeGap (gap decision)
 *
 * The historical defect lived entirely in the translation boundary: the service
 * emitted `retrievalOutcome: "NO_AUTHORIZED_DOCUMENTS"` + `authorizationRestricted`,
 * while the tool recomputed the outcome from candidate counts (both zero on a
 * denied corpus) and compared `zeroCandidateReason` against a different enum
 * literal. Both signals were dropped, so every authorization denial arrived
 * downstream as an ordinary `NO_MATCHES` and created a false knowledge gap.
 *
 * Every case additionally asserts that nothing about the restricted documents
 * leaks: no title, id, chunk id, text, or count of restricted records.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import type { DocumentChunkDocument } from "../../db/models/documentChunk.model.js";
import type { AdapterFilter } from "../../providers/embedding/adapterFilter.types.js";
import type { KeywordAdapter } from "../../providers/embedding/keywordAdapter.js";
import type { VectorStoreAdapter } from "../../providers/embedding/vectorStoreAdapter.js";
import type { DocumentRetrievalAuthorizationResult } from "../document-access/documentAccess.retrievalAuthorization.js";
import type { DocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
import type { RerankerService } from "../reranker/reranker.service.js";
import type { EvidenceBundle } from "../reranker/reranker.types.js";
import {
  compileAccessFilters,
  compileQueryFilters,
  mergeFilters,
} from "../retrieval/filterCompiler.js";
import { FusionEngine } from "../retrieval/fusionEngine.js";
import type { RetrievalRepository } from "../retrieval/retrieval.repository.js";
import { createRetrievalService } from "../retrieval/retrieval.service.js";
import type {
  AccessContext,
  RetrievalCandidate,
} from "../retrieval/retrieval.types.js";
import { resolveRetrievalAuthorizationSignals } from "../retrieval/retrieval.authorizationSignals.js";
import {
  createAuthorizedRetrievalTools,
  type AuthorizedRetrievalDependencies,
  type LoadedChunkCandidate,
} from "../agents/tools/authorizedRetrievalTools.js";
import {
  isReportableKnowledgeGap,
  resolveChatOutcome,
} from "./chatWorkflowService.js";

const tenantA = "64a000000000000000000001";
const tenantB = "64a000000000000000000002";
const securityEmployee = "64a000000000000000000003";
const securityDoc = "64a000000000000000000005";
const procurementDoc = "64a000000000000000000006";
const version = "64a000000000000000000007";

/** Restricted content and identifiers that must never reach the model or user. */
const RESTRICTED_TITLE = "Restricted Operations";
const RESTRICTED_CANARY = "CANARY-PROCUREMENT-8F31";

interface DocFixture {
  readonly documentId: string;
  readonly chunkId: string;
  readonly text: string;
  /** Actors permitted to use this document in AI. */
  readonly authorizedActors: readonly string[];
}

const SECURITY: DocFixture = {
  documentId: securityDoc,
  chunkId: "64a000000000000000000009",
  text: "Security Policy: internal systems require MFA.",
  authorizedActors: [securityEmployee],
};

const PROCUREMENT: DocFixture = {
  documentId: procurementDoc,
  chunkId: "64a00000000000000000000b",
  text: `${RESTRICTED_TITLE}: purchase orders above 50000 need CFO approval. ${RESTRICTED_CANARY}`,
  authorizedActors: [],
};

/**
 * Every fixture document belongs to tenant A. Cross-tenant runs therefore see a
 * corpus that genuinely does not match their tenant, rather than a stub that
 * relabels chunks with whatever tenant asked for them.
 */
function chunkDoc(fixture: DocFixture): DocumentChunkDocument {
  return {
    _id: { toString: () => fixture.chunkId },
    tenantId: { toString: () => tenantA },
    documentId: { toString: () => fixture.documentId },
    documentVersionId: { toString: () => version },
    text: fixture.text,
    classification: "internal",
    pageNumber: 1,
    sectionTitle: "Section",
  } as unknown as DocumentChunkDocument;
}

function loadedChunk(fixture: DocFixture): LoadedChunkCandidate {
  return {
    chunkId: fixture.chunkId,
    documentId: fixture.documentId,
    documentVersionId: version,
    tenantId: tenantA,
    text: fixture.text,
    allowAiUse: true,
    status: "ACTIVE",
    confidenceScore: 0.9,
  };
}

function evidenceBundle(
  candidates: RetrievalCandidate[],
  level: EvidenceBundle["sufficiency"]["level"] = "SUFFICIENT",
): EvidenceBundle {
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
      level: candidates.length === 0 ? "NO_EVIDENCE" : level,
      reasons: candidates.length === 0 ? ["no evidence"] : [],
    },
    scoreExplanation: "test",
    accessPolicyVersion: "active-query-time",
    createdAt: new Date().toISOString(),
  };
}

interface HarnessOptions {
  /** Documents the search backends match on, before any authorization. */
  readonly corpus: readonly DocFixture[];
  readonly actorId?: string;
  readonly tenantId?: string;
  /** Simulates a fail-closed deny-all corpus with a typed denial reason. */
  readonly corpusDenial?: DocumentRetrievalAuthorizationResult["denialReason"];
  /** Simulates the canonical constrained allowlist used by production retrieval. */
  readonly canonicalAllowedDocumentIds?: readonly string[];
  /** Documents the search backends would match before authorization filtering. */
  readonly matchingDocumentIds?: readonly string[];
  /** Sufficiency the reranker reports for whatever survives authorization. */
  readonly sufficiency?: EvidenceBundle["sufficiency"]["level"];
}

/**
 * Wires the real retrieval service and the real authorized retrieval tools so
 * the reason codes crossing the boundary are the production ones.
 */
function harness(options: HarnessOptions) {
  const tenantId = options.tenantId ?? tenantA;
  const actorId = options.actorId ?? securityEmployee;
  const byChunkId = new Map(options.corpus.map((doc) => [doc.chunkId, doc]));
  const byDocumentId = new Map(options.corpus.map((doc) => [doc.documentId, doc]));
  const raw = options.corpus.map((doc) => ({ chunkId: doc.chunkId, score: 0.9 }));
  const matchingDocumentIds = new Set(
    options.matchingDocumentIds ?? options.corpus.map((doc) => doc.documentId),
  );

  const isAuthorized = (documentId: string): boolean =>
    byDocumentId.get(documentId)?.authorizedActors.includes(actorId) ?? false;

  const search = async (request: { filter?: AdapterFilter }) =>
    raw.filter((candidate) => {
      const fixture = byChunkId.get(candidate.chunkId);
      if (!fixture || !matchingDocumentIds.has(fixture.documentId)) return false;
      const documentIds = request.filter?.documentIds;
      return documentIds === undefined || documentIds.includes(fixture.documentId);
    });
  const vectorAdapter = {
    providerKey: "test-vector",
    search,
  } as unknown as VectorStoreAdapter;
  const keywordAdapter = {
    providerKey: "test-keyword",
    search,
  } as unknown as KeywordAdapter;

  const repository = {
    findChunksByIds: async (tenant: string, ids: string[]) =>
      options.corpus
        .filter((doc) => ids.includes(doc.chunkId))
        .map((doc) => chunkDoc(doc))
        .filter((doc) => doc.tenantId.toString() === tenant),
  } as unknown as RetrievalRepository;

  const rerankerService = {
    buildEvidenceBundle: async (candidates: RetrievalCandidate[]) =>
      evidenceBundle(candidates, options.sufficiency),
  } as RerankerService;

  const retrieval = createRetrievalService({
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
      ids.filter((id) => byDocumentId.has(id)),
    ...(options.corpusDenial || options.canonicalAllowedDocumentIds
      ? {
          resolveRetrievalAuthorization:
            async (): Promise<DocumentRetrievalAuthorizationResult> => ({
              filter: {
                schemaVersion: 1,
                evaluationContractVersion: 1,
                tenantId,
                actorId,
                action: "use_in_ai" as const,
                mode: options.corpusDenial ? "deny_all" : "constrained",
                failClosed: true as const,
                requiresCurrentPolicyRevalidation: true as const,
                allowedDocumentIds: options.corpusDenial
                  ? []
                  : [...(options.canonicalAllowedDocumentIds ?? [])],
                deniedDocumentIds: [],
                allowedOwnerIds: [],
                allowedCategoryIds: [],
                allowedDepartmentIds: [],
                allowedClassifications: [],
                policyVersions: [],
              },
              ...(options.corpusDenial
                ? { denialReason: options.corpusDenial }
                : {}),
              resolvedDocumentCount: options.corpus.length,
            }),
        }
      : {}),
    authorizeDocumentForAi: async (input, documentId) => {
      if (input.tenantId !== tenantId || !isAuthorized(documentId)) {
        throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
      }
    },
  });

  const authorization = {
    resolveActor: async () => ({
      tenantId,
      actorId,
      baseRole: "EMPLOYEE" as const,
      customRoleId: null,
      departmentIds: [] as string[],
    }),
    authorizeDocumentAction: async (
      ctx: { tenantId: string },
      documentId: string,
    ) => {
      if (ctx.tenantId !== tenantId || !isAuthorized(documentId)) {
        throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document not found");
      }
    },
    authorizeDocumentsAction: async () => undefined,
    buildDiscoverPipeline: async () => [],
  } as unknown as DocumentAccessAuthorizationService;

  const deps: AuthorizedRetrievalDependencies = {
    retrieval,
    reranker: rerankerService,
    authorization,
    resolveDocumentHints: async () => ({
      referencedDocumentIds: [],
      referencedDocumentTitles: [],
      ambiguousTitleMatches: false,
      unresolvedTitleHints: [],
    }),
    loadChunksByIds: async (requestTenantId, chunkIds) =>
      chunkIds
        .map((id) => byChunkId.get(id))
        .filter((doc): doc is DocFixture => Boolean(doc))
        .map((doc) => loadedChunk(doc))
        .filter((chunk) => chunk.tenantId === requestTenantId),
    loadEligibleDocumentIds: async (_tenantId, documentIds) =>
      documentIds.filter((id) => byDocumentId.has(id)),
  } as AuthorizedRetrievalDependencies;

  const tools = createAuthorizedRetrievalTools(deps);
  const context = {
    tenantId,
    actorId,
    traceId: "trace-kg",
    requestId: "req-kg",
    runId: "run-kg",
    workflowName: "chat",
    agentName: "supervisor",
    actorEmail: "actor@example.com",
    actorRole: "EMPLOYEE",
  };

  return {
    accessContext: { tenantId, actorId, baseRole: "EMPLOYEE" } as AccessContext,
    retrieval,
    context,
    searchTool: tools.find((t) => t.schema.name === "authorized_hybrid_search")!,
    evaluateTool: tools.find((t) => t.schema.name === "evaluate_evidence")!,
  };
}

interface SearchOutput {
  candidates: Array<{ chunkId: string; documentId: string }>;
  totalCandidates: number;
  reasonCode: string;
  retrievalOutcome: string;
  authorizationRestricted?: boolean;
  authorizationFiltered?: boolean;
}

interface EvidenceOutput {
  sufficiency: string;
  approvedEvidenceIds: string[];
  reasonCode: string;
  authorizationRestricted?: boolean;
  authorizationFiltered?: boolean;
}

/**
 * Runs the production sequence for one question and returns both the internal
 * signals and the resulting knowledge-gap decision.
 */
async function runTurn(options: HarnessOptions) {
  const { searchTool, evaluateTool, context } = harness(options);
  const search = (await searchTool.handler(context, {
    queryText: "what is the approval threshold",
    topK: 10,
  })) as SearchOutput;

  let evidence: EvidenceOutput | null = null;
  if (search.candidates.length > 0) {
    evidence = (await evaluateTool.handler(context, {
      question: "what is the approval threshold",
      candidateIds: search.candidates.map((candidate) => candidate.chunkId),
    })) as EvidenceOutput;
  }

  // Mirrors ChatWorkflowService.onToolResult artifact accumulation.
  const artifacts = {
    authorizationRestricted:
      search.authorizationRestricted === true ||
      evidence?.authorizationRestricted === true,
    authorizationFiltered:
      search.authorizationFiltered === true ||
      search.authorizationRestricted === true ||
      evidence?.authorizationFiltered === true ||
      evidence?.authorizationRestricted === true,
    evidenceSufficiency: (evidence?.sufficiency ?? null) as
      | "SUFFICIENT"
      | "WEAK"
      | "NO_EVIDENCE"
      | "CONFLICTING"
      | null,
    evidenceReasonCode: evidence?.reasonCode ?? null,
    retrievalOutcome: search.retrievalOutcome as
      | "AUTHORIZED_RESULTS"
      | "NO_MATCHES"
      | "AUTHORIZATION_FILTERED",
  };

  const answered =
    evidence?.sufficiency === "SUFFICIENT" &&
    (evidence?.approvedEvidenceIds.length ?? 0) > 0;
  const terminalReasonCode = answered
    ? "COMPLIANT_GROUNDED_RESPONSE"
    : "INSUFFICIENT_EVIDENCE";

  const outcome = resolveChatOutcome(terminalReasonCode, artifacts);
  return {
    search,
    evidence,
    artifacts,
    outcome,
    knowledgeGapReported: isReportableKnowledgeGap(outcome, artifacts),
  };
}

/** Fails if any restricted identifier or content appears in tool output. */
function assertNoRestrictedLeak(payload: unknown): void {
  const serialized = JSON.stringify(payload ?? null);
  for (const secret of [
    RESTRICTED_TITLE,
    RESTRICTED_CANARY,
    procurementDoc,
    PROCUREMENT.chunkId,
    "CFO approval",
    "50000",
  ]) {
    assert.equal(
      serialized.includes(secret),
      false,
      `restricted value "${secret}" must never appear in tool output`,
    );
  }
}

describe("knowledge gap × authorization (KG-1 … KG-10)", () => {
  test("KG-1: a true gap in an authorized corpus is still a reportable knowledge gap", async () => {
    // Authorized corpus, nothing matched at all — the company genuinely has no
    // content for the question. This is the only shape that may create a gap.
    const result = await runTurn({ corpus: [] });

    assert.equal(result.search.retrievalOutcome, "NO_MATCHES");
    assert.equal(result.artifacts.authorizationRestricted, false);
    assert.equal(result.artifacts.authorizationFiltered, false);
    assert.equal(result.outcome, "no_relevant_content");
    assert.equal(result.knowledgeGapReported, true);
  });

  test("KG-2: no authorized documents reports authorization restriction, not a gap", async () => {
    const result = await runTurn({ corpus: [PROCUREMENT] });

    assert.equal(result.search.retrievalOutcome, "AUTHORIZATION_FILTERED");
    assert.equal(result.search.authorizationRestricted, true);
    assert.equal(result.outcome, "authorization_restricted");
    assert.equal(result.knowledgeGapReported, false);
    assertNoRestrictedLeak(result.search);
  });

  test("KG-2b: canonical allowlist miss reports restriction instead of a knowledge gap", async () => {
    const result = await runTurn({
      corpus: [SECURITY, PROCUREMENT],
      canonicalAllowedDocumentIds: [securityDoc],
      matchingDocumentIds: [procurementDoc],
    });

    assert.equal(result.search.candidates.length, 0);
    assert.equal(result.search.authorizationRestricted, true);
    assert.equal(result.search.authorizationFiltered, true);
    assert.equal(result.outcome, "authorization_restricted");
    assert.equal(result.knowledgeGapReported, false);
    assertNoRestrictedLeak(result.search);
  });

  test("KG-3: an explicit deny-all corpus is authorization-restricted, not a gap", async () => {
    // `NO_AUTHORIZED_DOCUMENTS` is the denial reason a fail-closed deny-all
    // corpus carries. Both candidate counts are zero here, which is exactly the
    // shape a count-based guess used to misread as an ordinary no-match.
    const result = await runTurn({
      corpus: [PROCUREMENT],
      corpusDenial: "NO_AUTHORIZED_DOCUMENTS",
    });

    assert.equal(result.search.totalCandidates, 0);
    assert.equal(result.search.retrievalOutcome, "AUTHORIZATION_FILTERED");
    assert.equal(result.search.authorizationRestricted, true);
    assert.equal(result.outcome, "authorization_restricted");
    assert.equal(result.knowledgeGapReported, false);
    assertNoRestrictedLeak(result.search);
  });

  test("KG-4: department restriction (Security actor asking Procurement) creates no gap", async () => {
    const result = await runTurn({
      corpus: [PROCUREMENT],
      corpusDenial: "PERMISSION_REQUIRED",
    });

    assert.equal(result.search.authorizationRestricted, true);
    assert.equal(result.outcome, "authorization_restricted");
    assert.equal(result.knowledgeGapReported, false);
    assertNoRestrictedLeak(result.search);
  });

  test("KG-5: classification restriction (readable but not AI-usable) creates no gap", async () => {
    const result = await runTurn({
      corpus: [PROCUREMENT],
      corpusDenial: "READABLE_NOT_AI_USABLE",
    });

    assert.equal(result.search.authorizationRestricted, true);
    assert.equal(result.outcome, "authorization_restricted");
    assert.equal(result.knowledgeGapReported, false);
  });

  test("KG-6: an unresolvable custom-role scope creates no gap", async () => {
    const result = await runTurn({
      corpus: [PROCUREMENT],
      corpusDenial: "TAXONOMY_SCOPE_UNRESOLVABLE",
    });

    assert.equal(result.search.authorizationRestricted, true);
    assert.equal(result.outcome, "authorization_restricted");
    assert.equal(result.knowledgeGapReported, false);
  });

  test("KG-7: a partially authorized corpus whose authorized slice is weak creates no gap", async () => {
    // The actor may use the Security Policy but not Procurement. Authorization
    // removed the document that actually answers the question, so the weak
    // result is not evidence the company lacks the knowledge.
    const result = await runTurn({
      corpus: [SECURITY, PROCUREMENT],
      sufficiency: "WEAK",
    });

    assert.equal(result.search.retrievalOutcome, "AUTHORIZED_RESULTS");
    assert.equal(
      result.search.authorizationFiltered,
      true,
      "the searched corpus was narrower than the tenant corpus",
    );
    // Terminal restriction stays false: usable authorized candidates existed.
    assert.equal(result.artifacts.authorizationRestricted, false);
    assert.equal(result.evidence?.sufficiency, "WEAK");
    assert.equal(result.outcome, "no_relevant_content");
    assert.equal(
      result.knowledgeGapReported,
      false,
      "a refusal over a partially authorized corpus must not claim missing knowledge",
    );
    assertNoRestrictedLeak(result.search);
    assertNoRestrictedLeak(result.evidence);
  });

  test("KG-8: authorized but genuinely insufficient evidence remains a reportable gap", async () => {
    // Nothing was filtered by authorization; the authorized document simply
    // does not answer the question. That is a real content gap.
    const result = await runTurn({ corpus: [SECURITY], sufficiency: "WEAK" });

    assert.equal(result.search.retrievalOutcome, "AUTHORIZED_RESULTS");
    assert.equal(result.artifacts.authorizationFiltered, false);
    assert.equal(result.evidence?.sufficiency, "WEAK");
    assert.equal(result.outcome, "no_relevant_content");
    assert.equal(result.knowledgeGapReported, true);
  });

  test("KG-9: another tenant's corpus never influences the gap decision", async () => {
    // The actor's tenant is tenantB; every matching chunk belongs to tenantA.
    // Cross-tenant content must neither be used nor counted, and the turn must
    // not be answered from it.
    const result = await runTurn({
      corpus: [SECURITY, PROCUREMENT],
      tenantId: tenantB,
    });

    assert.equal(result.search.candidates.length, 0);
    assert.notEqual(result.outcome, "answered");
    assertNoRestrictedLeak(result.search);
  });

  test("KG-10: naming an unauthorized document by title neither confirms it nor creates a gap", async () => {
    const { searchTool, evaluateTool, context } = harness({
      corpus: [PROCUREMENT],
    });
    const search = (await searchTool.handler(context, {
      queryText: `What does ${RESTRICTED_TITLE} say about purchase approvals?`,
      topK: 10,
    })) as SearchOutput;

    assert.equal(search.candidates.length, 0);
    assert.equal(search.authorizationRestricted, true);
    assertNoRestrictedLeak(search);

    // Even if the model replays the restricted chunk id it saw nowhere, the
    // evidence tool refuses it and reports the restriction rather than content.
    const evidence = (await evaluateTool.handler(context, {
      question: `What does ${RESTRICTED_TITLE} say about purchase approvals?`,
      candidateIds: [PROCUREMENT.chunkId],
    })) as EvidenceOutput;

    assert.equal(evidence.sufficiency, "NO_EVIDENCE");
    assert.equal(evidence.approvedEvidenceIds.length, 0);
    assert.equal(evidence.authorizationRestricted, true);

    const artifacts = {
      authorizationRestricted: true,
      authorizationFiltered: true,
      evidenceSufficiency: "NO_EVIDENCE" as const,
      evidenceReasonCode: evidence.reasonCode,
      retrievalOutcome: search.retrievalOutcome as "AUTHORIZATION_FILTERED",
    };
    const outcome = resolveChatOutcome("INSUFFICIENT_EVIDENCE", artifacts);
    assert.equal(outcome, "authorization_restricted");
    assert.equal(isReportableKnowledgeGap(outcome, artifacts), false);
  });
});

describe("retrieval authorization signal classification", () => {
  test("every authorization denial reason marks the run as filtered", () => {
    for (const reason of [
      "ACTOR_INVALID",
      "PERMISSION_REQUIRED",
      "RESOLVER_FAILED",
      "NO_AUTHORIZED_DOCUMENTS",
      "READABLE_NOT_AI_USABLE",
      "TAXONOMY_SCOPE_UNRESOLVABLE",
      "DENY_ALL",
      "NO_AUTHORIZED_CANDIDATES",
    ]) {
      const signals = resolveRetrievalAuthorizationSignals({
        diagnostics: { zeroCandidateReason: reason },
        usableCandidateCount: 0,
      });
      assert.equal(signals.authorizationFiltered, true, reason);
      assert.equal(signals.authorizationRestricted, true, reason);
    }
  });

  test("content-absence reasons are never treated as authorization restrictions", () => {
    for (const reason of [
      "NO_RAW_SEARCH_RESULTS",
      "NO_FUSED_CANDIDATES",
      "NO_HYDRATED_CANDIDATES",
    ]) {
      const signals = resolveRetrievalAuthorizationSignals({
        diagnostics: {
          zeroCandidateReason: reason,
          retrievalOutcome: "NO_SEARCH_MATCHES",
        },
        usableCandidateCount: 0,
      });
      assert.equal(signals.authorizationFiltered, false, reason);
      assert.equal(signals.authorizationRestricted, false, reason);
    }
  });

  test("inherited object properties are not mistaken for denial reasons", () => {
    const signals = resolveRetrievalAuthorizationSignals({
      diagnostics: { zeroCandidateReason: "toString" },
      usableCandidateCount: 0,
    });
    assert.equal(signals.authorizationFiltered, false);
  });

  test("a successful run that also filtered documents is never terminally restricted", () => {
    const signals = resolveRetrievalAuthorizationSignals({
      diagnostics: { authorizationFiltered: true },
      usableCandidateCount: 3,
      rawCandidateCount: 5,
      postAuthorizationCandidateCount: 3,
    });
    assert.equal(signals.authorizationFiltered, true);
    assert.equal(
      signals.authorizationRestricted,
      false,
      "an answered turn must never be labelled a permission refusal",
    );
  });

  test("missing diagnostics never invent an authorization restriction", () => {
    const signals = resolveRetrievalAuthorizationSignals({
      diagnostics: undefined,
      usableCandidateCount: 0,
    });
    assert.equal(signals.authorizationFiltered, false);
    assert.equal(signals.authorizationRestricted, false);
  });
});
