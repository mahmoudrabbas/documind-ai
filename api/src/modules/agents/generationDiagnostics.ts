import type { AnswerWriterServiceResult } from "./answerWriter.service.js";
import type {
  CitationVerifierInput,
  CitationVerifierOutput,
} from "./chatAgentIO.js";
import type { ChatAnswerDecisionValue } from "./chatWorkflowContracts.js";

/**
 * Issue 6 diagnostic observability — metadata only, never content.
 *
 * These builders convert the shared services' inputs/outputs into the exact
 * privacy-safe field sets the runtime logs. They must never emit: answer
 * text, raw model output, document text, chunk ids, document ids, or API
 * keys. The only identifiers are opaque decision/reason-code enums; everything
 * else is a boolean or a count.
 *
 * The two logs are designed to be correlated per chat turn to distinguish:
 *   A) the answer-writer produced valid structured output but citation
 *      verification rejected/downgraded it (answer-writer diagnostics show
 *      structured:true, citation diagnostics show verified:false or a partial
 *      rejection), from
 *   B) answer-writer structured parsing itself failed closed before citation
 *      verification ever validated anything (answer-writer diagnostics show
 *      structured:false and the parse-failure fallback decision, citation
 *      diagnostics show CITATIONS_SKIPPED).
 */

// ── AnswerWriterService / ChatService integration ───────────────────────────

export interface AnswerWriterDiagnostics {
  /** Generation outcome reported by AnswerWriterService. */
  outcome: AnswerWriterServiceResult["outcome"];
  /** true iff the model output parsed as a valid contract JSON object. null when unusable. */
  structured: boolean | null;
  /** The decision the model declared, before normalization. null when unusable. */
  parsedDecision: ChatAnswerDecisionValue | null;
  /** The normalized decision after fail-closed downgrades. null when unusable. */
  normalizedDecision: ChatAnswerDecisionValue | null;
  /** Count of cited chunk ids that survived evidence filtering. null when unusable. */
  citedChunkCount: number | null;
}

export function buildAnswerWriterDiagnostics(
  result: AnswerWriterServiceResult,
): AnswerWriterDiagnostics {
  if (result.outcome === "unusable") {
    return {
      outcome: "unusable",
      structured: null,
      parsedDecision: null,
      normalizedDecision: null,
      citedChunkCount: null,
    };
  }
  return {
    outcome: "usable",
    structured: result.structured,
    parsedDecision: result.parsedDecision,
    normalizedDecision: result.decision,
    citedChunkCount: result.citedChunkIds.length,
  };
}

// ── CitationVerificationService consumption ─────────────────────────────────

export interface CitationVerificationDiagnostics {
  /** The decision the verifier was asked to validate. */
  inputDecision: ChatAnswerDecisionValue;
  /** Count of cited chunk ids the verifier received. */
  citedCount: number;
  /** Count of approved-evidence ids the verifier compared against. */
  approvedEvidenceCount: number;
  /** Whether the cited claims survived verification (false forces a downgrade). */
  verified: boolean;
  /** Count of validated citation ids in the output. */
  validatedCount: number;
  /** Count of rejected citation ids in the output. */
  rejectedCount: number;
  /** Deterministic outcome code. */
  reasonCode: CitationVerifierOutput["reasonCode"];
}

export function buildCitationVerificationDiagnostics(
  input: CitationVerifierInput,
  output: CitationVerifierOutput,
): CitationVerificationDiagnostics {
  return {
    inputDecision: input.decision,
    citedCount: input.citedChunkIds.length,
    approvedEvidenceCount: input.approvedEvidenceIds?.length ?? 0,
    verified: output.verified,
    validatedCount: output.validatedCitationIds.length,
    rejectedCount: output.rejectedCitationIds.length,
    reasonCode: output.reasonCode,
  };
}
