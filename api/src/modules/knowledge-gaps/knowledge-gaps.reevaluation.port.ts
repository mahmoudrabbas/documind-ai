import type { ReevaluationResultOutcome } from "../../db/models/gapReevaluation.model.js";

export interface ReevaluationInput {
  tenantId: string;
  gapId: string;
  question: string;
  documentId: string;
  evaluatedBy?: string;
}

export interface ReevaluationResult {
  outcome: ReevaluationResultOutcome;
  evidenceBefore?: Record<string, unknown>;
  evidenceAfter?: Record<string, unknown>;
  notes?: string;
}

export interface KnowledgeGapReevaluationPort {
  evaluateGapResolution(input: ReevaluationInput): Promise<ReevaluationResult>;
}

export class FakeKnowledgeGapReevaluationAdapter implements KnowledgeGapReevaluationPort {
  async evaluateGapResolution(input: ReevaluationInput): Promise<ReevaluationResult> {
    // Fake logic: if question or docId contains 'fail', return not_improved, else improved
    const text = `${input.question} ${input.documentId}`.toLowerCase();
    if (text.includes("fail") || text.includes("unresolved")) {
      return {
        outcome: "not_improved",
        evidenceBefore: { status: "unanswered", retrievalScore: 0.12 },
        evidenceAfter: { status: "unanswered", retrievalScore: 0.25 },
        notes: "Document did not contain relevant answers to the gap question during test retrieval.",
      };
    }

    return {
      outcome: "improved",
      evidenceBefore: { status: "unanswered", retrievalScore: 0.15 },
      evidenceAfter: { status: "answered", retrievalScore: 0.92, matchedChunks: 3 },
      notes: "Test retrieval verified high confidence coverage with new/reprocessed document content.",
    };
  }
}
