import mongoose from "mongoose";
import type { BaseRole } from "../../common/auth/baseRoles.js";
import {
  isSystemPlatformTenant,
} from "../../common/auth/platformTenant.js";
import { AppError } from "../../common/errors/AppError.js";
import { PERMISSION_REQUIRED } from "../../common/errors/errorCodes.js";
import {
  requireAuthenticatedAuditActor,
  type AuthenticatedAuditActor,
} from "../../common/observability/auditActor.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { authorizePermission } from "./permissions.authorization.js";
import type { PermissionValue } from "./permissions.catalog.js";

export interface OperationAuthorizationContext {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorRole: BaseRole;
  traceId?: string;
  requestId?: string;
}

export type ResolvedOperationAuthorizationContext =
  AuthenticatedAuditActor &
    Pick<OperationAuthorizationContext, "traceId" | "requestId">;

export async function authorizeTenantOperation(
  input: OperationAuthorizationContext,
  permission: PermissionValue,
): Promise<ResolvedOperationAuthorizationContext> {
  const context = await resolvePersistedActor(input);
  const tenant = await TenantModel.findById(context.tenantId)
    .select("slug isSystemTenant")
    .lean()
    .exec();

  if (!tenant || isSystemPlatformTenant(tenant)) {
    throw permissionDenied();
  }

  await authorizePermission(context, permission);
  return context;
}

export async function authorizePlatformOperation(
  input: OperationAuthorizationContext,
  permission: PermissionValue,
): Promise<ResolvedOperationAuthorizationContext> {
  const context = await resolvePersistedActor(input);
  const tenant = await TenantModel.findById(context.tenantId)
    .select("slug isSystemTenant status")
    .lean()
    .exec();

  if (
    context.actorRole !== "SUPER_ADMIN" ||
    !tenant ||
    tenant.status !== "active" ||
    !isSystemPlatformTenant(tenant)
  ) {
    throw permissionDenied();
  }

  await authorizePermission(context, permission);
  return context;
}

async function resolvePersistedActor(
  input: OperationAuthorizationContext,
): Promise<ResolvedOperationAuthorizationContext> {
  requireAuthenticatedAuditActor(input);
  if (
    !mongoose.isObjectIdOrHexString(input.tenantId) ||
    !mongoose.isObjectIdOrHexString(input.actorId)
  ) {
    throw permissionDenied();
  }

  const actor = await UserModel.findOne({
    _id: input.actorId,
    tenantId: input.tenantId,
    status: "active",
  })
    .select("email role")
    .lean()
    .exec();
  if (!actor) {
    throw permissionDenied();
  }

  return {
    ...requireAuthenticatedAuditActor({
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorEmail: actor.email,
      actorRole: actor.role,
    }),
    traceId: input.traceId,
    requestId: input.requestId,
  };
}

function permissionDenied(): AppError {
  return new AppError(403, PERMISSION_REQUIRED, "Permission denied");
}
