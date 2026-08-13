import crypto from "node:crypto";
import { AppError } from "../../common/errors/AppError.js";
import { logger } from "../../common/logger/logger.js";
import { getAuditWriter } from "../../common/observability/index.js";
import type { AdapterFilter } from "../../providers/embedding/adapterFilter.types.js";
import type { VectorStoreAdapter } from "../../providers/embedding/vectorStoreAdapter.js";
import type { KeywordAdapter } from "../../providers/embedding/keywordAdapter.js";
import type { EmbeddingAdapter } from "../agents/agents.types.js";
import type { DocumentChunkDocument } from "../../db/models/documentChunk.model.js";
import DocumentModel from "../../db/models/document.model.js";
import { Types } from "mongoose";
import type { FilterCompiler } from "./filterCompiler.js";
import type { FusionEngine } from "./fusionEngine.js";
import type { RetrievalRepository } from "./retrieval.repository.js";
import type { RerankerService } from "../reranker/reranker.service.js";
import type {
  AccessContext,
  FilterSummary,
  RetrievalCandidate,
  RetrievalDiagnostics,
  RetrievalMethod,
  RetrievalQuery,
  RetrievalResult,
} from "./retrieval.types.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface RetrievalServiceDeps {
  vectorAdapter: VectorStoreAdapter;
  keywordAdapter: KeywordAdapter;
  embeddingAdapter: EmbeddingAdapter;
  fusionEngine: FusionEngine;
  filterCompiler: FilterCompiler;
  repository: RetrievalRepository;
  rerankerService?: RerankerService;
  findOwnedDocumentIds?: (
    tenantId: string,
    actorId: string,
    documentIds: string[],
  ) => Promise<string[]>;
  findActiveDocumentIds?: (
    tenantId: string,
    documentIds: string[],
  ) => Promise<string[]>;
  resolveAccessContext: (context: AccessContext) => Promise<AccessContext>;
  authorizeDocumentForAi: (context: AccessContext, documentId: string) => Promise<void>;
  /** Optional request-local diagnostics seam; never changes retrieval output. */
  onHybridRetrievalArtifacts?: (artifacts: HybridRetrievalArtifacts) => void;
  /** Suppresses durable audit writes for isolated evaluation composition only. */
  persistenceMode?: "production" | "ephemeral";
}

export interface RankedRetrievalArtifact {
  readonly rank: number;
  readonly chunkId: string;
  readonly score: number;
}

export interface HybridRetrievalArtifacts {
  readonly rawVectorCandidates: readonly RankedRetrievalArtifact[];
  readonly rawKeywordCandidates: readonly RankedRetrievalArtifact[];
  readonly postAuthorizationVectorCandidates: readonly RankedRetrievalArtifact[];
  readonly postAuthorizationKeywordCandidates: readonly RankedRetrievalArtifact[];
  readonly fusedCandidateIds: readonly string[];
  readonly hydratedCandidateIds: readonly string[];
}

export interface HybridRetrievalService {
  hybridSearch(
    query: RetrievalQuery,
    context: AccessContext,
  ): Promise<RetrievalResult>;

  vectorSearch(
    query: RetrievalQuery,
    context: AccessContext,
  ): Promise<RetrievalResult>;

