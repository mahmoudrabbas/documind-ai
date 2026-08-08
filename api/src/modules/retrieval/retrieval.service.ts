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
  resolveAccessContext: (context: AccessContext) => Promise<AccessContext>;
  authorizeDocumentForAi: (context: AccessContext, documentId: string) => Promise<void>;
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
): Promise<RetrievalCandidate[]> {
  if (candidates.length === 0) return [];

  const chunkIds = candidates.map((c) => c.chunkId);
  const chunks = await deps.repository.findChunksByIds(tenantId, chunkIds);
  const chunkMap = new Map<string, DocumentChunkDocument>();
  for (const chunk of chunks) {
    chunkMap.set(chunk._id.toString(), chunk);
  }

  // selfOnly enforcement: fetch parent documents and check ownership
  let ownedDocumentIds: Set<string> | null = null;
  if (context?.permissionScopes?.selfOnly) {
    const docIds = [...new Set(chunks.map((c) => c.documentId.toString()))];
    if (docIds.length > 0) {
      if (deps.findOwnedDocumentIds) {
        const owned = await deps.findOwnedDocumentIds(tenantId, context.actorId, docIds);
        ownedDocumentIds = new Set(owned);
      } else {
        const docs = await DocumentModel.find({
          _id: { $in: docIds.map((id) => new Types.ObjectId(id)) },
          tenantId: new Types.ObjectId(tenantId),
          uploadedBy: new Types.ObjectId(context.actorId),
        }, { _id: 1 }).lean().exec();
        ownedDocumentIds = new Set(docs.map((d) => d._id.toString()));
      }
    }
  }

  const hydrated: RetrievalCandidate[] = [];

  for (const candidate of candidates) {
    const chunk = chunkMap.get(candidate.chunkId);
    if (!chunk) continue;

    // Re-validate: classification must be in the mandatory filter's allowed set
    if (mandatoryFilter.classification) {
      const allowedSet = mandatoryFilter.classification.$in;
      if (chunk.classification && !allowedSet.includes(chunk.classification)) continue;
    }

    // Re-validate: department must be in the mandatory filter's allowed set
    if (mandatoryFilter.department) {
      const allowedSet = mandatoryFilter.department.$in;
      if (chunk.department && !allowedSet.includes(chunk.department)) continue;
    }

    // Re-validate: category must be in the mandatory filter's allowed set
    if (mandatoryFilter.category) {
      const allowedSet = mandatoryFilter.category.$in;
      if (chunk.category && !allowedSet.includes(chunk.category)) continue;
    }

    // selfOnly enforcement: skip chunks from documents not owned by the actor
    if (ownedDocumentIds !== null) {
      if (!ownedDocumentIds.has(chunk.documentId.toString())) continue;
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

  return hydrated;
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
      const keywordTexts = uniqueTexts([
        query.queryText,
        ...(query.keywordTexts ?? []),
      ]);
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

      const authorizedChunkIds = await authorizeCandidateIds(
        deps,
        authorizationContext,
        [...vectorResults, ...keywordResults],
        traceId,
      );
      vectorResults = retainAuthorized(vectorResults, authorizedChunkIds);
      keywordResults = retainAuthorized(keywordResults, authorizedChunkIds);

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
      const hydrated = await revalidateAndHydrate(
        deps,
        authorizationContext.tenantId,
        fused,
        mandatory,
        authorizationContext,
      );

      const totalLatencyMs = Date.now() - totalStartTime;
      const filterSummary = buildFilterSummary(authorizationContext, query.filter);
      const diagnostics = buildDiagnostics({
        traceId,
        vectorLatencyMs,
        keywordLatencyMs,
        fusionLatencyMs,
        totalLatencyMs,
        vectorCandidateCount: vectorResults.length,
        keywordCandidateCount: keywordResults.length,
      });

      const evidenceBundle = await buildEvidenceBundle(deps, hydrated, query.queryText, traceId);

      void emitRetrievalAudit({
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
      const hydrated = await revalidateAndHydrate(
        deps,
        authorizationContext.tenantId,
        fused,
        mandatory,
        authorizationContext,
      );

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

      void emitRetrievalAudit({
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
      const hydrated = await revalidateAndHydrate(
        deps,
        authorizationContext.tenantId,
        fused,
        mandatory,
        authorizationContext,
      );

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

      void emitRetrievalAudit({
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
