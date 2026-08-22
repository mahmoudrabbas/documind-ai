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
// Canonical monetary values are integer minor units (for example, USD cents).
const price = z.number().int().min(0).max(100_000_000);
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
const subscriptionStatusSchema = z.enum(subscriptionStatuses).transform((status) =>
  (status === "cancelled" ? "CANCELED" : status.toUpperCase()) as SubscriptionStatus,
);
const reasonSchema = z.string().trim().min(10).max(1000);
const expectedSubscriptionVersionSchema = z.number().int().min(0);
export const subscriptionProvisionSchema = z
  .object({
    packageId: objectId,
    status: z.enum(["trialing", "active"]).transform((status) => status.toUpperCase() as "TRIALING" | "ACTIVE"),
    expectedVersion: z.literal(0),
    reason: reasonSchema,
  })
  .strict();
export const subscriptionUpdateSchema = z
  .object({
    packageId: objectId.optional(),
    status: subscriptionStatusSchema.optional(),
    expectedVersion: expectedSubscriptionVersionSchema,
    reason: reasonSchema,
    /** @deprecated Use periodEnd */
    renewsAt: z.string().datetime().nullable().optional(),
  })
  .strict()
  .refine((value) => value.packageId !== undefined || value.status !== undefined || value.renewsAt !== undefined, {
    message: "At least one subscription change is required",
  });
export const subscriptionImpactQuerySchema = z
  .object({
    action: z.enum(["provision", "update"]),
    packageId: objectId.optional(),
    targetStatus: subscriptionStatusSchema.optional(),
    expectedVersion: z.coerce.number().int().min(0),
  })
  .strict()
  .refine((value) => value.packageId !== undefined || value.targetStatus !== undefined, {
    message: "A target package or status is required",
  });
/**
 * Bedrock model ids are "<vendor>.<model>" (anthropic.claude-sonnet-4-6,
 * amazon.titan-embed-text-v2:0, us.anthropic.claude-...), where the vendor
 * segment is pure letters. Groq ids are bare or slash-separated
 * (llama-3.3-70b-versatile, openai/gpt-oss-120b) and never take that shape —
 * note llama-3.3-... does contain dots, which is why the letters-only vendor
 * segment rather than the mere presence of a dot is what discriminates.
 */
const BEDROCK_MODEL_ID_PATTERN = /^[a-z]+\.[a-z0-9]/iu;

function modelMatchesProvider(
  provider: "groq" | "iti-bedrock" | "student-bedrock",
  model: string,
): boolean {
  const bedrockShaped = BEDROCK_MODEL_ID_PATTERN.test(model);
  return provider === "groq" ? !bedrockShaped : bedrockShaped;
}

/**
 * A model name is only meaningful for the provider it belongs to, and the
 * provider serving requests can be pinned by LLM_PRIMARY_PROVIDER rather than
 * by this document. Accepting a mismatched pair here would persist a config
 * whose model 404s on every completion, so reject it at the edge.
 */
export const settingsBodySchema = z
  .object({
    provider: z.enum(["groq", "iti-bedrock", "student-bedrock"]),
    chatModel: z.string().trim().min(1).max(120),
    embeddingModel: z.string().trim().min(1).max(120),
    temperature: z.number().min(0).max(2),
    maxOutputTokens: z.number().int().min(128).max(8192),
  })
  .strict()
  .refine((value) => modelMatchesProvider(value.provider, value.chatModel), {
    path: ["chatModel"],
    message:
      "Chat model does not belong to the selected provider. Bedrock providers require a \"<vendor>.<model>\" id; groq requires a Groq model id.",
  })
  // iti-bedrock is exempt: resolveEmbeddingProviderKey can fall through to
  // OpenAI on credentials alone, so text-embedding-3-small is legitimate there.
  .refine(
    (value) =>
      value.provider === "iti-bedrock" ||
      modelMatchesProvider(value.provider, value.embeddingModel),
    {
      path: ["embeddingModel"],
      message:
        "Embedding model does not belong to the selected provider. student-bedrock requires a \"<vendor>.<model>\" id; groq requires a Jina model id.",
    },
  );
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