  keywordSearch(
    query: RetrievalQuery,
    context: AccessContext,
  ): Promise<RetrievalResult>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateQuery(query: RetrievalQuery): void {
  if (
    typeof query.queryText !== "string" ||
    query.queryText.trim().length === 0
  ) {
    throw new AppError(400, "INVALID_INPUT", "queryText must be a non-empty string");
  }

  if (
    typeof query.topK !== "number" ||
    query.topK < 1 ||
    query.topK > 100 ||
    !Number.isInteger(query.topK)
  ) {
    throw new AppError(400, "INVALID_INPUT", "topK must be an integer between 1 and 100");
  }
}

// ---------------------------------------------------------------------------
// Filter summary builder
// ---------------------------------------------------------------------------

function buildFilterSummary(
  context: AccessContext,
  queryFilter: RetrievalQuery["filter"],
): FilterSummary {
  const permissionScopeKeys: string[] = [];
  const scopes = context.permissionScopes;
  if (scopes) {
    for (const [key, value] of Object.entries(scopes)) {
      if (value !== undefined && value !== null) {
        permissionScopeKeys.push(key);
      }
    }
  }

  const explicitFilters: string[] = [];
  if (queryFilter) {
    for (const [key, value] of Object.entries(queryFilter)) {
      if (Array.isArray(value) && value.length > 0) {
        explicitFilters.push(key);
      } else if (!Array.isArray(value) && value !== undefined) {
        explicitFilters.push(key);
      }
    }
  }

  return {
    tenantFilter: true,
    roleFilter: context.baseRole,
    permissionScopes: permissionScopeKeys,
    explicitFilters,
    versionFilter: false,
  };
}

// ---------------------------------------------------------------------------
// Diagnostics builder
// ---------------------------------------------------------------------------

function buildDiagnostics(params: {
  traceId: string;
  vectorLatencyMs?: number;
  keywordLatencyMs?: number;
  fusionLatencyMs?: number;
  totalLatencyMs: number;
  vectorCandidateCount: number;
  keywordCandidateCount: number;
  rawVectorCandidateCount?: number;
  rawKeywordCandidateCount?: number;
  postAuthorizationVectorCandidateCount?: number;
  postAuthorizationKeywordCandidateCount?: number;
  authorizationFiltered?: boolean;
  fusedCandidateCount?: number;
  hydratedCandidateCount?: number;
  evidenceItemCount?: number;
  evidenceSufficiency?: string;
  zeroCandidateReason?: string;
}): RetrievalDiagnostics {
  return params;
}

// ---------------------------------------------------------------------------
// Re-validation and hydration
// ---------------------------------------------------------------------------

async function revalidateAndHydrate(
  deps: RetrievalServiceDeps,
  tenantId: string,
  candidates: RetrievalCandidate[],
  mandatoryFilter: AdapterFilter,
  context?: AccessContext,
): Promise<{ candidates: RetrievalCandidate[]; authorizationFiltered: boolean }> {
  if (candidates.length === 0) return { candidates: [], authorizationFiltered: false };

  const chunkIds = candidates.map((c) => c.chunkId);
  const chunks = await deps.repository.findChunksByIds(tenantId, chunkIds);
  const chunkMap = new Map<string, DocumentChunkDocument>();
  for (const chunk of chunks) {
    chunkMap.set(chunk._id.toString(), chunk);
  }

  // Active document verification: filter out chunks belonging to soft-deleted documents
  const allDocIds = [...new Set(chunks.map((c) => c.documentId.toString()))];
  let activeDocIds = new Set<string>();
  if (allDocIds.length > 0) {
    if (deps.findActiveDocumentIds) {
      const active = await deps.findActiveDocumentIds(tenantId, allDocIds);
      activeDocIds = new Set(active);
    } else if (DocumentModel.db?.readyState === 1) {
      const activeDocs = await DocumentModel.find({
        _id: { $in: allDocIds.map((id) => new Types.ObjectId(id)) },
        tenantId: new Types.ObjectId(tenantId),
        deletedAt: null,
      }, { _id: 1 }).lean().exec();
      activeDocIds = new Set(activeDocs.map((d) => d._id.toString()));
    } else {
      activeDocIds = new Set(allDocIds);
    }
  }

  // selfOnly enforcement: fetch parent documents and check ownership
  let ownedDocumentIds: Set<string> | null = null;
  if (context?.permissionScopes?.selfOnly) {
    const docIds = [...new Set(chunks.map((c) => c.documentId.toString()))];
    if (docIds.length > 0) {
      if (deps.findOwnedDocumentIds) {
        const owned = await deps.findOwnedDocumentIds(tenantId, context.actorId, docIds);
        ownedDocumentIds = new Set(owned);
      } else if (DocumentModel.db?.readyState === 1) {
        const docs = await DocumentModel.find({
          _id: { $in: docIds.map((id) => new Types.ObjectId(id)) },
          tenantId: new Types.ObjectId(tenantId),
          uploadedBy: new Types.ObjectId(context.actorId),
          deletedAt: null,
        }, { _id: 1 }).lean().exec();
        ownedDocumentIds = new Set(docs.map((d) => d._id.toString()));
      } else {
        ownedDocumentIds = new Set(docIds);
      }
    }
  }

  const hydrated: RetrievalCandidate[] = [];
  let authorizationFiltered = false;

  for (const candidate of candidates) {
    const chunk = chunkMap.get(candidate.chunkId);
    if (!chunk) continue;

    // Active document check: reject chunks from soft-deleted documents
    if (!activeDocIds.has(chunk.documentId.toString())) continue;

    // Re-validate: classification must be in the mandatory filter's allowed set
    if (mandatoryFilter.classification) {
      const allowedSet = mandatoryFilter.classification.$in;
      if (chunk.classification && !allowedSet.includes(chunk.classification)) {
        authorizationFiltered = true;
        continue;
      }
    }

    // Re-validate: department must be in the mandatory filter's allowed set
    if (mandatoryFilter.department) {
      const allowedSet = mandatoryFilter.department.$in;
      if (chunk.department && !allowedSet.includes(chunk.department)) {
        authorizationFiltered = true;
        continue;
      }
    }

    // Re-validate: category must be in the mandatory filter's allowed set
    if (mandatoryFilter.category) {
      const allowedSet = mandatoryFilter.category.$in;
      if (chunk.category && !allowedSet.includes(chunk.category)) {
        authorizationFiltered = true;
        continue;
      }
    }

    // selfOnly enforcement: skip chunks from documents not owned by the actor
    if (ownedDocumentIds !== null) {
      if (!ownedDocumentIds.has(chunk.documentId.toString())) {
        authorizationFiltered = true;
        continue;
      }
    }

    // Hydrate from the DB document
    hydrated.push({
      ...candidate,
      documentId: chunk.documentId.toString(),
      documentVersionId: chunk.documentVersionId?.toString() ?? "",
      tenantId: chunk.tenantId.toString(),
      text: chunk.text,
      pageNumber: chunk.pageNumber ?? chunk.pageStart ?? undefined,
      sectionTitle: chunk.sectionTitle ?? undefined,
      classification: chunk.classification ?? undefined,
    });
  }

  return { candidates: hydrated, authorizationFiltered };
}

async function authorizeCandidateIds(
  deps: RetrievalServiceDeps,
  context: AccessContext,
  candidates: readonly { chunkId: string }[],
  traceId: string,
): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const chunks = await deps.repository.findChunksByIds(context.tenantId, [...new Set(candidates.map((candidate) => candidate.chunkId))]);
  const chunksByDocument = new Map<string, string[]>();
  for (const chunk of chunks) {
    const documentId = chunk.documentId.toString();
    const chunkIds = chunksByDocument.get(documentId) ?? [];
    chunkIds.push(chunk._id.toString());
    chunksByDocument.set(documentId, chunkIds);
  }

