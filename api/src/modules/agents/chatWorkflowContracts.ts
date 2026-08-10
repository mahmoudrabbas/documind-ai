import { z } from "zod";
import {
  AssistantIntentKind,
  IntentClass,
  QueryLanguage,
  QueryRoute,
} from "../intent-query/intentQuery.types.js";

export const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export const objectIdSchema = z
  .string()
  .trim()
  .regex(OBJECT_ID_PATTERN, "Expected a 24-char hex ObjectId");

export function boundedIdArray(max: number): z.ZodType<string[]> {
  return z
    .array(z.string().trim().min(1).max(128))
    .max(max)
    .transform((values) => Array.from(new Set(values)));
}

/**
 * Mirrors the exact answer-decision literals used by the chat generator
 * (chat.service.ts RAG prompt / parse), kept compatible — never a conflicting
 * union.
 */
export const ChatAnswerDecision = z.enum([
  "grounded_answer",
  "insufficient_evidence",
  "clarification",
  "unsupported",
  "unsafe",
]);
export type ChatAnswerDecisionValue = z.infer<typeof ChatAnswerDecision>;

export const ChatComplianceDecision = z.enum(["release", "refuse", "clarify"]);
export type ChatComplianceDecisionValue = z.infer<typeof ChatComplianceDecision>;

export const ChatWorkflowInputSchema = z
  .object({
    requestId: z.string().trim().min(1).max(128),
    traceId: z.string().trim().min(1).max(128),
    tenantId: objectIdSchema,
    actorId: objectIdSchema,
    conversationId: objectIdSchema,
    originalQuestion: z.string().trim().min(1).max(2000),
    language: QueryLanguage.optional(),
    referencedDocumentIds: boundedIdArray(20).optional(),
    locale: z.string().trim().min(2).max(20).optional(),
  })
  .strict();

export type ChatWorkflowInput = z.infer<typeof ChatWorkflowInputSchema>;

export const ChatWorkflowStateSchema = z
  .object({
    requestId: z.string().trim().min(1).max(128),
    traceId: z.string().trim().min(1).max(128),
    tenantId: objectIdSchema,
    actorId: objectIdSchema,
    conversationId: objectIdSchema,
    originalQuestion: z.string().trim().min(1).max(2000),
    normalizedQuestion: z.string().trim().max(2000).optional(),
    language: QueryLanguage.optional(),
    route: QueryRoute.optional(),
    intent: IntentClass.optional(),
    assistantKind: AssistantIntentKind.nullable().optional(),
    referencedDocumentIds: boundedIdArray(20).optional(),
    retrievalCandidateIds: boundedIdArray(100).optional(),
    approvedEvidenceIds: boundedIdArray(100).optional(),
    answerDecision: ChatAnswerDecision.optional(),
    answerText: z.string().max(20_000).optional(),
    citedChunkIds: boundedIdArray(50).optional(),
    validatedCitationIds: boundedIdArray(50).optional(),
    complianceDecision: ChatComplianceDecision.optional(),
    reasonCode: z.string().trim().max(100).optional(),
  })
  .strict();

export type ChatWorkflowState = z.infer<typeof ChatWorkflowStateSchema>;

export const ChatWorkflowResultSchema = z
  .object({
    conversationId: objectIdSchema,
    answerDecision: ChatAnswerDecision,
    answerText: z.string().max(20_000).optional(),
    citedChunkIds: boundedIdArray(50).optional(),
    validatedCitationIds: boundedIdArray(50).optional(),
    complianceDecision: ChatComplianceDecision.optional(),
    reasonCode: z.string().trim().max(100).optional(),
  })
  .strict();

export type ChatWorkflowResult = z.infer<typeof ChatWorkflowResultSchema>;
