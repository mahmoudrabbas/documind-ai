import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import type { ListTenantsInput } from "./admin.types.js";

const listTenantsSchema = z
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
        z
          .enum(["active", "trial", "pending", "pending_verification"])
          .optional(),
      )
      .optional(),
    plan: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.enum(["free", "trial", "pro"]).optional(),
      )
      .optional(),
    search: z
      .preprocess(
        (value) => (Array.isArray(value) ? value[0] : value),
        z.string().trim().min(1).max(120).optional(),
      )
      .optional(),
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

export function validateListTenantsInput(input: unknown): ListTenantsInput {
  const result = listTenantsSchema.safeParse(input);

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
