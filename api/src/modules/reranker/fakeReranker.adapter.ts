import type { RerankerAdapter, RerankRequest, RerankResponse } from "./reranker.types.js";
import { retrievalRelevanceOf, runRerankPipeline } from "./rerankPipeline.js";

/**
 * FakeRerankerAdapter — deterministic retrieval-relevance reranker.
 *
 * Supplies retrieval relevance as the semantic signal and defers every other
 * step to {@link runRerankPipeline}: MMR diversity, conflict detection, token
 * budgeting, deduplication, and sufficiency assessment.
 *
 * It adds no semantic signal of its own, so its ranking is exactly retrieval's
 * ranking: the embedding similarity the vector leg already measured, as
 * normalized by the fusion engine. That is why it is the default provider.
 * A network cross-encoder was measured against it on the indexed corpus and
 * did not rank better - its sharply peaked score
 * distribution reordered the head without improving it, while adding a network
 * round trip per query - so paying for a second model buys nothing here.
 *
 * What it genuinely cannot do is bridge a vocabulary gap the *embedding* also
 * missed. It does not have the cruder keyword-overlap failure mode it once
 * had: exact-term overlap is now a 0.1 tie-breaker rather than a 0.3 ranking
 * term (see {@link runRerankPipeline}), so a page documenting
 * `apt-get install mariadb-server` is no longer out-ranked by pages that merely
 * repeat the question's words.
 */
export class FakeRerankerAdapter implements RerankerAdapter {
  readonly providerKey = "fake";
  readonly runtimeIdentity = Object.freeze({ provider: "fake", model: "deterministic-reranker", modelRevisionStatus: "unavailable" as const, componentVersion: "deterministic-reranker-v1" });

  async rerank(request: RerankRequest): Promise<RerankResponse> {
    return runRerankPipeline(
      request,
      request.candidates.map((candidate) => retrievalRelevanceOf(candidate)),
    );
  }
}
