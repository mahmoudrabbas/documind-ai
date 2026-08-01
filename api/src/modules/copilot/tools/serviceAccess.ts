import type { ToolContext } from "../copilot.types.js";
import type { BaseRole } from "../../../common/auth/baseRoles.js";
import type { UserOperationContext } from "../../users/users.service.js";

export function toUserOpCtx(ctx: ToolContext): UserOperationContext {
  return {
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    actorEmail: ctx.actorEmail,
    actorRole: ctx.actorRole as BaseRole,
    traceId: ctx.traceId,
    requestId: ctx.requestId,
  };
}
