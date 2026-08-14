import { getPermissionEvaluator } from "../../permissions/permissions.evaluator.js";
import { authorizeTenantOperation, type OperationAuthorizationContext } from "../../permissions/permissions.operation.js";
import type { PermissionValue } from "../../permissions/permissions.catalog.js";
import type { AgentExecutionContext } from "../../agents/agentExecutionContext.js";
import type { BaseRole } from "../../../common/auth/baseRoles.js";

export interface ReauthorizeContext {
  tenantId: string;
  actorId: string;
  actorRole: string;
  permissions: readonly string[];
  traceId?: string;
  requestId?: string;
}

export async function evaluatorReauthorize(
  context: ReauthorizeContext,
  permission?: string,
): Promise<boolean> {
  if (!permission) return true;

  const evaluator = getPermissionEvaluator();
  const result = await evaluator.evaluate({
    tenantId: context.tenantId,
    actorId: context.actorId,
    baseRole: context.actorRole as BaseRole,
    permission,
  });

  return result.allowed;
}

export async function operationReauthorize(
  context: OperationAuthorizationContext,
  permission: string,
): Promise<void> {
  await authorizeTenantOperation(context, permission as PermissionValue);
}

export function createRunContextReauthorize(context: AgentExecutionContext) {
  return (permission?: string) => evaluatorReauthorize(
    {
      tenantId: context.tenantId,
      actorId: context.actorId,
      actorRole: context.actorRole,
      permissions: context.permissions,
      traceId: context.traceId,
      requestId: context.requestId,
    },
    permission,
  );
}