  const authorizedChunkIds = new Set<string>();
  await Promise.all([...chunksByDocument].map(async ([documentId, chunkIds]) => {
    try {
      await deps.authorizeDocumentForAi(context, documentId);
      for (const chunkId of chunkIds) authorizedChunkIds.add(chunkId);
      logger.info({ traceId, userId: context.actorId, tenantId: context.tenantId, documentId, requiredAction: "use_in_ai", authorizationResult: "allowed", reasonCode: "ACCESS_ALLOWED" }, "RAG document authorization");
    } catch (error) {
      const reasonCode = error instanceof AppError ? error.code : "AUTHORIZATION_FAILED";
      logger.info({ traceId, userId: context.actorId, tenantId: context.tenantId, documentId, requiredAction: "use_in_ai", authorizationResult: "denied", reasonCode }, "RAG document authorization");
    }
  }));
  return authorizedChunkIds;
}

function retainAuthorized<T extends { chunkId: string }>(candidates: T[], authorizedChunkIds: Set<string>): T[] {
  return candidates.filter((candidate) => authorizedChunkIds.has(candidate.chunkId));
}

/**
 * Reauthorize only the final hydrated documents immediately before their
 * content can leave the retrieval service. Raw candidates are authorized
 * earlier for efficient filtering; this second check closes the revocation
 * window between candidate authorization and final content return.
 */
async function reauthorizeFinalCandidates(
  deps: RetrievalServiceDeps,
  context: AccessContext,
  candidates: RetrievalCandidate[],
  traceId: string,
): Promise<{ candidates: RetrievalCandidate[]; authorizationFiltered: boolean }> {
  if (candidates.length === 0) return { candidates: [], authorizationFiltered: false };

  const documentIds = [...new Set(candidates.map((candidate) => candidate.documentId))];
  const authorizedDocumentIds = new Set<string>();
  await Promise.all(documentIds.map(async (documentId) => {
    try {
      await deps.authorizeDocumentForAi(context, documentId);
      authorizedDocumentIds.add(documentId);
    } catch (error) {
      const reasonCode = error instanceof AppError ? error.code : "AUTHORIZATION_FAILED";
      logger.info(
        {
          traceId,
          userId: context.actorId,
          tenantId: context.tenantId,
          documentId,
          requiredAction: "use_in_ai",
          authorizationResult: "denied",
          reasonCode,
        },
        "Final RAG document authorization",
      );
    }
  }));

  const authorized = candidates.filter((candidate) => authorizedDocumentIds.has(candidate.documentId));
  return {
    candidates: authorized,
    authorizationFiltered: authorized.length < candidates.length,
  };
}

async function resolveAuthorizationContext(deps: RetrievalServiceDeps, context: AccessContext): Promise<AccessContext> {
  const resolved = await deps.resolveAccessContext(context);
  return { ...resolved, requiredAction: "use_in_ai" };
}

// ---------------------------------------------------------------------------
// Embedding resolution
// ---------------------------------------------------------------------------

async function resolveQueryEmbedding(
  deps: RetrievalServiceDeps,
  query: RetrievalQuery,
): Promise<number[]> {
  if (query.queryVector !== undefined) {
    return query.queryVector;
  }
  const result = await deps.embeddingAdapter.embed({ inputs: [query.queryText] });
  return result.vectors[0];
}

