import { logger } from "../../common/logger/logger.js";
import type { RetrievalCandidate } from "../retrieval/retrieval.types.js";
import type {
  RerankerAdapter,
  RerankerConfig,
  EvidenceBundle,
  RerankRequest,
} from "./reranker.types.js";
import { DEFAULT_RERANKER_CONFIG } from "./reranker.types.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface RerankerServiceDeps {
  reranker: RerankerAdapter;
  config?: Partial<RerankerConfig>;
}

export interface RerankerService {
  buildEvidenceBundle(
    candidates: RetrievalCandidate[],
    queryText: string,
  ): Promise<EvidenceBundle>;
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
    ): Promise<EvidenceBundle> {
      const startTime = Date.now();

      const request: RerankRequest = {
        candidates,
        queryText,
        maxItems: config.maxItems,
        maxTokenBudget: config.maxTokenBudget,
      };

      const response = await deps.reranker.rerank(request);

      let totalTokenCount = 0;
      for (const item of response.items) {
        totalTokenCount += estimateTokens(item.textExcerpt);
      }

      const bundle: EvidenceBundle = {
        items: response.items,
        totalTokenCount,
        maxTokenCount: config.maxTokenBudget,
        conflictGroups: response.conflictGroups,
        sufficiency: response.sufficiency,
        scoreExplanation: response.scoreExplanation,
        accessPolicyVersion: "1.0.0",
        createdAt: new Date().toISOString(),
      };

      const latencyMs = Date.now() - startTime;
      logger.info(
        {
          rerankerProvider: deps.reranker.providerKey,
          inputCandidateCount: candidates.length,
          outputItemCount: bundle.items.length,
          conflictGroupCount: bundle.conflictGroups.length,
          sufficiencyLevel: bundle.sufficiency.level,
          totalTokenCount: bundle.totalTokenCount,
          latencyMs,
        },
        "Reranker: evidence bundle built",
      );

      return bundle;
    },
  };
}
