/**
 * Shared types for the LLM-as-a-Judge evaluation flow.
 *
 * Judge evaluations are derived aggregates: only scores, status, provider
 * identifiers and timestamps are persisted. Raw prompts, provider outputs and
 * evidence text are never stored.
 */

export const JUDGE_EVALUATION_SCHEMA_VERSION = "judge-v1";

export const JUDGE_WEIGHTS = {
  faithfulness: 0.5,
  relevancy: 0.3,
  coherence: 0.2,
} as const;

export const JUDGE_MAX_TOKENS = 300;

/** Deterministic evidence budget applied to persisted assistant sources. */
export const JUDGE_EVIDENCE_LIMITS = {
  maxChunks: 5,
  maxCharsPerChunk: 2000,
  maxTotalChars: 8000,
} as const;

export interface JudgeEvidence {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  sectionTitle?: string;
  pageNumber?: number;
  text: string;
}

export interface JudgePromptInput {
  question: string;
  answer: string;
  evidence: JudgeEvidence[];
}

/**
 * Result of parsing the provider output. `null` marks a score that could not
 * be extracted (missing, malformed, out-of-domain), so the caller can fall
 * back to the neutral 0.5 and mark the evaluation `degraded`.
 */
export interface ParsedJudgeScores {
  faithfulness: number | null;
  relevancy: number | null;
  coherence: number | null;
}

export interface JudgeOutcome {
  status: "completed" | "degraded" | "failed";
  scores: { faithfulness: number; relevancy: number; coherence: number; overall: number };
  provider: string;
  model: string;
  errorCode: string | null;
}
