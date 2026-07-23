import { logger } from "../../common/logger/logger.js";
import type { MetricRecorder } from "../../common/observability/metricRecorder.js";
import type { RetrievalCandidate } from "../retrieval/retrieval.types.js";
import type {
  RerankerAdapter,
  RerankerConfig,
  EvidenceBundle,
  RerankRequest,
} from "./reranker.types.js";
import { DEFAULT_RERANKER_CONFIG } from "./reranker.types.js";
import { recordRerankerMetrics } from "./reranker.metrics.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface RerankerServiceDeps {
  reranker: RerankerAdapter;
  config?: Partial<RerankerConfig>;
  metrics?: MetricRecorder;
}

export interface RerankerService {
  buildEvidenceBundle(
    candidates: RetrievalCandidate[],
    queryText: string,
    traceId?: string,
  ): Promise<EvidenceBundle>;
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Fallback bundle (deterministic, used when adapter throws)
// ---------------------------------------------------------------------------

function buildFallbackBundle(
  candidates: RetrievalCandidate[],
): EvidenceBundle {
  const items = candidates.map((candidate, rank) => ({
    rank: rank + 1,
    candidate,
    scoreBreakdown: {
      fusionScore: candidate.score,
      rerankScore: 0,
      semanticScore: candidate.score,
      exactTermScore: 0,
      sourceAuthorityScore: 0,
      versionPreferenceScore: 0,
      totalScore: candidate.score,
    },
    citationAnchor: {
      chunkId: candidate.chunkId,
      documentId: candidate.documentId,
      documentVersionId: candidate.documentVersionId,
      pageNumber: candidate.pageNumber,
      sectionTitle: candidate.sectionTitle,
    },
    textExcerpt: candidate.text,
    expanded: false,
    neighborChunkIds: [],
  }));

  let totalTokenCount = 0;
  for (const item of items) {
    totalTokenCount += estimateTokens(item.textExcerpt);
  }

  return {
    items,
    totalTokenCount,
    maxTokenCount: 0,
    inputCandidateCount: candidates.length,
    conflictGroups: [],
    sufficiency: {
      level: "WEAK",
      reasons: ["Reranker fallback: evidence returned without reranking"],
    },
    scoreExplanation: "Fallback: reranker unavailable, returning raw candidates",
    accessPolicyVersion: "1.0.0",
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRerankerService(
  deps: RerankerServiceDeps,
): RerankerService {
  const config: RerankerConfig = {
    ...DEFAULT_RERANKER_CONFIG,
    ...deps.config,
  };

  return {
    async buildEvidenceBundle(
      candidates: RetrievalCandidate[],
      queryText: string,
      traceId = "unknown",
    ): Promise<EvidenceBundle> {
      const startTime = Date.now();
      let fallbackUsed = false;

      const request: RerankRequest = {
        candidates,
        queryText,
        maxItems: config.maxItems,
        maxTokenBudget: config.maxTokenBudget,
      };

      let bundle: EvidenceBundle;

      try {
        const response = await deps.reranker.rerank(request);

        let totalTokenCount = 0;
        for (const item of response.items) {
          totalTokenCount += estimateTokens(item.textExcerpt);
        }

        bundle = {
          items: response.items,
          totalTokenCount,
          maxTokenCount: config.maxTokenBudget,
          inputCandidateCount: candidates.length,
          conflictGroups: response.conflictGroups,
          sufficiency: response.sufficiency,
          scoreExplanation: response.scoreExplanation,
          accessPolicyVersion: "1.0.0",
          createdAt: new Date().toISOString(),
        };

        if (response.fallbackUsed) {
          fallbackUsed = true;
        }
      } catch (error) {
        fallbackUsed = true;
        logger.warn(
          { error, providerKey: deps.reranker.providerKey, traceId },
          "Reranker adapter failed, using fallback bundle",
        );
        bundle = buildFallbackBundle(candidates);
      }

      const latencyMs = Date.now() - startTime;

      // ── Structured log ─────────────────────────────────────────────
      logger.info(
        {
          rerankerProvider: deps.reranker.providerKey,
          inputCandidateCount: candidates.length,
          outputItemCount: bundle.items.length,
          conflictGroupCount: bundle.conflictGroups.length,
          sufficiencyLevel: bundle.sufficiency.level,
          totalTokenCount: bundle.totalTokenCount,
          fallbackUsed,
          latencyMs,
          traceId,
        },
        "Reranker: evidence bundle built",
      );

      // ── Prometheus metrics ─────────────────────────────────────────
      if (deps.metrics) {
        recordRerankerMetrics(deps.metrics, {
          providerKey: deps.reranker.providerKey,
          inputCandidateCount: candidates.length,
          outputItemCount: bundle.items.length,
          bundle,
          latencyMs,
          fallbackUsed,
          traceId,
        });
      }

      return bundle;
    },
  };
}
