import mongoose from "mongoose";
import type { BaseRole } from "../../common/auth/baseRoles.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  INVALID_PERMISSION,
  PERMISSION_REQUIRED,
  PRIVILEGE_ESCALATION,
  SCOPE_MISMATCH,
} from "../../common/errors/errorCodes.js";
import UserModel from "../../db/models/user.model.js";
import { getPermissionDefinition, isDeprecatedPermissionIdentifier, type PermissionValue } from "./permissions.catalog.js";
import { getPermissionEvaluator } from "./permissions.evaluator.js";
import { hasScopeConstraints } from "./permissions.scope.js";
import type {
  PermissionDecision,
  PermissionGrant,
  PermissionResourceContext,
  PermissionScopes,
} from "./permissions.types.js";

export interface AuthorizationActor {
  actorId: string;
  tenantId: string;
  baseRole?: BaseRole;
}

export async function authorizePermission(
  actor: AuthorizationActor,
  permission: PermissionValue | string,
  resource?: PermissionResourceContext,
): Promise<PermissionDecision> {
  if (!mongoose.isObjectIdOrHexString(actor.actorId) || !mongoose.isObjectIdOrHexString(actor.tenantId)) {
    throw new AppError(403, PERMISSION_REQUIRED, "Permission denied");
  }
  const definition = getPermissionDefinition(permission);
  if (!definition || isDeprecatedPermissionIdentifier(permission) || definition.deprecated || !definition.active) {
    throw new AppError(400, INVALID_PERMISSION, "Permission identifier is unknown or deprecated");
  }
  validateResourceContext(actor.tenantId, resource);
  const user = await UserModel.findOne({ _id: actor.actorId, tenantId: actor.tenantId }).select("role").lean().exec();
  if (!user) throw new AppError(403, PERMISSION_REQUIRED, "Permission denied");
  const decision = await getPermissionEvaluator().evaluate({
    actorId: actor.actorId,
    tenantId: actor.tenantId,
    baseRole: user.role,
    permission: definition.id,
    resource,
  });
  if (!decision.allowed) {
    const code = decision.denialCode === "SCOPE_MISMATCH" || decision.denialCode === "TENANT_MISMATCH"
      ? SCOPE_MISMATCH
      : PERMISSION_REQUIRED;
    throw new AppError(403, code, "Permission denied");
  }
  return decision;
}

export async function assertDelegableGrants(actor: AuthorizationActor, grants: readonly PermissionGrant[]): Promise<void> {
  const user = await UserModel.findOne({ _id: actor.actorId, tenantId: actor.tenantId }).select("role").lean().exec();
  if (!user) throw new AppError(403, PERMISSION_REQUIRED, "Permission denied");
  const resolved = await getPermissionEvaluator().resolve({
    actorId: actor.actorId,
    tenantId: actor.tenantId,
    baseRole: user.role,
  });
  for (const grant of grants) {
    const definition = getPermissionDefinition(grant.permission);
    const actorGrant = definition ? resolved.grants.get(definition.id) : undefined;
    if (!definition || isDeprecatedPermissionIdentifier(grant.permission) || definition.deprecated || !definition.active) {
      throw new AppError(400, INVALID_PERMISSION, "Permission identifier is unknown or deprecated");
    }
    if (definition.platformOnly || !definition.tenantGrantable || !definition.delegableByTenantAdmin ||
        !actorGrant || !scopeContains(actorGrant.scope, grant.scopes ?? null)) {
      throw new AppError(403, PRIVILEGE_ESCALATION, "Actor cannot delegate the requested permission scope");
    }
  }
}

export function scopeContains(parent: PermissionScopes | null, requested: PermissionScopes | null): boolean {
  if (!parent || !hasScopeConstraints(parent)) return true;
  if (!requested || !hasScopeConstraints(requested)) return false;
  if (parent.selfOnly && !requested.selfOnly) return false;
  return containsValues(parent.departmentIds, requested.departmentIds) &&
    containsValues(parent.documentCategories, requested.documentCategories) &&
    containsValues(parent.documentClassifications, requested.documentClassifications);
}

function containsValues(parent: readonly string[], requested: readonly string[]): boolean {
  if (parent.length === 0) return true;
  return requested.length > 0 && requested.every((value) => parent.includes(value));
}

function validateResourceContext(tenantId: string, resource?: PermissionResourceContext): void {
  if (!resource) return;
  if (resource.tenantId !== tenantId) throw new AppError(403, SCOPE_MISMATCH, "Resource tenant mismatch");
  for (const value of [resource.ownerId, resource.departmentId]) {
    if (value !== undefined && !mongoose.isObjectIdOrHexString(value)) {
      throw new AppError(403, SCOPE_MISMATCH, "Resource scope identifier is invalid");
    }
  }
  for (const value of [resource.documentCategory, resource.documentClassification]) {
    if (value !== undefined && value.trim().length === 0) {
      throw new AppError(403, SCOPE_MISMATCH, "Resource scope value is invalid");
    }
  }
}