async function resolveQueryEmbeddings(
  deps: RetrievalServiceDeps,
  query: RetrievalQuery,
  semanticTexts: string[],
): Promise<number[][]> {
  if (query.queryVector !== undefined) {
    return [query.queryVector];
  }
  const result = await deps.embeddingAdapter.embed({ inputs: semanticTexts });
  return result.vectors;
}

const MAX_QUERY_VARIANTS = 3;
const MAX_LEXICAL_PLAN_INPUTS_PER_CLASS = 30;

function uniqueTexts(texts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const text of texts) {
    const trimmed = text.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_QUERY_VARIANTS) break;
  }
  return result;
}

function normalizeLexicalCandidates(
  values: readonly string[] | undefined,
  excluded: ReadonlySet<string>,
): string[] {
  const seen = new Set(excluded);
  const result: string[] = [];
  for (const value of values ?? []) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= MAX_LEXICAL_PLAN_INPUTS_PER_CLASS) break;
  }
  return result;
}

function prioritizeExactTerms(terms: readonly string[]): string[] {
  const numeric: string[] = [];
  const codes: string[] = [];
  const other: string[] = [];
  const numericAnchor = /(?:[$€£¥]\s*\d)|(?:\d+(?:[.,]\d+)?\s*(?:days?|minutes?|hours?|weeks?|months?|years?))/iu;
  const codeAnchor = /^(?=.*\p{Lu})[\p{Lu}\d._/-]{2,}$/u;

  for (const term of terms) {
    if (numericAnchor.test(term)) numeric.push(term);
    else if (codeAnchor.test(term)) codes.push(term);
    else other.push(term);
  }

  const prioritized: string[] = [];
  const buckets = [numeric, codes, other];
  for (let index = 0; prioritized.length < terms.length; index += 1) {
    for (const bucket of buckets) {
      const term = bucket[index];
      if (term !== undefined) prioritized.push(term);
    }
  }
  return prioritized;
}

function prioritizeKeywordTexts(texts: readonly string[]): string[] {
  const tokenCount = (text: string): number =>
    new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).size;
  return texts
    .map((text, index) => ({ text, index, tokenCount: tokenCount(text) }))
    .sort((left, right) =>
      right.tokenCount - left.tokenCount || left.index - right.index
    )
    .map(({ text }) => text);
}

/**
 * Three bounded lexical searches: the canonical query plus one exact anchor
 * and one generated keyword plan when both classes are available. If only one
 * class is present, its first two prioritized entries fill the remaining slots.
 */
function selectLexicalTexts(query: RetrievalQuery): string[] {
  const canonical = query.queryText.trim();
  const canonicalKey = canonical.toLowerCase();
  const exactTerms = prioritizeExactTerms(
    normalizeLexicalCandidates(query.exactTerms, new Set([canonicalKey])),
  );
  const exactKeys = new Set(exactTerms.map((term) => term.toLowerCase()));
  const keywordTexts = prioritizeKeywordTexts(
    normalizeLexicalCandidates(
      query.keywordTexts,
      new Set([canonicalKey, ...exactKeys]),
    ),
  );

  if (exactTerms.length > 0 && keywordTexts.length > 0) {
    return [canonical, exactTerms[0]!, keywordTexts[0]!];
  }
  return [canonical, ...(exactTerms.length > 0 ? exactTerms : keywordTexts)]
    .slice(0, MAX_QUERY_VARIANTS);
}

function mergeVariantResults(
  lists: { chunkId: string; score: number }[][],
): { chunkId: string; score: number }[] {
  const bestScores = new Map<string, number>();
  for (const list of lists) {
    for (const item of list) {
      const current = bestScores.get(item.chunkId);
      if (current === undefined || item.score > current) {
        bestScores.set(item.chunkId, item.score);
      }
    }
  }
  return [...bestScores.entries()].map(([chunkId, score]) => ({ chunkId, score }));
}

function hasAuthorizationScope(filter: AdapterFilter, context: AccessContext): boolean {
  return Boolean(
    filter.classification ||
    filter.department ||
    filter.category ||
    context.permissionScopes?.selfOnly,
  );
}

