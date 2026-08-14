import { z } from "zod";
import { Permission } from "../../../permissions/permissions.catalog.js";
import type { RegisteredTool, ToolSchema, RunContext } from "../../../agents/agents.types.js";
import type { AgentRunContext } from "../../../agents/agentRunContext.js";
import { assertNoTrustedContextFields, resolveTrustedActor } from "../../../agents/tools/authorizedRetrievalTools.js";
import { updateTenantSettings } from "../../../settings/settings.service.js";
import { getDocumentAccessAuthorizationService, type DocumentAccessAuthorizationService } from "../../../document-access/documentAccess.authorization.service.js";

function withActorContext<T>(
  handler: (context: AgentRunContext, input: unknown) => Promise<T>
): (context: RunContext, input: unknown) => Promise<T> {
  return async (context: RunContext, input: unknown) => {
    return handler(context as AgentRunContext, input);
  }
}

function getActorDeps(): { authorization: DocumentAccessAuthorizationService } {
  return { authorization: getDocumentAccessAuthorizationService() };
}

const actorDeps = getActorDeps();

const nullableString = (max: number) => z.string().trim().max(max).nullable().optional();

const hexColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional();

const settingsPatchSchema = z
  .object({
    profile: z
      .object({
        companyName: z.string().trim().min(2).max(120).nullable().optional(),
        logoUrl: nullableString(2048),
        accentColor: hexColor,
        timezone: nullableString(100),
      })
      .strict()
      .optional(),
    defaultLanguage: z.enum(["en", "ar"]).optional(),
    emailBranding: z
      .object({
        fromName: nullableString(120),
        footerText: nullableString(500),
        brandColor: hexColor,
      })
      .strict()
      .optional(),
    aiRuntimePreferences: z
      .object({
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().min(128).max(8192).optional(),
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

const tenantSettingsOutputSchema = z.object({
  profile: z.object({
    companyName: z.string().nullable(),
    logoUrl: z.string().nullable(),
    accentColor: z.string().nullable(),
    timezone: z.string().nullable(),
  }),
  defaultLanguage: z.enum(["en", "ar"]),
  emailBranding: z.object({
    fromName: z.string().nullable(),
    footerText: z.string().nullable(),
    brandColor: z.string().nullable(),
  }),
  aiRuntimePreferences: z.object({
    temperature: z.number(),
    maxTokens: z.number(),
    responseStyle: z.enum(["concise", "balanced", "detailed"]),
    citationsEnabled: z.boolean(),
  }),
  notifications: z.object({
    emailOnUserInvited: z.boolean(),
    emailOnKnowledgeGapCreated: z.boolean(),
    emailOnDocumentProcessingFailed: z.boolean(),
    emailOnWeeklyDigest: z.boolean(),
  }),
});

export function createSettingsUpdateTool(): RegisteredTool {
  const schema: ToolSchema = {
    name: "settings.update",
    version: "1.0.0",
    description: "Update tenant settings (profile, language, email branding, AI runtime preferences, notifications)",
    inputSchema: z
      .object({
        settings: settingsPatchSchema.refine(
          (value) => Object.keys(value).length > 0,
          { message: "At least one settings group is required" },
        ),
        expectedVersion: z.number().int().min(0).optional(),
      })
      .strict(),
    outputSchema: z.object({
      settings: tenantSettingsOutputSchema,
      settingsVersion: z.number(),
      settingsUpdatedAt: z.string().nullable(),
      updated: z.boolean(),
    }),
    requiredPermission: Permission.COMPANY_SETTINGS_UPDATE,
    approvalRequired: false,
    timeoutMs: 15000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "settings.update");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      return updateTenantSettings(
        context.tenantId,
        input,
        {
          tenantId: context.tenantId,
          actorId,
          actorEmail: context.actorEmail ?? "",
          actorRole: context.actorRole,
          actorKind: "USER",
          traceId: context.traceId,
          requestId: context.requestId,
        },
      );
    }),
  };
}