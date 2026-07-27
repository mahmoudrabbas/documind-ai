import { z } from "zod";
import { AppError } from "../../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../../common/errors/errorCodes.js";

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

const startIndexSchema = z.object({
  triggeredBy: z.enum(["INITIAL", "REINDEX", "ACCESS_POLICY_CHANGE", "MODEL_UPGRADE"]).default("INITIAL"),
  chunkingConfig: z.object({
    targetTokens: z.number().int().positive().optional(),
    hardCeiling: z.number().int().positive().optional(),
    overlap: z.number().int().nonnegative().optional(),
  }).optional(),
  department: z.string().nullable().optional(),
  classification: z.string().nullable().optional(),
}).strict();

export type StartIndexInput = z.infer<typeof startIndexSchema>;

export function validateStartIndexInput(input: unknown): StartIndexInput {
  const result = startIndexSchema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", groupValidationIssues(result.error.issues));
  }
  return result.data;
}
