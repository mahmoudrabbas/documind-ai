import { AppError } from "../../common/errors/AppError.js";
import { BILLING_OPERATION_NOT_ALLOWED } from "../../common/errors/errorCodes.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { authorizePlatformOperation, type OperationAuthorizationContext, type ResolvedOperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { getAuditWriter } from "../../common/observability/index.js";

export async function authorizeRefundConfirmation(
  context: OperationAuthorizationContext,
  requestedBy: string,
): Promise<ResolvedOperationAuthorizationContext> {
  let actor: ResolvedOperationAuthorizationContext;
  try { actor = await authorizePlatformOperation(context, Permission.BILLING_REFUND_CONFIRM); }
  catch (error) { auditDenied(context, "PLATFORM_AUTHORIZATION"); throw error; }
  if (actor.actorId === requestedBy) {
    auditDenied(context, "REQUESTER_CONFIRMER_SEPARATION");
    throw new AppError(403, BILLING_OPERATION_NOT_ALLOWED, "Refund requester cannot confirm the same refund");
  }
  return actor;
}

function auditDenied(context: OperationAuthorizationContext, reason: string): void {
  void getAuditWriter().write({ action: "BILLING_AUTHORIZATION_DENIED", resourceType: "Refund", resourceId: "refund-confirmation", outcome: "DENIED", tenantId: context.tenantId,
    actorId: context.actorId, actorEmail: context.actorEmail, actorRole: context.actorRole, changes: { permission: Permission.BILLING_REFUND_CONFIRM, reason } });
}
