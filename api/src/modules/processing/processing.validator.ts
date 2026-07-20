import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import type { TriggerOcrInput, ReviewQualityInput, RetryOcrInput, ReviewCandidateInput, ResolveConflictInput } from "./processing.types.js";

function groupValidationIssues(issues: z.ZodIssue[]): Record<string, string[]> {
  return issues.reduce(
    (acc, issue) => {
      const path = issue.path.join(".");
      if (!acc[path]) {
        acc[path] = [];
      }
      acc[path].push(issue.message);
      return acc;
    },
    {} as Record<string, string[]>,
  );
}

const triggerOcrSchema = z.object({
  documentId: z.string().trim().min(1, "Document ID is required"),
  version: z.number().int().positive().optional(),
  language: z.enum(["ar", "en", "ar+en"]).optional().default("ar+en"),
  pageNumbers: z.array(z.number().int().positive()).max(500).optional(),
}).strict();

export function validateTriggerOcrInput(input: unknown): TriggerOcrInput {
  const result = triggerOcrSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
  }
  return result.data;
}

const reviewQualitySchema = z.object({
  decision: z.enum(["approved", "rejected", "retry"]),
  notes: z.string().trim().max(2000).optional(),
  pageNumbers: z.array(z.number().int().positive()).max(500).optional(),
}).strict();

export function validateReviewQualityInput(input: unknown): ReviewQualityInput {
  const result = reviewQualitySchema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
  }
  return result.data;
}

const retryOcrSchema = z.object({
  pageNumbers: z.array(z.number().int().positive()).max(500).optional(),
}).strict();

export function validateRetryOcrInput(input: unknown): RetryOcrInput {
  const result = retryOcrSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
  }
  return result.data;
}

const reviewCandidateSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  appliedValue: z.unknown().optional(),
  notes: z.string().trim().max(2000).optional(),
}).strict();

export function validateReviewCandidateInput(input: unknown): ReviewCandidateInput {
  const result = reviewCandidateSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
  }
  return result.data;
}

const resolveConflictSchema = z.object({
  resolution: z.enum(["keep_source", "keep_target", "merge", "archive_both", "escalate"]),
  notes: z.string().trim().max(2000).optional(),
}).strict();

export function validateResolveConflictInput(input: unknown): ResolveConflictInput {
  const result = resolveConflictSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
  }
  return result.data;
}
