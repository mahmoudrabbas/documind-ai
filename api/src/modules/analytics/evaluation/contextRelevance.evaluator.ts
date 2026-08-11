import type {
  ContextRelevanceResult,
  RetrievalLevelMetrics,
} from "./evaluation.schemas.js";

export interface RetrievedEvaluationItem {
  documentId: string;
  chunkId?: string;
  authorized: boolean;
  authorizationReasonCode?: string;
}

export interface ContextRelevanceEvaluationInput {
  retrieved: readonly RetrievedEvaluationItem[];
  relevantDocumentIds?: readonly string[];
  relevantChunkIds?: readonly string[];
  k?: number;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function evaluateLevel(
  retrievedIds: readonly string[],
  relevantIdsInput: readonly string[] | undefined,
  k: number,
): RetrievalLevelMetrics {
  const relevantIds = unique(relevantIdsInput ?? []);
  const hasLabels = relevantIdsInput !== undefined && relevantIds.length > 0;
  const retrieved = unique(retrievedIds).slice(0, k);

  if (!hasLabels) {
    return {
      evaluated: false,
      k,
      retrievedIds: retrieved,
      relevantIds,
      hits: [],
      falsePositives: [],
      misses: [],
      precision: null,
      recall: null,
      reciprocalRank: null,
      hit: null,
    };
  }

  const relevant = new Set(relevantIds);
  const hits = retrieved.filter((id) => relevant.has(id));
  const falsePositives = retrieved.filter((id) => !relevant.has(id));
  const retrievedSet = new Set(retrieved);
  const misses = relevantIds.filter((id) => !retrievedSet.has(id));
  const firstRelevantRank = retrieved.findIndex((id) => relevant.has(id));

  return {
    evaluated: true,
    k,
    retrievedIds: retrieved,
    relevantIds,
    hits,
    falsePositives,
    misses,
    precision: retrieved.length > 0 ? hits.length / retrieved.length : 0,
    recall: hits.length / relevantIds.length,
    reciprocalRank: firstRelevantRank >= 0 ? 1 / (firstRelevantRank + 1) : 0,
    hit: hits.length > 0,
  };
}

/**
 * Deterministic relevance evaluator over already-produced retrieval results.
 * It never performs retrieval and has no production authorization capability.
 * Unauthorized results remain explicit hard-security findings and are excluded
 * from ordinary relevance classification rather than becoming false positives.
 */
export class ContextRelevanceEvaluator {
  evaluate(input: ContextRelevanceEvaluationInput): ContextRelevanceResult {
    const k = Math.max(0, Math.floor(input.k ?? input.retrieved.length));
    const bounded = input.retrieved.slice(0, k);
    // Security applies to every supplied retrieval result, even results beyond
    // the metric cutoff. K changes relevance math, never invariant coverage.
    const authorizationViolations = input.retrieved.flatMap((item, index) =>
      item.authorized
        ? []
        : [
            {
              rank: index + 1,
              documentId: item.documentId,
              ...(item.chunkId ? { chunkId: item.chunkId } : {}),
              reasonCode:
                item.authorizationReasonCode ?? "UNAUTHORIZED_RETRIEVAL_RESULT",
            },
          ],
    );
    const authorized = bounded.filter((item) => item.authorized);

    return {
      document: evaluateLevel(
        authorized.map((item) => item.documentId),
        input.relevantDocumentIds,
        k,
      ),
      chunk: evaluateLevel(
        authorized.flatMap((item) => (item.chunkId ? [item.chunkId] : [])),
        input.relevantChunkIds,
        k,
      ),
      authorizationInvariantPassed: authorizationViolations.length === 0,
      authorizationViolations,
    };
  }
}
