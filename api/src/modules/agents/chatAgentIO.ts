import { z } from "zod";
import {
  ClarificationRequest,
  DetectedEntity,
  IntentClass,
  KeywordQuery,
  QueryLanguage,
  QueryRoute,
  SemanticQuery,
  SocialSubtype,
  TemporalConstraint,
} from "../intent-query/intentQuery.types.js";
import {
  boundedIdArray,
  ChatAnswerDecision,
  ChatComplianceDecision,
  objectIdSchema,
} from "./chatWorkflowContracts.js";

// ── chat-supervisor ─────────────────────────────────────────────────────────

/**
 * Handoffs back to the supervisor carry no payload: workflow state is threaded
 * by the orchestrator, never inside the handoff envelope. Strict-empty keeps
 * this fail-closed.
 */
export const ChatSupervisorInputSchema = z.object({}).strict();

// ── intent-query-agent ──────────────────────────────────────────────────────

export const IntentAgentInputSchema = z
  .object({
    conversationId: objectIdSchema,
    question: z.string().trim().min(1).max(2000),
    language: QueryLanguage.optional(),
    referencedDocumentIds: boundedIdArray(20).optional(),
  })
  .strict();

export type IntentAgentInput = z.infer<typeof IntentAgentInputSchema>;

export const IntentAgentOutputSchema = z
  .object({
    normalizedQuestion: z.string().trim().min(1).max(2000),
    language: QueryLanguage,
    route: QueryRoute,
    intent: IntentClass,
    intentConfidence: z.number().min(0).max(1),
    referencedDocumentIds: boundedIdArray(20).default([]),
    clarificationNeeded: z.boolean().default(false),
    clarification: ClarificationRequest.nullable().default(null),
    socialSubtype: SocialSubtype.optional(),
    isFollowUp: z.boolean().default(false),
    // Issue 3 extension: typed search-plan metadata. All fields are bounded
    // and never carry raw document/chunk text. Non-retrieval routes
    // (social / unsupported / unsafe / clarification) always emit empty
    // semanticQueries and keywordQueries so no executable plan leaks out.
    reasonCode: z.string().trim().min(1).max(100).optional(),
    semanticQueries: z.array(SemanticQuery).max(10).default([]),
    keywordQueries: z.array(KeywordQuery).max(10).default([]),
    exactTerms: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
    entities: z.array(DetectedEntity).max(50).default([]),
    referencedDocumentTitles: z
      .array(z.string().trim().min(1).max(500))
      .max(20)
      .default([]),
    temporalConstraints: z.array(TemporalConstraint).max(10).default([]),
    departments: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    categories: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  })
  .strict();

export type IntentAgentOutput = z.infer<typeof IntentAgentOutputSchema>;

// ── answer-writer-agent ─────────────────────────────────────────────────────

export const AnswerWriterInputSchema = z
  .object({
    conversationId: objectIdSchema,
    question: z.string().trim().min(1).max(2000),
    language: QueryLanguage.optional(),
    approvedEvidenceIds: boundedIdArray(100).optional(),
    referencedDocumentIds: boundedIdArray(20).optional(),
  })
  .strict();

export type AnswerWriterInput = z.infer<typeof AnswerWriterInputSchema>;

export const AnswerWriterOutputSchema = z
  .object({
    decision: ChatAnswerDecision,
    answer: z.string().max(20_000),
    citedChunkIds: boundedIdArray(50).default([]),
  })
  .strict();

export type AnswerWriterOutput = z.infer<typeof AnswerWriterOutputSchema>;

// ── citation-verification-agent ─────────────────────────────────────────────

/**
 * Deterministic claim-to-evidence validation. Input carries the answer
 * writer's decision so the verifier can distinguish grounded answers (must
 * be validated) from non-grounded ones (skipped).
 */
export const CitationVerifierInputSchema = z
  .object({
    decision: ChatAnswerDecision,
    citedChunkIds: boundedIdArray(50),
    approvedEvidenceIds: boundedIdArray(100).optional(),
    answerText: z.string().max(20_000).optional(),
  })
  .strict();

export type CitationVerifierInput = z.infer<typeof CitationVerifierInputSchema>;

export const CitationVerifierReasonCode = z.enum([
  "CITATIONS_VERIFIED",
  "MISSING_CITATIONS",
  "CITATIONS_SKIPPED",
]);
export type CitationVerifierReasonCodeValue = z.infer<
  typeof CitationVerifierReasonCode
>;

export const CitationVerifierOutputSchema = z
  .object({
    verified: z.boolean(),
    validatedCitationIds: boundedIdArray(50).default([]),
    rejectedCitationIds: boundedIdArray(50).default([]),
    // Claim-level checks are an explicit extension point (no LLM in the
    // deterministic core): always empty until a claim-extraction path exists.
    unsupportedClaims: z
      .array(z.string().trim().min(1).max(500))
      .max(20)
      .default([]),
    reasonCode: CitationVerifierReasonCode,
  })
  .strict();

export type CitationVerifierOutput = z.infer<
  typeof CitationVerifierOutputSchema
>;

// ── compliance-agent ────────────────────────────────────────────────────────

export const ComplianceAgentInputSchema = z
  .object({
    answerText: z.string().max(20_000).optional(),
    citedChunkIds: boundedIdArray(50).default([]),
    validatedCitationIds: boundedIdArray(50).default([]),
    language: QueryLanguage.optional(),
    route: QueryRoute.optional(),
  })
  .strict();

export type ComplianceAgentInput = z.infer<typeof ComplianceAgentInputSchema>;

export const ComplianceAgentOutputSchema = z
  .object({
    decision: ChatComplianceDecision,
    reasonCode: z.string().trim().min(1).max(100),
    finalText: z.string().max(20_000).optional(),
    message: z.string().max(2000).optional(),
  })
  .strict();

export type ComplianceAgentOutput = z.infer<typeof ComplianceAgentOutputSchema>;
