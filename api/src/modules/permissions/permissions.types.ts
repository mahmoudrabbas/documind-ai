import type { BaseRole } from "../../common/auth/baseRoles.js";
import type { PermissionValue } from "./permissions.catalog.js";

export interface PermissionScopes {
  selfOnly: boolean;
  departmentIds: string[];
  documentCategories: string[];
  documentClassifications: string[];
}

export interface PermissionGrant {
  permission: PermissionValue;
  scopes?: PermissionScopes;
}

export interface PermissionActor {
  tenantId: string;
  actorId: string;
  baseRole: BaseRole;
  customRoleId?: string | null;
}

export interface PermissionResourceContext {
  tenantId: string;
  ownerId?: string;
  departmentId?: string;
  documentCategory?: string;
  documentClassification?: string;
}

export interface PermissionEvaluationInput extends PermissionActor {
  permission: PermissionValue | string;
  resource?: PermissionResourceContext;
}

export type PermissionSource = "platform" | "base-role" | "custom-role";
export type PermissionDenialCode =
  | "UNKNOWN_PERMISSION"
  | "DEPRECATED_PERMISSION"
  | "INVALID_ACTOR"
  | "TENANT_MISMATCH"
  | "ROLE_NOT_FOUND"
  | "ROLE_ARCHIVED"
  | "ROLE_NOT_ASSIGNABLE"
  | "INVALID_ROLE"
  | "PERMISSION_REQUIRED"
  | "RESOURCE_CONTEXT_REQUIRED"
  | "SCOPE_MISMATCH";

export interface PermissionDecision {
  allowed: boolean;
  permission: string;
  source: PermissionSource | null;
  scope: PermissionScopes | null;
  denialCode: PermissionDenialCode | null;
  reason: string | null;
  roleId: string | null;
  roleVersion: number | null;
}

export interface PermissionAuthorizationContext {
  permission: string;
  actorId: string;
  tenantId: string;
  source: PermissionSource;
  scopes: PermissionScopes | null;
  resourceContextRequired: boolean;
  roleId: string | null;
  roleVersion: number | null;
}

export interface ResolvedPermissions {
  permissions: ReadonlySet<PermissionValue>;
  grants: ReadonlyMap<PermissionValue, { source: PermissionSource; scope: PermissionScopes | null }>;
  baseRole: BaseRole;
  customRoleId: string | null;
  roleVersion: number | null;
  customRoleState: "none" | "active" | "missing" | "archived" | "invalid";
}

export interface PermissionEvaluator {
  resolve(actor: PermissionActor): Promise<ResolvedPermissions>;
  evaluate(input: PermissionEvaluationInput): Promise<PermissionDecision>;
  evict(actorId: string, tenantId: string): void;
  evictAllForTenant(tenantId: string): void;
}

export interface PermissionCatalogGroup {
  group: string;
  label: string;
  permissions: Array<{ id: string; label: string; description: string }>;
}

export interface PermissionCatalogResponse {
  contractVersion: number;
  groups: PermissionCatalogGroup[];
}

export const DEFAULT_SCOPES: PermissionScopes = {
  selfOnly: false,
  departmentIds: [],
  documentCategories: [],
  documentClassifications: [],
};
