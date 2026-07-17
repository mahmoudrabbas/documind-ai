import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import type {
  UploadDocumentInput,
  ListDocumentsInput,
  UpdateDocumentMetadataInput,
} from "./documents.types.js";

const classificationValues = ["public", "internal", "confidential", "restricted"] as const;

const uploadDocumentSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "title must be at least 2 characters")
      .max(200, "title must be at most 200 characters"),
    description: z
      .string()
      .trim()
      .max(1000, "description must be at most 1000 characters")
      .optional()
      .default(""),
    tags: z
      .array(z.string().trim().max(50, "each tag must be at most 50 characters"))
      .max(10, "at most 10 tags allowed")
      .optional()
      .default([]),
  })
  .strict();

const listDocumentsSchema = z
  .object({
    page: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.coerce.number().int().positive(),
      )
      .default(1),
    pageSize: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.coerce.number().int().positive().max(100),
      )
      .default(20),
    status: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.enum(["uploading", "uploaded", "processing", "processed", "failed"]).optional(),
      )
      .optional(),
    search: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.string().trim().max(200).optional(),
      )
      .optional(),
    category: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.string().trim().max(100).optional(),
      )
      .optional(),
    classification: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.enum(classificationValues).optional(),
      )
      .optional(),
    isArchived: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.enum(["true", "false"]).transform((v) => v === "true").optional(),
      )
      .optional(),
    sortBy: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.enum(["fileName", "fileSize", "createdAt", "updatedAt"]).optional(),
      )
      .optional(),
    sortOrder: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.enum(["asc", "desc"]).optional(),
      )
      .optional(),
  })
  .strict();

const updateDocumentMetadataSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "title must be at least 2 characters")
      .max(200, "title must be at most 200 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(1000, "description must be at most 1000 characters")
      .optional(),
    tags: z
      .array(z.string().trim().max(50, "each tag must be at most 50 characters"))
      .max(10, "at most 10 tags allowed")
      .optional(),
    category: z.string().trim().max(100).optional(),
    department: z.string().trim().max(100).optional(),
    classification: z.enum(classificationValues).optional(),
    owner: z.string().optional(),
    effectiveDate: z
      .string()
      .nullable()
      .optional()
      .transform((v) => (v === null ? null : v ? new Date(v) : undefined)),
    expiryDate: z
      .string()
      .nullable()
      .optional()
      .transform((v) => (v === null ? null : v ? new Date(v) : undefined)),
    versionLabel: z.string().trim().max(50).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

const replaceDocumentSchema = z
  .object({
    changeDescription: z
      .string()
      .trim()
      .max(500, "change description must be at most 500 characters")
      .optional()
      .default(""),
  })
  .strict();

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

export function validateUploadDocumentInput(input: unknown): UploadDocumentInput {
  const result = uploadDocumentSchema.safeParse(input);

  if (!result.success) {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Validation failed",
      groupValidationIssues(result.error.issues),
    );
  }

  return result.data;
}

export function validateListDocumentsInput(input: unknown): ListDocumentsInput {
  const result = listDocumentsSchema.safeParse(input);

  if (!result.success) {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Validation failed",
      groupValidationIssues(result.error.issues),
    );
  }

  return result.data;
}

export function validateUpdateDocumentMetadataInput(
  input: unknown,
): UpdateDocumentMetadataInput {
  const result = updateDocumentMetadataSchema.safeParse(input);

  if (!result.success) {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Validation failed",
      groupValidationIssues(result.error.issues),
    );
  }

  return result.data;
}

export function validateReplaceDocumentInput(input: unknown) {
  const result = replaceDocumentSchema.safeParse(input ?? {});

  if (!result.success) {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Validation failed",
      groupValidationIssues(result.error.issues),
    );
  }

  return result.data;
}
