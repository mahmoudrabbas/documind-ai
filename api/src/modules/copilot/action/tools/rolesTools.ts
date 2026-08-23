import { z } from "zod";
import { Permission } from "../../../permissions/permissions.catalog.js";
import type { RegisteredTool, ToolSchema, RunContext } from "../../../agents/agents.types.js";
import type { AgentRunContext } from "../../../agents/agentRunContext.js";
import { assertNoTrustedContextFields, resolveTrustedActor } from "../../../agents/tools/authorizedRetrievalTools.js";
import { createRole } from "../../../roles/roles.service.js";
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

export function createRoleTool(): RegisteredTool {
  const schema: ToolSchema = {
    name: "roles.create",
    version: "1.0.0",
    description: "Create a new custom role",
    inputSchema: z
      .object({
        name: z
          .string()
          .trim()
          .min(2)
          .max(50)
          .regex(/^[\p{L}\p{N}\s'&.()-]+$/u, "name contains invalid characters"),
        baseRole: z.enum(["COMPANY_ADMIN", "EMPLOYEE"]),
        grants: z
          .array(
            z
              .object({
                permission: z.string().trim().min(1),
                scopes: z
                  .object({
                    selfOnly: z.boolean().optional(),
                    departmentIds: z.array(z.string()).optional(),
                    documentCategories: z.array(z.string()).optional(),
                    documentClassifications: z.array(z.string()).optional(),
                  })
                  .strict()
                  .optional(),
              })
              .strict(),
          )
          .min(0),
      })
      .strict(),
    outputSchema: z.object({
      role: z.object({
        id: z.string(),
        name: z.string(),
        baseRole: z.enum(["COMPANY_ADMIN", "EMPLOYEE"]),
        grants: z.array(
          z.object({
            permission: z.string(),
            scopes: z
              .object({
                selfOnly: z.boolean().optional(),
                departmentIds: z.array(z.string()).optional(),
                documentCategories: z.array(z.string()).optional(),
                documentClassifications: z.array(z.string()).optional(),
              })
              .optional(),
          }),
        ),
        status: z.enum(["active", "archived"]),
        version: z.number(),
        createdAt: z.string(),
      }),
    }),
    requiredPermission: Permission.ROLES_CREATE,
    approvalRequired: false,
    timeoutMs: 15000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "roles.create");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      return createRole(input, {
        tenantId: context.tenantId,
        actorId,
        actorEmail: context.actorEmail ?? "",
        actorRole: context.actorRole,
        traceId: context.traceId,
        requestId: context.requestId,
      });
    }),
  };
}