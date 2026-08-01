import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import { NOTIFICATION_CATEGORY_VALUES } from "../../db/models/notification.model.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid identifier");

export const listNotificationsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    category: z.enum([...NOTIFICATION_CATEGORY_VALUES]).optional(),
    includeArchived: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
  })
  .strict();

export const idSchema = z.object({ id: objectId }).strict();

export const bulkReadSchema = z
  .object({
    ids: z.array(objectId).min(1).max(50),
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
