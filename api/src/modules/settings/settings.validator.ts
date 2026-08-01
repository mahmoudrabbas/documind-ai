import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import type { UpdateTenantSettingsInput } from "./settings.types.js";

const nullableString = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .optional();

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "must be a valid 6-digit hex color")
  .nullable()
  .optional();

const settingsPatchSchema = z
  .object({
    profile: z
      .object({
        companyName: z
          .string()
          .trim()
          .min(2, "companyName must be at least 2 characters")
          .max(120, "companyName must be at most 120 characters")
          .nullable()
          .optional(),
        logoUrl: nullableString(2048, "logoUrl must be at most 2048 characters"),
        accentColor: hexColor,
        timezone: nullableString(100, "timezone must be at most 100 characters"),
      })
      .strict()
      .optional(),
    defaultLanguage: z.enum(["en", "ar"]).optional(),
    emailBranding: z
      .object({
        fromName: nullableString(120, "fromName must be at most 120 characters"),
        footerText: nullableString(500, "footerText must be at most 500 characters"),
        brandColor: hexColor,
      })
      .strict()
      .optional(),
    aiRuntimePreferences: z
      .object({
        temperature: z
          .number()
          .min(0, "temperature must be between 0 and 2")
          .max(2, "temperature must be between 0 and 2")
          .optional(),
        maxTokens: z
          .number()
          .int("maxTokens must be an integer")
          .min(128, "maxTokens must be at least 128")
          .max(8192, "maxTokens must be at most 8192")
          .optional(),
        responseStyle: z.enum(["concise", "balanced", "detailed"]).optional(),
        citationsEnabled: z.boolean().optional(),
      })
      .strict()
      .optional(),
    notifications: z
      .object({
        emailOnUserInvited: z.boolean().optional(),
        emailOnKnowledgeGapCreated: z.boolean().optional(),
        emailOnDocumentProcessingFailed: z.boolean().optional(),
        emailOnWeeklyDigest: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const updateSettingsSchema = z
  .object({
    settings: settingsPatchSchema.refine(
      (value) => Object.keys(value).length > 0,
      { message: "At least one settings group is required" },
    ),
    expectedVersion: z.number().int().min(0).optional(),
  })
  .strict();

export function validateUpdateSettingsInput(
  input: unknown,
): UpdateTenantSettingsInput {
  const result = updateSettingsSchema.safeParse(input);

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

function groupValidationIssues(issues: z.ZodIssue[]) {
  const groupedErrors = new Map<string, string[]>();

  for (const issue of issues) {
    const field = issue.path.join(".") || "query";

    if (!groupedErrors.has(field)) {
      groupedErrors.set(field, []);
    }

    groupedErrors.get(field)?.push(issue.message);
  }

  return Array.from(groupedErrors.entries()).map(([field, messages]) => ({
    field,
    message: messages.join(" and "),
  }));
}
