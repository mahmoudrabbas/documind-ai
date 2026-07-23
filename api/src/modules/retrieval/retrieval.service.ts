import crypto from "node:crypto";
import { AppError } from "../../common/errors/AppError.js";
import { logger } from "../../common/logger/logger.js";
import { getAuditWriter } from "../../common/observability/index.js";
import type { AdapterFilter } from "../../providers/embedding/adapterFilter.types.js";
import type { VectorStoreAdapter } from "../../providers/embedding/vectorStoreAdapter.js";
import type { KeywordAdapter } from "../../providers/embedding/keywordAdapter.js";
import type { EmbeddingAdapter } from "../agents/agents.types.js";
import type { DocumentChunkDocument } from "../../db/models/documentChunk.model.js";
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
): Promise<RetrievalCandidate[]> {
  if (candidates.length === 0) return [];

  const chunkIds = candidates.map((c) => c.chunkId);
  const chunks = await deps.repository.findChunksByIds(tenantId, chunkIds);
  const chunkMap = new Map<string, DocumentChunkDocument>();
  for (const chunk of chunks) {
    chunkMap.set(chunk._id.toString(), chunk);
  }

  const hydrated: RetrievalCandidate[] = [];

  for (const candidate of candidates) {
    const chunk = chunkMap.get(candidate.chunkId);
    if (!chunk) continue;

    // Re-validate: allowAiUse must be true
    if (chunk.allowAiUse === false) continue;

    // Re-validate: classification must be in the mandatory filter's allowed set
    if (mandatoryFilter.classification) {
      const allowedSet = mandatoryFilter.classification.$in;
      if (!allowedSet.includes(chunk.classification)) continue;
    }

    // Hydrate from the DB document
    hydrated.push({
      ...candidate,
      documentId: chunk.documentId.toString(),
      documentVersionId: chunk.documentVersionId.toString(),
      tenantId: chunk.tenantId.toString(),
      text: chunk.text,
      pageNumber: chunk.pageNumber ?? undefined,
      sectionTitle: chunk.sectionTitle ?? undefined,
      classification: chunk.classification,
    });
  }

  return hydrated;
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
      const vector = await resolveQueryEmbedding(deps, query);
      const { mandatory, merged } = await compileFilters(deps, query, context);

      // Run vector + keyword search in parallel with individual timing
      const vectorStartTime = Date.now();
      const vectorPromise = deps.vectorAdapter
        .search({ vector, topK: query.topK, filter: merged })
        .then((results) => ({ results, latencyMs: Date.now() - vectorStartTime }));

      const keywordStartTime = Date.now();
      const keywordPromise = deps.keywordAdapter
        .search({
          queryText: query.queryText,
          topK: query.topK,
          filter: merged,
        })
        .then((results) => ({ results, latencyMs: Date.now() - keywordStartTime }));

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
        context.tenantId,
        fused,
        mandatory,
      );

      const totalLatencyMs = Date.now() - totalStartTime;
      const filterSummary = buildFilterSummary(context, query.filter);
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
        context,
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
      const vector = await resolveQueryEmbedding(deps, query);
      const { mandatory, merged } = await compileFilters(deps, query, context);

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
        context.tenantId,
        fused,
        mandatory,
      );

      const totalLatencyMs = Date.now() - totalStartTime;
      const filterSummary = buildFilterSummary(context, query.filter);
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
        context,
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
      const { mandatory, merged } = await compileFilters(deps, query, context);

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
        context.tenantId,
        fused,
        mandatory,
      );

      const totalLatencyMs = Date.now() - totalStartTime;
      const filterSummary = buildFilterSummary(context, query.filter);
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
        context,
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
