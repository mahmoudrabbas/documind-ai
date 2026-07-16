import mongoose from "mongoose";
import {
  getPermissionDefinition,
  type PermissionValue,
} from "./permissions.catalog.js";
import {
  hasScopeConstraints,
  normalizeScopes,
  validateScopeCompatibility,
} from "./permissions.scope.js";
import type { PermissionGrant, PermissionScopes } from "./permissions.types.js";

export type GrantValidationCode =
  | "UNKNOWN_PERMISSION"
  | "PRIVILEGE_ESCALATION"
  | "INVALID_GRANT";

export class GrantValidationError extends Error {
  constructor(public readonly code: GrantValidationCode, message: string) {
    super(message);
    this.name = "GrantValidationError";
  }
}

export function normalizeRoleGrants(
  value: unknown,
  options: { requireCanonical?: boolean } = {},
): PermissionGrant[] {
  if (!Array.isArray(value)) {
    throw new GrantValidationError("INVALID_GRANT", "grants must be an array");
  }

  const grants = new Map<PermissionValue, PermissionGrant>();
  for (const raw of value) {
    if (!isPlainObject(raw) || typeof raw.permission !== "string") {
      throw new GrantValidationError("INVALID_GRANT", "each grant must contain a permission");
    }
    if (Object.keys(raw).some((key) => key !== "permission" && key !== "scopes")) {
      throw new GrantValidationError("INVALID_GRANT", "grant contains unsupported fields");
    }

    const normalizedPermission = raw.permission.trim().toLowerCase();
    const definition = getPermissionDefinition(normalizedPermission);
    if (!definition || definition.deprecated || !definition.active) {
      throw new GrantValidationError("UNKNOWN_PERMISSION", "permission is unknown or inactive");
    }
    if (definition.platformOnly || !definition.tenantGrantable || !definition.delegableByTenantAdmin) {
      throw new GrantValidationError("PRIVILEGE_ESCALATION", "permission is not tenant-grantable");
    }

    const scopes = normalizeGrantScopes(raw.scopes);
    const incompatibility = validateScopeCompatibility([definition.id], scopes ?? normalizeScopes());
    if (incompatibility) throw new GrantValidationError("INVALID_GRANT", incompatibility);

    const grant: PermissionGrant = scopes
      ? { permission: definition.id, scopes }
      : { permission: definition.id };
    const existing = grants.get(definition.id);
    if (existing) {
      if (!existing.scopes || !grant.scopes) {
        grants.set(definition.id, { permission: definition.id });
        continue;
      }
      throw new GrantValidationError(
        "INVALID_GRANT",
        `duplicate scoped grant for ${definition.id}`,
      );
    }
    grants.set(definition.id, grant);
  }

  const normalized = [...grants.values()].sort((left, right) =>
    left.permission.localeCompare(right.permission));
  if (options.requireCanonical && JSON.stringify(value) !== JSON.stringify(normalized)) {
    throw new GrantValidationError("INVALID_GRANT", "persisted grants are not canonical");
  }
  return normalized;
}

function normalizeGrantScopes(value: unknown): PermissionScopes | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) {
    throw new GrantValidationError("INVALID_GRANT", "grant scopes must be an object");
  }
  const allowed = new Set([
    "selfOnly",
    "departmentIds",
    "documentCategories",
    "documentClassifications",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new GrantValidationError("INVALID_GRANT", "grant scopes contain unsupported fields");
  }
  if (value.selfOnly !== undefined && typeof value.selfOnly !== "boolean") {
    throw new GrantValidationError("INVALID_GRANT", "selfOnly must be boolean");
  }
  for (const field of ["departmentIds", "documentCategories", "documentClassifications"] as const) {
    const values = value[field];
    if (values !== undefined && (!Array.isArray(values) || values.some((item) => typeof item !== "string"))) {
      throw new GrantValidationError("INVALID_GRANT", `${field} must be a string array`);
    }
  }
  const scopes = normalizeScopes(value as Partial<PermissionScopes>);
  if (scopes.departmentIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw new GrantValidationError("INVALID_GRANT", "departmentIds contain an invalid identifier");
  }
  return hasScopeConstraints(scopes) ? scopes : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
