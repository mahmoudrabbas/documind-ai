import { logger } from "../../../common/logger/logger.js";
import type {
  KnowledgeGapPort,
  KnowledgeGapCandidate,
} from "../../answer-pipeline/answerPipeline.types.js";

export class FakeKnowledgeGapAdapter implements KnowledgeGapPort {
  readonly candidates: KnowledgeGapCandidate[] = [];

  async emitCandidate(candidate: KnowledgeGapCandidate): Promise<void> {
    this.candidates.push(candidate);
    logger.info(
      {
        outcome: candidate.outcome,
        language: candidate.language,
        traceId: candidate.traceId,
      },
      "FakeKnowledgeGapAdapter: candidate emitted",
    );
  }

  getCandidates(): readonly KnowledgeGapCandidate[] {
    return this.candidates;
  }

  reset(): void {
    this.candidates.length = 0;
  }
}
