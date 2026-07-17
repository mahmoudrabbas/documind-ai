import { getPermissionDefinition } from "./permissions.catalog.js";
import mongoose from "mongoose";
import type {
  PermissionResourceContext,
  PermissionScopes,
} from "./permissions.types.js";

export function normalizeScopes(
  scopes?: Partial<PermissionScopes> | null,
): PermissionScopes {
  return {
    selfOnly: scopes?.selfOnly === true,
    departmentIds: normalizeValues(scopes?.departmentIds, false),
    documentCategories: normalizeValues(scopes?.documentCategories, true),
    documentClassifications: normalizeValues(
      scopes?.documentClassifications,
      true,
    ),
  };
}

function normalizeValues(
  values: readonly string[] | undefined,
  lowercase: boolean,
): string[] {
  if (!values) return [];
  return [...new Set(values.map((value) => {
    const trimmed = value.trim();
    return lowercase ? trimmed.toLowerCase() : trimmed;
  }).filter(Boolean))].sort();
}

export function validateScopeCompatibility(
  permissions: readonly string[],
  scopes: PermissionScopes,
): string | null {
  const configured = [
    scopes.selfOnly && "selfOnly",
    scopes.departmentIds.length > 0 && "departmentIds",
    scopes.documentCategories.length > 0 && "documentCategories",
    scopes.documentClassifications.length > 0 && "documentClassifications",
  ].filter(Boolean) as Array<keyof PermissionScopes>;

  for (const permission of permissions) {
    const compatible = getPermissionDefinition(permission)?.compatibleScopes ?? [];
    for (const scope of configured) {
      if (!compatible.includes(scope)) {
        return `${scope} is not supported by ${permission}`;
      }
    }
  }
  return null;
}

export function hasScopeConstraints(scopes: PermissionScopes): boolean {
  return scopes.selfOnly || scopes.departmentIds.length > 0 ||
    scopes.documentCategories.length > 0 ||
    scopes.documentClassifications.length > 0;
}

export function matchesScopes(
  actorId: string,
  scopes: PermissionScopes,
  resource: PermissionResourceContext,
): boolean {
  if (scopes.selfOnly && resource.ownerId !== actorId) return false;
  if (scopes.departmentIds.length > 0 &&
      (!resource.departmentId || !scopes.departmentIds.includes(resource.departmentId))) return false;
  if (scopes.documentCategories.length > 0 &&
      (!resource.documentCategory || !scopes.documentCategories.includes(resource.documentCategory.trim().toLowerCase()))) return false;
  if (scopes.documentClassifications.length > 0 &&
      (!resource.documentClassification || !scopes.documentClassifications.includes(resource.documentClassification.trim().toLowerCase()))) return false;
  return true;
}

export function isValidResourceContext(resource: PermissionResourceContext): boolean {
  if (!mongoose.isObjectIdOrHexString(resource.tenantId)) return false;
  if (resource.ownerId !== undefined && !mongoose.isObjectIdOrHexString(resource.ownerId)) return false;
  if (resource.departmentId !== undefined && !mongoose.isObjectIdOrHexString(resource.departmentId)) return false;
  if (resource.documentCategory !== undefined && resource.documentCategory.trim().length === 0) return false;
  if (resource.documentClassification !== undefined && resource.documentClassification.trim().length === 0) return false;
  return true;
}
