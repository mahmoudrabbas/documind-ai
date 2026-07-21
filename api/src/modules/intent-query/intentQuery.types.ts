import { z } from "zod";

// ── Intent classes ──
export const IntentClass = z.enum([
  "knowledge_question",     // General knowledge lookup
  "follow_up",              // References prior conversation
  "document_specific",      // Targets specific document(s)
  "comparison",             // Compare documents/policies/sections
  "summarization",          // Summarize a document or section
  "navigation",             // "Where do I find…" / "Show me…"
  "administrative_action",  // Requests an action (e.g., "upload X")
  "unsupported",            // General/off-topic question
  "unsafe",                 // Prompt injection / policy violation
]);

export type IntentClassValue = z.infer<typeof IntentClass>;

// ── Language ──
export const QueryLanguage = z.enum(["ar", "en", "mixed"]);
export type QueryLanguageValue = z.infer<typeof QueryLanguage>;

// ── Detected entity ──
export const DetectedEntity = z.object({
  text: z.string().max(500),
  type: z.enum([
    "person", "organization", "document_title", "clause_number",
    "date", "policy_name", "department", "number", "quoted_phrase", "other",
  ]),
  language: QueryLanguage,
  preserveExact: z.boolean(),  // true = do NOT translate/expand
});

export type DetectedEntityType = z.infer<typeof DetectedEntity>;

// ── Temporal constraint ──
export const TemporalConstraint = z.object({
  type: z.enum(["before", "after", "between", "exact"]),
  value: z.string().max(100),     // ISO date or human-readable
  rawText: z.string().max(200),   // Original user text
});

export type TemporalConstraintType = z.infer<typeof TemporalConstraint>;

// ── Semantic query ──
export const SemanticQuery = z.object({
  text: z.string().min(1).max(1000),
  language: QueryLanguage,
  weight: z.number().min(0).max(1).default(1),
});

export type SemanticQueryType = z.infer<typeof SemanticQuery>;

// ── Keyword query ──
export const KeywordQuery = z.object({
  terms: z.array(z.string().max(200)).min(1).max(30),
  language: QueryLanguage,
  mustMatch: z.boolean().default(false),  // true = AND, false = OR
});

export type KeywordQueryType = z.infer<typeof KeywordQuery>;

// ── Clarification request ──
export const ClarificationRequest = z.object({
  reason: z.enum([
    "ambiguous_intent", "missing_context", "multiple_interpretations",
    "vague_reference", "unsupported_language",
  ]),
  suggestedQuestions: z.array(z.string().max(500)).min(1).max(5),
  messageAr: z.string().max(500).optional(),
  messageEn: z.string().max(500).optional(),
});

export type ClarificationRequestType = z.infer<typeof ClarificationRequest>;

// ── Full Query Plan ──
export const QueryPlanSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  normalizedQuestion: z.string().min(1).max(2000),
  originalQuestion: z.string().min(1).max(2000),
  language: QueryLanguage,
  detectedIntent: IntentClass,
  intentConfidence: z.number().min(0).max(1),
  entities: z.array(DetectedEntity).max(50),
  temporalConstraints: z.array(TemporalConstraint).max(10),
  referencedDocumentIds: z.array(z.string().max(100)).max(20),
  departments: z.array(z.string().max(200)).max(20),
  categories: z.array(z.string().max(200)).max(20),
  exactTerms: z.array(z.string().max(500)).max(30),
  semanticQueries: z.array(SemanticQuery).max(10),
  keywordQueries: z.array(KeywordQuery).max(10),
  clarificationNeeded: z.boolean(),
  clarification: ClarificationRequest.nullable().default(null),
  isFollowUp: z.boolean(),
  conversationContextUsed: z.boolean(),
  promptVersion: z.string().max(40),
  modelVersion: z.string().max(120),
  processingMetadata: z.object({
    tokensUsed: z.number().int().min(0),
    latencyMs: z.number().int().min(0),
    estimatedCost: z.number().min(0),
    fallbackUsed: z.boolean(),
  }),
});

export type QueryPlan = z.infer<typeof QueryPlanSchema>;

// ── Analyze query input validation ──
export const AnalyzeQueryInputSchema = z.object({
  question: z.string().min(1).max(2000),
  conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid conversationId").optional(),
  referencedDocumentIds: z.array(z.string().max(100)).max(20).optional(),
  maxContext: z.number().int().min(1).max(50).default(10),
});

export type AnalyzeQueryInput = z.infer<typeof AnalyzeQueryInputSchema>;
