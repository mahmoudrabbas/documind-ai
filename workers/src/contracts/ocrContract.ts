import { z } from "zod";

export const OcrLanguageSchema = z.enum(["ar", "en", "ar+en"]);
export type OcrLanguage = z.infer<typeof OcrLanguageSchema>;

export const OcrBoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type OcrBoundingBox = z.infer<typeof OcrBoundingBoxSchema>;

export const OcrWordSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  boundingBox: OcrBoundingBoxSchema.optional(),
});
export type OcrWord = z.infer<typeof OcrWordSchema>;

export const OcrPageResultSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  words: z.array(OcrWordSchema),
  language: OcrLanguageSchema,
  provider: z.string(),
  providerModel: z.string(),
  durationMs: z.number().nonnegative(),
  warnings: z.array(z.string()),
});
export type OcrPageResult = z.infer<typeof OcrPageResultSchema>;

export const OcrBatchResultSchema = z.object({
  pages: z.array(OcrPageResultSchema),
  totalCostUsd: z.number().nonnegative(),
  providerVersion: z.string(),
});
export type OcrBatchResult = z.infer<typeof OcrBatchResultSchema>;

export const QualityIssueTypeSchema = z.enum([
  "blank_page",
  "unreadable",
  "garbled_text",
  "broken_table",
  "rotated_page",
  "duplicated_page",
  "low_confidence",
  "low_text_density",
  "mixed_language_mismatch",
]);
export type QualityIssueType = z.infer<typeof QualityIssueTypeSchema>;

export const QualityIssueSchema = z.object({
  type: QualityIssueTypeSchema,
  severity: z.enum(["info", "warning", "critical"]),
  message: z.string(),
  pageNumber: z.number().int().positive(),
});
export type QualityIssue = z.infer<typeof QualityIssueSchema>;

export const QualityStatusSchema = z.enum([
  "READY",
  "READY_WITH_WARNINGS",
  "REVIEW_REQUIRED",
  "FAILED",
]);
export type QualityStatus = z.infer<typeof QualityStatusSchema>;

export const DocumentQualityResultSchema = z.object({
  documentId: z.string(),
  tenantId: z.string(),
  documentVersion: z.number().int().positive(),
  overallConfidence: z.number().min(0).max(1),
  qualityStatus: QualityStatusSchema,
  issues: z.array(QualityIssueSchema),
  pageConfidences: z.record(z.string(), z.number().min(0).max(1)),
  pageStatuses: z.record(z.string(), z.enum(["READY", "READY_WITH_WARNINGS", "REVIEW_REQUIRED", "FAILED"])),
  summary: z.string(),
  requiresReview: z.boolean(),
  reviewedBy: z.string().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
  reviewDecision: z.enum(["approved", "rejected", "retry"]).nullable().optional(),
  reviewNotes: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DocumentQualityResult = z.infer<typeof DocumentQualityResultSchema>;

export const PageStatusSchema = z.enum(["READY", "READY_WITH_WARNINGS", "REVIEW_REQUIRED", "FAILED"]);
export type PageStatus = z.infer<typeof PageStatusSchema>;