async function scopeProbeFoundTenantCandidate(
  deps: RetrievalServiceDeps,
  query: RetrievalQuery,
  context: AccessContext,
  mergedFilter: AdapterFilter,
  vectors: number[][],
  keywordTexts: string[],
  scopedCandidateIds: ReadonlySet<string>,
): Promise<boolean> {
  if (!hasAuthorizationScope(mergedFilter, context)) return false;

  const probeFilter: AdapterFilter = {
    tenantId: context.tenantId,
    ...(mergedFilter.documentIds ? { documentIds: mergedFilter.documentIds } : {}),
    ...(mergedFilter.documentVersionId
      ? { documentVersionId: mergedFilter.documentVersionId }
      : {}),
  };
  const [vectorProbe, keywordProbe] = await Promise.allSettled([
    Promise.all(vectors.map((vector) => deps.vectorAdapter.search({
      vector,
      topK: query.topK,
      filter: probeFilter,
    }))),
    Promise.all(keywordTexts.map((queryText) => deps.keywordAdapter.search({
      queryText,
      topK: query.topK,
      filter: probeFilter,
    }))),
  ]);
  const probeIds = new Set<string>();
  if (vectorProbe.status === "fulfilled") {
    for (const result of vectorProbe.value) {
      for (const candidate of result) probeIds.add(candidate.chunkId);
    }
  }
  if (keywordProbe.status === "fulfilled") {
    for (const result of keywordProbe.value) {
      for (const candidate of result) probeIds.add(candidate.chunkId);
    }
  }
  const newlyVisibleIds = [...probeIds].filter((id) => !scopedCandidateIds.has(id));
  if (newlyVisibleIds.length === 0) return false;

  // Tenant-scoped hydration prevents cross-tenant adapter hits from affecting
  // authorization provenance. No chunk text or document metadata leaves this
  // internal probe.
  const chunks = await deps.repository.findChunksByIds(context.tenantId, newlyVisibleIds);
  if (chunks.length === 0) return false;
  const documentIds = [...new Set(chunks.map((chunk) => chunk.documentId.toString()))];
  if (deps.findActiveDocumentIds) {
    return (await deps.findActiveDocumentIds(context.tenantId, documentIds)).length > 0;
  }
  if (DocumentModel.db?.readyState === 1) {
    return Boolean(await DocumentModel.exists({
      _id: { $in: documentIds.map((id) => new Types.ObjectId(id)) },
      tenantId: new Types.ObjectId(context.tenantId),
      deletedAt: null,
      isArchived: false,
      status: { $in: ["uploading", "uploaded", "processing", "processed", "reprocessing"] },
    }));
  }
  return true;
}

// ---------------------------------------------------------------------------
// Filter compilation helper
// ---------------------------------------------------------------------------

async function compileFilters(
  deps: RetrievalServiceDeps,
  query: RetrievalQuery,
  context: AccessContext,
): Promise<{ mandatory: AdapterFilter; merged: AdapterFilter }> {
  const mandatory = deps.filterCompiler.compileAccessFilters(context);
  const queryPartial = deps.filterCompiler.compileQueryFilters(query.filter);
  const merged = deps.filterCompiler.mergeFilters(mandatory, queryPartial);
  return { mandatory, merged };
}

// ---------------------------------------------------------------------------
// Evidence bundle builder (optional)
// ---------------------------------------------------------------------------

