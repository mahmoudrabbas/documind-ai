import {
  getPermissionDefinition,
  isDeprecatedPermissionIdentifier,
  type PermissionValue,
} from "./permissions.catalog.js";
import { hasScopeConstraints, isValidResourceContext, matchesScopes } from "./permissions.scope.js";
import type {
  PermissionDecision,
  PermissionEvaluationInput,
  ResolvedPermissions,
} from "./permissions.types.js";

export function decidePermission(
  input: PermissionEvaluationInput,
  resolved: ResolvedPermissions,
): PermissionDecision {
  const definition = getPermissionDefinition(input.permission);
  if (isDeprecatedPermissionIdentifier(input.permission)) return denied(input.permission, "DEPRECATED_PERMISSION", "Permission is deprecated", resolved);
  if (!definition) return denied(input.permission, "UNKNOWN_PERMISSION", "Permission is not in the canonical catalog", resolved);
  if (definition.deprecated) return denied(definition.id, "DEPRECATED_PERMISSION", "Permission is deprecated", resolved);
  if (input.resource && input.resource.tenantId !== input.tenantId) {
    return denied(definition.id, "TENANT_MISMATCH", "Resource context is outside the actor tenant", resolved);
  }
  if (input.resource && !isValidResourceContext(input.resource)) {
    return denied(definition.id, "SCOPE_MISMATCH", "Resource context is invalid", resolved);
  }

  const grant = resolved.grants.get(definition.id);
  if (!grant) {
    if (resolved.customRoleState === "invalid") return denied(definition.id, "INVALID_ROLE", "Assigned custom role failed security validation", resolved);
    if (resolved.customRoleState === "archived") return denied(definition.id, "ROLE_ARCHIVED", "Assigned custom role is archived", resolved);
    if (resolved.customRoleState === "missing") return denied(definition.id, "ROLE_NOT_FOUND", "Assigned custom role is unavailable", resolved);
    return denied(definition.id, "PERMISSION_REQUIRED", "Permission is not granted", resolved);
  }

  if (grant.scope && hasScopeConstraints(grant.scope)) {
    if (!input.resource) return denied(
      definition.id,
      "RESOURCE_CONTEXT_REQUIRED",
      "A resource context is required for this scoped grant",
      resolved,
      grant,
    );
    if (!matchesScopes(input.actorId, grant.scope, input.resource)) {
      return denied(
        definition.id,
        "SCOPE_MISMATCH",
        "Resource context does not satisfy the grant scope",
        resolved,
        grant,
      );
    }
  }

  return {
    allowed: true,
    permission: definition.id,
    source: grant.source,
    scope: grant.scope,
    denialCode: null,
    reason: null,
    roleId: resolved.customRoleId,
    roleVersion: resolved.roleVersion,
  };
}

function denied(
  permission: string,
  denialCode: Exclude<PermissionDecision["denialCode"], null>,
  reason: string,
  resolved: ResolvedPermissions,
  grant?: ResolvedPermissions["grants"] extends ReadonlyMap<PermissionValue, infer T> ? T : never,
): PermissionDecision {
  return {
    allowed: false,
    permission,
    source: grant?.source ?? null,
    scope: grant?.scope ?? null,
    denialCode,
    reason,
    roleId: resolved.customRoleId,
    roleVersion: resolved.roleVersion,
  };
}

export function emptyResolved(baseRole: ResolvedPermissions["baseRole"]): ResolvedPermissions {
  return {
    permissions: new Set<PermissionValue>(),
    grants: new Map(),
    baseRole,
    customRoleId: null,
    roleVersion: null,
    customRoleState: "none",
  };
}
