import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";

/**
 * Query parameters for GET /retrieval/debug
 * Validates debug-only endpoint input.
 */
export const debugQuerySchema = z.object({
  q: z.string().min(1, "Query text is required"),
  topK: z.coerce.number().int().min(1).max(100).default(10),
  documentIds: z
    .string()
    .optional()
    .transform((val) =>
      val ? val.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    ),
  categories: z
    .string()
    .optional()
    .transform((val) =>
      val ? val.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    ),
  departments: z
    .string()
    .optional()
    .transform((val) =>
      val ? val.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    ),
  classifications: z
    .string()
    .optional()
    .transform((val) =>
      val ? val.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    ),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  versionIds: z
    .string()
    .optional()
    .transform((val) =>
      val ? val.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    ),
});

export type DebugQueryInput = z.infer<typeof debugQuerySchema>;

/**
 * Body schema for POST /retrieval/search
 */
export const hybridSearchBodySchema = z.object({
  queryText: z.string().min(1, "queryText must be a non-empty string"),
  topK: z.number().int().min(1).max(100).default(10),
  filter: z
    .object({
      documentIds: z.array(z.string()).optional(),
      categories: z.array(z.string()).optional(),
      departments: z.array(z.string()).optional(),
      classifications: z.array(z.string()).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      versionIds: z.array(z.string()).optional(),
    })
    .strict()
    .optional(),
});

export type HybridSearchBodyInput = z.infer<typeof hybridSearchBodySchema>;

// ── Validation helpers ─────────────────────────────────────────────────

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

export function validateDebugQueryInput(input: unknown): DebugQueryInput {
  const result = debugQuerySchema.safeParse(input);
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

export function validateHybridSearchBody(input: unknown): HybridSearchBodyInput {
  const result = hybridSearchBodySchema.safeParse(input);
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