async function buildEvidenceBundle(
  deps: RetrievalServiceDeps,
  candidates: RetrievalCandidate[],
  queryText: string,
  traceId: string,
): Promise<import("../reranker/reranker.types.js").EvidenceBundle | undefined> {
  if (!deps.rerankerService) return undefined;
  try {
    return await deps.rerankerService.buildEvidenceBundle(candidates, queryText, traceId);
  } catch (error) {
    logger.warn({ error }, "Reranker failed, returning candidates without evidence bundle");
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Audit helper
// ---------------------------------------------------------------------------

async function emitRetrievalAudit(params: {
  action: "RETRIEVAL_SEARCH" | "RETRIEVAL_DENIAL";
  context: AccessContext;
  traceId: string;
  method?: string;
  candidateCount?: number;
  vectorCandidateCount?: number;
  keywordCandidateCount?: number;
  vectorLatencyMs?: number;
  keywordLatencyMs?: number;
  totalLatencyMs?: number;
  outcome?: "SUCCESS" | "DENIED";
  denialReason?: string;
}): Promise<void> {
  try {
    await getAuditWriter().write({
      tenantId: params.context.tenantId,
      resourceType: "Retrieval",
      resourceId: params.traceId,
      action: params.action,
      actorId: params.context.actorId,
      actorEmail: params.context.actorEmail,
      actorRole: params.context.baseRole,
      actorKind: "USER",
      outcome: params.outcome ?? "SUCCESS",
      changes: undefined,
      metadata: {
        traceId: params.traceId,
        method: params.method,
        candidateCount: params.candidateCount,
        vectorCandidateCount: params.vectorCandidateCount,
        keywordCandidateCount: params.keywordCandidateCount,
        vectorLatencyMs: params.vectorLatencyMs,
        keywordLatencyMs: params.keywordLatencyMs,
        totalLatencyMs: params.totalLatencyMs,
        denialReason: params.denialReason,
      },
    });
  } catch {
    // audit failures never block the business transaction
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRetrievalService(
  deps: RetrievalServiceDeps,
): HybridRetrievalService {
  return {
    // ── hybridSearch ──────────────────────────────────────────────────
    async hybridSearch(query, context) {
      const traceId = crypto.randomUUID();
      const totalStartTime = Date.now();

      validateQuery(query);
      const authorizationContext = await resolveAuthorizationContext(deps, context);
      const semanticTexts = uniqueTexts([
        query.queryText,
        ...(query.queryVariants ?? []),
      ]);
      const keywordTexts = selectLexicalTexts(query);
      const vectors = await resolveQueryEmbeddings(deps, query, semanticTexts);
      const { mandatory, merged } = await compileFilters(deps, query, authorizationContext);

      // Run vector + keyword searches (one per query variant) in parallel
      // with individual timing; per-chunk best score wins across variants.
      const vectorStartTime = Date.now();
      const vectorPromise = Promise.all(
        vectors.map((vector) =>
          deps.vectorAdapter.search({
            vector,
            topK: query.topK,
            filter: merged,
          }),
        ),
      )
        .then((results) => ({
          results: mergeVariantResults(results),
          latencyMs: Date.now() - vectorStartTime,
        }));

      const keywordStartTime = Date.now();
      const keywordPromise = Promise.all(
        keywordTexts.map((text) =>
          deps.keywordAdapter.search({
            queryText: text,
            topK: query.topK,
            filter: merged,
          }),
        ),
      )
        .then((results) => ({
          results: mergeVariantResults(results),
          latencyMs: Date.now() - keywordStartTime,
        }));

      const [vectorSettled, keywordSettled] = await Promise.allSettled([
        vectorPromise,
        keywordPromise,
      ]);

      let vectorResults: { chunkId: string; score: number }[] = [];
      let vectorLatencyMs: number | undefined;
      let keywordResults: { chunkId: string; score: number }[] = [];
      let keywordLatencyMs: number | undefined;

      if (vectorSettled.status === "fulfilled") {
        vectorResults = vectorSettled.value.results;
        vectorLatencyMs = vectorSettled.value.latencyMs;
      } else {
        logger.warn(
          { traceId, error: vectorSettled.reason },
          "Vector search failed in hybrid mode",
        );
        vectorLatencyMs = -1;
      }

      if (keywordSettled.status === "fulfilled") {
        keywordResults = keywordSettled.value.results;
        keywordLatencyMs = keywordSettled.value.latencyMs;
      } else {
        logger.warn(
          { traceId, error: keywordSettled.reason },
          "Keyword search failed in hybrid mode",
        );
        keywordLatencyMs = -1;
      }

      // If both backends failed, raise a terminal error
      if (
        vectorSettled.status === "rejected" &&
        keywordSettled.status === "rejected"
      ) {
        throw new AppError(
          503,
          "RETRIEVAL_UNAVAILABLE",
          "All search backends unavailable",
        );
      }

      const rawVectorCandidateCount = vectorResults.length;
      const rawKeywordCandidateCount = keywordResults.length;
      const rawVectorCandidates = vectorResults.map((candidate, index) => ({
        rank: index + 1,
        chunkId: candidate.chunkId,
        score: candidate.score,
      }));
      const rawKeywordCandidates = keywordResults.map((candidate, index) => ({
        rank: index + 1,
        chunkId: candidate.chunkId,
        score: candidate.score,
      }));
      const scopedCandidateIds = new Set([
        ...vectorResults.map((candidate) => candidate.chunkId),
        ...keywordResults.map((candidate) => candidate.chunkId),
      ]);

      const authorizedChunkIds = await authorizeCandidateIds(
        deps,
        authorizationContext,
        [...vectorResults, ...keywordResults],
        traceId,
      );
      vectorResults = retainAuthorized(vectorResults, authorizedChunkIds);
      keywordResults = retainAuthorized(keywordResults, authorizedChunkIds);
      let authorizationFiltered =
        rawVectorCandidateCount > vectorResults.length ||
        rawKeywordCandidateCount > keywordResults.length;

      // Fuse available results
      const fusionStartTime = Date.now();
      const resultsMap = new Map<
        RetrievalMethod,
        { chunkId: string; score: number }[]
      >();
      if (vectorResults.length > 0) resultsMap.set("vector", vectorResults);
      if (keywordResults.length > 0) resultsMap.set("keyword", keywordResults);

      const fused = deps.fusionEngine.fuse(resultsMap);
      const fusionLatencyMs = Date.now() - fusionStartTime;

      // Re-validate and hydrate
      const hydration = await revalidateAndHydrate(
        deps,
        authorizationContext.tenantId,
        fused,
        mandatory,
        authorizationContext,
      );
      authorizationFiltered ||= hydration.authorizationFiltered;
      const finalAuthorization = await reauthorizeFinalCandidates(
        deps,
        authorizationContext,
        hydration.candidates,
        traceId,
      );
      authorizationFiltered ||= finalAuthorization.authorizationFiltered;
      const hydrated = finalAuthorization.candidates;

      if (hydrated.length === 0 && !authorizationFiltered) {
        try {
          authorizationFiltered = await scopeProbeFoundTenantCandidate(
            deps,
            query,
            authorizationContext,
            merged,
            vectors,
            keywordTexts,
            scopedCandidateIds,
          );
        } catch (error) {
          logger.warn({ traceId, error }, "Authorization-scope provenance probe failed");
        }
      }

      const totalLatencyMs = Date.now() - totalStartTime;
      const filterSummary = buildFilterSummary(authorizationContext, query.filter);
      const evidenceBundle = await buildEvidenceBundle(deps, hydrated, query.queryText, traceId);
      const zeroCandidateReason =
        rawVectorCandidateCount + rawKeywordCandidateCount === 0
          ? "NO_RAW_SEARCH_RESULTS"
          : vectorResults.length + keywordResults.length === 0
            ? "NO_AUTHORIZED_CANDIDATES"
            : fused.length === 0
              ? "NO_FUSED_CANDIDATES"
              : hydrated.length === 0
                ? "NO_HYDRATED_CANDIDATES"
                : undefined;
      const diagnostics = buildDiagnostics({
        traceId,
        vectorLatencyMs,
        keywordLatencyMs,
        fusionLatencyMs,
        totalLatencyMs,
        vectorCandidateCount: vectorResults.length,
        keywordCandidateCount: keywordResults.length,
        rawVectorCandidateCount,
        rawKeywordCandidateCount,
        postAuthorizationVectorCandidateCount: vectorResults.length,
        postAuthorizationKeywordCandidateCount: keywordResults.length,
        authorizationFiltered,
        fusedCandidateCount: fused.length,
        hydratedCandidateCount: hydrated.length,
        evidenceItemCount: evidenceBundle?.items.length ?? 0,
        evidenceSufficiency: evidenceBundle?.sufficiency.level,
        zeroCandidateReason,
      });

      try {
        deps.onHybridRetrievalArtifacts?.({
          rawVectorCandidates,
          rawKeywordCandidates,
          postAuthorizationVectorCandidates: vectorResults.map(
            (candidate, index) => ({
              rank: index + 1,
              chunkId: candidate.chunkId,
              score: candidate.score,
            }),
          ),
          postAuthorizationKeywordCandidates: keywordResults.map(
            (candidate, index) => ({
              rank: index + 1,
              chunkId: candidate.chunkId,
              score: candidate.score,
            }),
          ),
          fusedCandidateIds: fused.map((candidate) => candidate.chunkId),
          hydratedCandidateIds: hydrated.map((candidate) => candidate.chunkId),
        });
      } catch {
        // Diagnostics observers are advisory and cannot affect retrieval.
      }

      logger.info(
        {
          traceId,
          rawVectorCandidateCount,
          rawKeywordCandidateCount,
          postAuthorizationVectorCandidateCount: vectorResults.length,
          postAuthorizationKeywordCandidateCount: keywordResults.length,
          fusedCandidateCount: fused.length,
          hydratedCandidateCount: hydrated.length,
          evidenceItemCount: evidenceBundle?.items.length ?? 0,
          evidenceSufficiency: evidenceBundle?.sufficiency.level,
          zeroCandidateReason,
          authorizationFiltered,
        },
        "Hybrid retrieval stage counts",
      );

      if (deps.persistenceMode !== "ephemeral") void emitRetrievalAudit({
        action: "RETRIEVAL_SEARCH",
        context: authorizationContext,
        traceId,
        method: "hybrid",
        candidateCount: hydrated.length,
        vectorCandidateCount: vectorResults.length,
        keywordCandidateCount: keywordResults.length,
        vectorLatencyMs,
        keywordLatencyMs,
        totalLatencyMs,
      });

      return {
        candidates: hydrated,
        totalCandidates: hydrated.length,
        filterSummary,
        diagnostics,
        evidenceBundle,
      };
    },

    // ── vectorSearch ─────────────────────────────────────────────────
    async vectorSearch(query, context) {
      const traceId = crypto.randomUUID();
      const totalStartTime = Date.now();

      validateQuery(query);
      const authorizationContext = await resolveAuthorizationContext(deps, context);
      const vector = await resolveQueryEmbedding(deps, query);
      const { mandatory, merged } = await compileFilters(deps, query, authorizationContext);

      // Run vector search only
      const vectorStartTime = Date.now();
      let vectorResults: { chunkId: string; score: number }[];
      try {
        vectorResults = await deps.vectorAdapter.search({
          vector,
          topK: query.topK,
          filter: merged,
        });
      } catch (error) {
        logger.warn({ traceId, error }, "Vector search failed");
        throw new AppError(
          503,
          "RETRIEVAL_UNAVAILABLE",
          "Vector search backend unavailable",
        );
      }
      const vectorLatencyMs = Date.now() - vectorStartTime;
      const authorizedChunkIds = await authorizeCandidateIds(deps, authorizationContext, vectorResults, traceId);
      vectorResults = retainAuthorized(vectorResults, authorizedChunkIds);

      // Passthrough via fusion engine (single-strategy fast path)
      const fusionStartTime = Date.now();
      const resultsMap = new Map<
        RetrievalMethod,
        { chunkId: string; score: number }[]
      >();
      resultsMap.set("vector", vectorResults);
      const fused = deps.fusionEngine.fuse(resultsMap);
      const fusionLatencyMs = Date.now() - fusionStartTime;

      // Re-validate and hydrate
      const hydration = await revalidateAndHydrate(
        deps,
        authorizationContext.tenantId,
        fused,
        mandatory,
        authorizationContext,
      );
      const finalAuthorization = await reauthorizeFinalCandidates(
        deps,
        authorizationContext,
        hydration.candidates,
        traceId,
      );
      const hydrated = finalAuthorization.candidates;

      const totalLatencyMs = Date.now() - totalStartTime;
      const filterSummary = buildFilterSummary(authorizationContext, query.filter);
      const diagnostics = buildDiagnostics({
        traceId,
        vectorLatencyMs,
        fusionLatencyMs,
        totalLatencyMs,
        vectorCandidateCount: vectorResults.length,
        keywordCandidateCount: 0,
      });

      const evidenceBundle = await buildEvidenceBundle(deps, hydrated, query.queryText, traceId);

      if (deps.persistenceMode !== "ephemeral") void emitRetrievalAudit({
        action: "RETRIEVAL_SEARCH",
        context: authorizationContext,
        traceId,
        method: "vector",
        candidateCount: hydrated.length,
        vectorCandidateCount: vectorResults.length,
        vectorLatencyMs,
        totalLatencyMs,
      });

      return {
        candidates: hydrated,
        totalCandidates: hydrated.length,
        filterSummary,
        diagnostics,
        evidenceBundle,
      };
    },

    // ── keywordSearch ────────────────────────────────────────────────
    async keywordSearch(query, context) {
      const traceId = crypto.randomUUID();
      const totalStartTime = Date.now();

      validateQuery(query);
      const authorizationContext = await resolveAuthorizationContext(deps, context);
      const { mandatory, merged } = await compileFilters(deps, query, authorizationContext);

      // Run keyword search only
      const keywordStartTime = Date.now();
      let keywordResults: { chunkId: string; score: number }[];
      try {
        keywordResults = await deps.keywordAdapter.search({
          queryText: query.queryText,
          topK: query.topK,
          filter: merged,
        });
      } catch (error) {
        logger.warn({ traceId, error }, "Keyword search failed");
        throw new AppError(
          503,
          "RETRIEVAL_UNAVAILABLE",
          "Keyword search backend unavailable",
        );
      }
      const keywordLatencyMs = Date.now() - keywordStartTime;
      const authorizedChunkIds = await authorizeCandidateIds(deps, authorizationContext, keywordResults, traceId);
      keywordResults = retainAuthorized(keywordResults, authorizedChunkIds);

      // Passthrough via fusion engine (single-strategy fast path)
      const fusionStartTime = Date.now();
      const resultsMap = new Map<
        RetrievalMethod,
        { chunkId: string; score: number }[]
      >();
      resultsMap.set("keyword", keywordResults);
      const fused = deps.fusionEngine.fuse(resultsMap);
      const fusionLatencyMs = Date.now() - fusionStartTime;

      // Re-validate and hydrate
      const hydration = await revalidateAndHydrate(
        deps,
        authorizationContext.tenantId,
        fused,
        mandatory,
        authorizationContext,
      );
      const finalAuthorization = await reauthorizeFinalCandidates(
        deps,
        authorizationContext,
        hydration.candidates,
        traceId,
      );
      const hydrated = finalAuthorization.candidates;

      const totalLatencyMs = Date.now() - totalStartTime;
      const filterSummary = buildFilterSummary(authorizationContext, query.filter);
      const diagnostics = buildDiagnostics({
        traceId,
        keywordLatencyMs,
        fusionLatencyMs,
        totalLatencyMs,
        vectorCandidateCount: 0,
        keywordCandidateCount: keywordResults.length,
      });

      const evidenceBundle = await buildEvidenceBundle(deps, hydrated, query.queryText, traceId);

      if (deps.persistenceMode !== "ephemeral") void emitRetrievalAudit({
        action: "RETRIEVAL_SEARCH",
        context: authorizationContext,
        traceId,
        method: "keyword",
        candidateCount: hydrated.length,
        keywordCandidateCount: keywordResults.length,
        keywordLatencyMs,
        totalLatencyMs,
      });

      return {
        candidates: hydrated,
        totalCandidates: hydrated.length,
        filterSummary,
        diagnostics,
        evidenceBundle,
      };
    },
  };
}
