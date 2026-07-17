import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid identifier");

export const createCheckoutSchema = z
  .object({
    packageId: objectId,
    billingInterval: z.enum(["monthly", "annual"]),
  })
  .strict();

export const checkoutIdSchema = z
  .object({
    checkoutId: objectId,
  })
  .strict();

export const listCheckoutSchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, VALIDATION_ERROR, "Validation failed", {
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        issue: issue.message,
      })),
    });
  }
  return result.data;
}
