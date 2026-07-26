import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import type { SubscriptionStatus } from "../../db/models/subscription.model.js";

// ─── Global Settings strict contract ────────────────────────────────────────

const supportEmailField = z
  .string()
  .trim()
  .max(254, "supportEmail must be at most 254 characters")
  .refine(
    (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "supportEmail must be a valid email address or empty",
  );

const _globalSettingsSchema = z
  .object({
    supportEmail: supportEmailField,
    maintenanceMode: z.boolean(),
    allowRegistrations: z.boolean(),
    defaultTrialDays: z
      .number()
      .int("defaultTrialDays must be an integer")
      .min(0, "defaultTrialDays must be at least 0")
      .max(3650, "defaultTrialDays must be at most 3650"),
    dataRetentionDays: z
      .number()
      .int("dataRetentionDays must be an integer")
      .min(1, "dataRetentionDays must be at least 1")
      .max(36500, "dataRetentionDays must be at most 36500"),
  })
  .strict();

export type GlobalSettings = z.infer<typeof _globalSettingsSchema>;

const globalSettingsPatchFields = z.object({
  supportEmail: supportEmailField.optional(),
  maintenanceMode: z.boolean().optional(),
  allowRegistrations: z.boolean().optional(),
  defaultTrialDays: z
    .number()
    .int("defaultTrialDays must be an integer")
    .min(0, "defaultTrialDays must be at least 0")
    .max(3650, "defaultTrialDays must be at most 3650")
    .optional(),
  dataRetentionDays: z
    .number()
    .int("dataRetentionDays must be an integer")
    .min(1, "dataRetentionDays must be at least 1")
    .max(36500, "dataRetentionDays must be at most 36500")
    .optional(),
});

export const globalSettingsPatchSchema = globalSettingsPatchFields
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one setting must be provided",
  );

export type GlobalSettingsPatch = z.infer<typeof globalSettingsPatchSchema>;

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid identifier");
const boundedInteger = (minimum = 0) =>
  z.number().int().min(minimum).max(1_000_000_000);
const price = z.number().min(0).max(100_000_000);
const paging = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
const entitlements = z
  .object({
    employees: boundedInteger(1),
    admins: boundedInteger().default(1),
    documents: boundedInteger(),
    storageMb: boundedInteger(),
    fileSizeMb: boundedInteger().default(10),
    queriesPerMonth: boundedInteger(),
    tokensPerMonth: boundedInteger().default(0),
    ocrPagesPerMonth: boundedInteger().default(0),
  })
  .strict();
/** @deprecated Backward compat — maps `limits` to `entitlements` when `entitlements` is absent. */
const limits = z.object({
  users: z.number().int().positive(),
  documents: z.number().int().nonnegative(),
  questionsPerMonth: z.number().int().nonnegative(),
  storageMb: z.number().int().nonnegative(),
}).strict();

const supportedModels = z
  .array(z.string().trim().min(1).max(80))
  .min(1)
  .max(50)
  .refine((models) => new Set(models).size === models.length, {
    message: "supportedModels must not contain duplicates",
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
    monthlyPrice: price,
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("USD"),
    entitlements: entitlements.optional(),
    limits: limits.optional(),
    annualPrice: price.default(0),
    trialDays: boundedInteger().max(3650).default(30),
    visibility: z.enum(["public", "internal"]).default("public"),
    supportedModels: supportedModels.default(["basic"]),
    analyticsLevel: z.enum(["basic", "advanced", "enterprise"]).default("basic"),
    retentionDays: boundedInteger().max(36500).default(90),
    supportLevel: z
      .enum(["community", "standard", "priority", "dedicated"])
      .default("community"),
  })
  .strict()
  .transform(mapLimitsToEntitlements);
export const packageUpdateSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    monthlyPrice: price.optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
    entitlements: entitlements.optional(),
    limits: limits.optional(),
    annualPrice: price.optional(),
    trialDays: boundedInteger().max(3650).optional(),
    visibility: z.enum(["public", "internal"]).optional(),
    supportedModels: supportedModels.optional(),
    analyticsLevel: z.enum(["basic", "advanced", "enterprise"]).optional(),
    retentionDays: boundedInteger().max(36500).optional(),
    supportLevel: z
      .enum(["community", "standard", "priority", "dedicated"])
      .optional(),
  })
  .strict()
  .transform(mapLimitsToEntitlements)
  .refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), "Update is required");

export const packageLifecycleBodySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const packageImpactQuerySchema = z
  .object({ action: z.enum(["archive", "activate"]) })
  .strict();
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
