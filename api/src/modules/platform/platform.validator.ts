import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import type { SubscriptionStatus } from "../../db/models/subscription.model.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid identifier");
const paging = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
const entitlements = z.object({
  employees: z.number().int().positive(),
  admins: z.number().int().nonnegative().default(1),
  documents: z.number().int().nonnegative(),
  storageMb: z.number().int().nonnegative(),
  fileSizeMb: z.number().int().nonnegative().default(10),
  queriesPerMonth: z.number().int().nonnegative(),
  tokensPerMonth: z.number().int().nonnegative().default(0),
  ocrPagesPerMonth: z.number().int().nonnegative().default(0),
});
/** @deprecated Backward compat — maps `limits` to `entitlements` when `entitlements` is absent. */
const limits = z.object({
  users: z.number().int().positive(),
  documents: z.number().int().nonnegative(),
  questionsPerMonth: z.number().int().nonnegative(),
  storageMb: z.number().int().nonnegative(),
});

/**
 * Map legacy `limits` fields to `entitlements` if no `entitlements` provided.
 * If both are present, `entitlements` wins.
 */
function mapLimitsToEntitlements<T extends { entitlements?: unknown; limits?: unknown }>(
  data: T,
): Omit<T, "limits"> & { entitlements: Record<string, number> } {
  const { limits: l, ...rest } = data as T & { limits?: z.infer<typeof limits> };
  if (rest.entitlements) {
    return rest as Omit<T, "limits"> & { entitlements: Record<string, number> };
  }
  if (l) {
    return {
      ...rest,
      entitlements: {
        employees: l.users,
        admins: 1,
        documents: l.documents,
        storageMb: l.storageMb,
        fileSizeMb: 10,
        queriesPerMonth: l.questionsPerMonth,
        tokensPerMonth: 0,
        ocrPagesPerMonth: 0,
      },
    } as Omit<T, "limits"> & { entitlements: Record<string, number> };
  }
  return rest as Omit<T, "limits"> & { entitlements: Record<string, number> };
}

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
    entitlements: entitlements.optional(),
    limits: limits.optional(),
    annualPrice: z.number().nonnegative().default(0),
    trialDays: z.number().int().nonnegative().default(30),
    visibility: z.enum(["public", "internal"]).default("public"),
    supportedModels: z.array(z.string()).default(["basic"]),
    analyticsLevel: z.enum(["basic", "advanced", "enterprise"]).default("basic"),
    retentionDays: z.number().int().nonnegative().default(90),
    supportLevel: z
      .enum(["community", "standard", "priority", "dedicated"])
      .default("community"),
  })
  .strict()
  .transform(mapLimitsToEntitlements);
export const packageUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    monthlyPrice: z.number().nonnegative().optional(),
    currency: z.string().trim().toUpperCase().length(3).optional(),
    entitlements: entitlements.optional(),
    limits: limits.optional(),
    annualPrice: z.number().nonnegative().optional(),
    trialDays: z.number().int().nonnegative().optional(),
    visibility: z.enum(["public", "internal"]).optional(),
    supportedModels: z.array(z.string()).optional(),
    analyticsLevel: z.enum(["basic", "advanced", "enterprise"]).optional(),
    retentionDays: z.number().int().nonnegative().optional(),
    supportLevel: z
      .enum(["community", "standard", "priority", "dedicated"])
      .optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .transform(mapLimitsToEntitlements)
  .refine((value) => Object.keys(value).length > 0, "Update is required");
/** All known subscription statuses (both lowercase input and uppercase model). */
const subscriptionStatuses = [
  "trialing", "incomplete", "active", "past_due", "paused",
  "cancel_at_period_end", "canceled", "cancelled", "expired", "unpaid",
] as const;
export const subscriptionUpdateSchema = z
  .object({
    packageId: objectId,
    status: z.enum(subscriptionStatuses).transform((s) => s.toUpperCase() as SubscriptionStatus),
    /** @deprecated Use periodEnd */
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
