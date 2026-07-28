import { z } from "zod";

export const gapStatusSchema = z.enum(["open", "triaged", "assigned", "resolved", "dismissed", "reopened"]);
export const gapSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const gapSourceSchema = z.enum(["refusal", "weak_answer", "conflict", "negative_feedback", "manual"]);
export const gapCandidateOutcomeSchema = z.enum(["refused", "weak", "conflict", "negative_feedback"]);

export const reportGapCandidateSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  normalizedIntent: z.string().trim().max(500).optional(),
  outcome: gapCandidateOutcomeSchema.default("refused"),
  category: z.string().trim().optional(),
  evidenceSummaryIds: z.array(z.string().trim()).optional().default([]),
  confidence: z.number().min(0).max(1).default(1.0),
  conflictType: z.string().trim().optional(),
  actorDepartment: z.string().trim().max(100).optional(),
  conversationId: z.string().trim().optional(),
  messageId: z.string().trim().optional(),
  traceId: z.string().trim().optional(),
});

export const listGapsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: gapStatusSchema.optional(),
  severity: gapSeveritySchema.optional(),
  source: gapSourceSchema.optional(),
  department: z.string().trim().optional(),
  assigneeId: z.string().trim().optional(),
  search: z.string().trim().optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "occurrenceCount", "severity"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const assignGapSchema = z.object({
  assigneeId: z.string().trim().min(1, "Assignee ID is required"),
  dueDate: z.string().datetime().optional().nullable(),
});

export const updateGapStatusSchema = z.object({
  status: gapStatusSchema,
});

export const resolveGapSchema = z.object({
  resolutionNotes: z.string().trim().min(1, "Resolution notes are required").max(2000),
  linkedDocumentIds: z.array(z.string().trim()).optional().default([]),
});

export const dismissGapSchema = z.object({
  reason: z.string().trim().min(1, "Dismissal reason is required").max(1000),
});

export const mergeGapsSchema = z.object({
  sourceGapIds: z.array(z.string().trim()).min(1, "At least one source gap ID required"),
  targetGapId: z.string().trim().min(1, "Target gap ID required"),
});

export const splitGapSchema = z.object({
  newTopics: z.array(z.string().trim().min(1).max(200)).min(2, "At least 2 new topics required"),
});

export const linkDocumentsSchema = z.object({
  documentIds: z.array(z.string().trim()).min(1, "At least one document ID required"),
});

export const triggerReevaluationSchema = z.object({
  documentId: z.string().trim().min(1, "Document ID is required"),
});

export type ReportGapCandidateInput = z.infer<typeof reportGapCandidateSchema>;
export type ListGapsQueryInput = z.infer<typeof listGapsQuerySchema>;
export type AssignGapInput = z.infer<typeof assignGapSchema>;
export type UpdateGapStatusInput = z.infer<typeof updateGapStatusSchema>;
export type ResolveGapInput = z.infer<typeof resolveGapSchema>;
export type DismissGapInput = z.infer<typeof dismissGapSchema>;
export type MergeGapsInput = z.infer<typeof mergeGapsSchema>;
export type SplitGapInput = z.infer<typeof splitGapSchema>;
export type LinkDocumentsInput = z.infer<typeof linkDocumentsSchema>;
