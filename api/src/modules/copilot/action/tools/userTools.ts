import { z } from "zod";
import { Permission } from "../../../permissions/permissions.catalog.js";
import type { RegisteredTool, ToolSchema, RunContext } from "../../../agents/agents.types.js";
import type { AgentRunContext } from "../../../agents/agentRunContext.js";
import { assertNoTrustedContextFields, resolveTrustedActor } from "../../../agents/tools/authorizedRetrievalTools.js";
import {
  inviteUser,
  deleteUser,
  resendInvitation,
  revokeInvitation,
  listUsers,
} from "../../../users/users.service.js";
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

export function createUserInviteTool(): RegisteredTool {
  const schema: ToolSchema = {
    name: "user.invite",
    version: "1.0.0",
    description: "Invite a new user to the tenant",
    inputSchema: z.object({
      name: z.string().trim().min(1).max(256),
      email: z.string().email().max(320),
      role: z.enum(["EMPLOYEE", "COMPANY_ADMIN"]),
    }),
    outputSchema: z.object({
      user: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        role: z.string(),
        status: z.string(),
        emailVerified: z.boolean(),
        createdAt: z.string(),
      }),
      emailDelivery: z.object({
        sent: z.boolean(),
        error: z.string().optional(),
      }),
    }),
    requiredPermission: Permission.USERS_CREATE,
    approvalRequired: false,
    timeoutMs: 15000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "user.invite");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      return inviteUser(input, {
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

export function createUserResendInvitationTool(): RegisteredTool {
  const schema: ToolSchema = {
    name: "user.resendInvitation",
    version: "1.0.0",
    description: "Resend an invitation to a pending user",
    inputSchema: z.object({
      targetUserId: z.string().trim().min(1).max(64),
    }),
    outputSchema: z.object({
      user: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        role: z.string(),
        status: z.string(),
        emailVerified: z.boolean(),
        createdAt: z.string(),
      }),
    }),
    requiredPermission: Permission.USERS_CREATE,
    approvalRequired: false,
    timeoutMs: 15000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "user.resendInvitation");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      const { targetUserId } = z.object({ targetUserId: z.string() }).parse(input);
      return resendInvitation(
        {
          tenantId: context.tenantId,
          actorId,
          actorEmail: context.actorEmail ?? "",
          actorRole: context.actorRole,
          traceId: context.traceId,
          requestId: context.requestId,
        },
        targetUserId,
      );
    }),
  };
}

export function createUserRevokeInvitationTool(): RegisteredTool {
  const schema: ToolSchema = {
    name: "user.revokeInvitation",
    version: "1.0.0",
    description: "Revoke a pending invitation",
    inputSchema: z.object({
      targetUserId: z.string().trim().min(1).max(64),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    requiredPermission: Permission.USERS_DELETE,
    approvalRequired: false,
    timeoutMs: 10000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "user.revokeInvitation");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      const { targetUserId } = z.object({ targetUserId: z.string() }).parse(input);
      return revokeInvitation(
        {
          tenantId: context.tenantId,
          actorId,
          actorEmail: context.actorEmail ?? "",
          actorRole: context.actorRole,
          traceId: context.traceId,
          requestId: context.requestId,
        },
        targetUserId,
      );
    }),
  };
}

export function createUserDeleteTool(): RegisteredTool {
  const schema: ToolSchema = {
    name: "user.delete",
    version: "1.0.0",
    description: "Delete a user (irreversible)",
    inputSchema: z.object({
      targetUserId: z.string().trim().min(1).max(64),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    requiredPermission: Permission.USERS_DELETE,
    approvalRequired: true,
    timeoutMs: 15000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "user.delete");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      const { targetUserId } = z.object({ targetUserId: z.string() }).parse(input);
      return deleteUser(
        {
          tenantId: context.tenantId,
          actorId,
          actorEmail: context.actorEmail ?? "",
          actorRole: context.actorRole,
          traceId: context.traceId,
          requestId: context.requestId,
        },
        targetUserId,
      );
    }),
  };
}

export function createUserListTool(): RegisteredTool {
  const schema: ToolSchema = {
    name: "user.list",
    version: "1.0.0",
    description: "List users in the tenant",
    inputSchema: z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(20),
      search: z.string().trim().max(256).optional(),
      role: z.enum(["EMPLOYEE", "COMPANY_ADMIN"]).optional(),
      status: z.enum(["active", "pending_email_verification", "suspended"]).optional(),
    }),
    outputSchema: z.object({
      users: z.array(z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        role: z.string(),
        status: z.string(),
        emailVerified: z.boolean(),
        createdAt: z.string(),
      })),
      pagination: z.object({
        page: z.number(),
        pageSize: z.number(),
        totalPages: z.number(),
        totalRecords: z.number(),
      }),
    }),
    requiredPermission: Permission.USERS_READ,
    approvalRequired: false,
    timeoutMs: 10000,
  };

  return {
    schema,
    handler: withActorContext(async (context: AgentRunContext, input: unknown) => {
      assertNoTrustedContextFields(input, "user.list");
      const { actorId } = await resolveTrustedActor(context, actorDeps);
      return listUsers(input, {
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