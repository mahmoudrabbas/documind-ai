import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid identifier");
const paging = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
const limits = z.object({
  users: z.number().int().positive(),
  documents: z.number().int().nonnegative(),
  questionsPerMonth: z.number().int().nonnegative(),
  storageMb: z.number().int().nonnegative(),
});

export const packageBodySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    code: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+$/)
      .max(50),
    description: z.string().trim().max(500).default(""),
    monthlyPrice: z.number().nonnegative(),
    currency: z.string().trim().toUpperCase().length(3).default("USD"),
    limits,
  })
  .strict();
export const packageUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    monthlyPrice: z.number().nonnegative().optional(),
    currency: z.string().trim().toUpperCase().length(3).optional(),
    limits: limits.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Update is required");
export const subscriptionUpdateSchema = z
  .object({
    packageId: objectId,
    status: z.enum(["active", "trialing", "past_due", "cancelled"]),
    renewsAt: z.iso.datetime().nullable().optional(),
  })
  .strict();
export const settingsBodySchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .refine((value) => Object.keys(value).length > 0, "Settings are required");
export const idSchema = z.object({ id: objectId }).strict();
export const tenantIdSchema = z.object({ tenantId: objectId }).strict();
export const listSchema = z
  .object({
    ...paging,
    search: z.string().trim().max(120).optional(),
    status: z.string().trim().max(40).optional(),
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
