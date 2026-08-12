import type { LlmJudgeService } from "../llmJudge.service.js";
import type { JudgeEvidence, JudgeOutcome } from "../llmJudge.types.js";
import {
  AnswerRelevanceEvaluationResultSchema,
  type AnswerRelevanceEvaluationResult,
  type RagActualOutcome,
  type RagExpectedOutcome,
} from "./evaluation.schemas.js";

export interface AnswerRelevanceJudge {
  evaluate(input: {
    question: string;
    answer: string;
    evidence: JudgeEvidence[];
  }): Promise<JudgeOutcome>;
}

export interface AnswerRelevanceEvaluationInput {
  question: string;
  finalAnswer: string;
  evidence: JudgeEvidence[];
  expectedOutcome: RagExpectedOutcome;
  actualOutcome: RagActualOutcome;
  fullyGrounded: boolean;
}

export interface AnswerRelevanceEvaluatorOptions {
  relevanceThreshold?: number;
}

export const DEFAULT_ANSWER_RELEVANCE_THRESHOLD = 0.7;

export class AnswerRelevanceEvaluator {
  private readonly threshold: number;

  constructor(
    private readonly judge: Pick<LlmJudgeService, "evaluate"> | AnswerRelevanceJudge,
    options: AnswerRelevanceEvaluatorOptions = {},
  ) {
    this.threshold = options.relevanceThreshold ?? DEFAULT_ANSWER_RELEVANCE_THRESHOLD;
    if (this.threshold < 0 || this.threshold > 1) {
      throw new Error("Answer relevance threshold must be between 0 and 1");
    }
  }

  async evaluate(input: AnswerRelevanceEvaluationInput): Promise<AnswerRelevanceEvaluationResult> {
    const outcomeCorrect = input.actualOutcome === input.expectedOutcome;
    let judge: JudgeOutcome;
    try {
      judge = await this.judge.evaluate({
        question: input.question,
        answer: input.finalAnswer,
        evidence: input.evidence,
      });
    } catch {
      return AnswerRelevanceEvaluationResultSchema.parse({
        evaluated: false,
        score: null,
        relevant: null,
        threshold: this.threshold,
        classification: "evaluation_unavailable",
        expectedOutcome: input.expectedOutcome,
        actualOutcome: input.actualOutcome,
        outcomeCorrect,
        judgeStatus: "failed",
        errorCode: "ANSWER_RELEVANCE_JUDGE_FAILED",
      });
    }

    const evaluated = judge.status === "completed";
    const score = evaluated ? judge.scores.relevancy : null;
    const relevant = score === null ? null : score >= this.threshold;

    return AnswerRelevanceEvaluationResultSchema.parse({
      evaluated,
      score,
      relevant,
      threshold: this.threshold,
      classification: this.classify(input, outcomeCorrect, relevant),
      expectedOutcome: input.expectedOutcome,
      actualOutcome: input.actualOutcome,
      outcomeCorrect,
      judgeStatus: judge.status,
      judgeProvider: judge.provider,
      judgeModel: judge.model,
      errorCode: judge.errorCode,
    });
  }

  private classify(
    input: AnswerRelevanceEvaluationInput,
    outcomeCorrect: boolean,
    relevant: boolean | null,
  ): AnswerRelevanceEvaluationResult["classification"] {
    if (input.actualOutcome === "error") return "evaluation_unavailable";
    if (input.actualOutcome === "refuse") {
      return outcomeCorrect ? "correct_refusal" : "incorrect_refusal";
    }
    if (input.actualOutcome === "clarify") {
      return outcomeCorrect && relevant === true
        ? "correct_clarification"
        : "irrelevant_clarification";
    }
    if (
      input.actualOutcome === "source_less_assistant" ||
      input.actualOutcome === "source_less_social"
    ) {
      return outcomeCorrect && relevant === true
        ? "correct_source_less_response"
        : "incorrect_source_less_response";
    }
    if (relevant === null) return "evaluation_unavailable";
    if (relevant && input.fullyGrounded) return "relevant_grounded_answer";
    if (!relevant && input.fullyGrounded) return "grounded_but_irrelevant_answer";
    return relevant ? "relevant_ungrounded_answer" : "irrelevant_answer";
  }
}
