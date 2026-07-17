import type { BaseRole } from "../../common/auth/baseRoles.js";

export const PERMISSION_CONTRACT_VERSION = 1 as const;

export const Permission = {
  USERS_READ: "users:read",
  USERS_CREATE: "users:create",
  USERS_UPDATE: "users:update",
  USERS_DELETE: "users:delete",
  USERS_ASSIGN_ROLE: "users:assign-role",
  ROLES_READ: "roles:read",
  ROLES_CREATE: "roles:create",
  ROLES_UPDATE: "roles:update",
  ROLES_DELETE: "roles:delete",
  DOCUMENTS_READ: "documents:read",
  DOCUMENTS_CREATE: "documents:create",
  DOCUMENTS_UPDATE: "documents:update",
  DOCUMENTS_DELETE: "documents:delete",
  CHAT_READ: "chat:read",
  CHAT_CREATE: "chat:create",
  CHAT_DELETE: "chat:delete",
  ANALYTICS_READ: "analytics:read",
  ANALYTICS_EXPORT: "analytics:export",
  KNOWLEDGE_GAPS_READ: "knowledge-gaps:read",
  KNOWLEDGE_GAPS_UPDATE: "knowledge-gaps:update",
  COMPANY_SETTINGS_READ: "company-settings:read",
  COMPANY_SETTINGS_UPDATE: "company-settings:update",
  BILLING_READ: "billing:read",
  BILLING_MANAGE: "billing:manage",
  IMPORTS_CREATE: "imports:create",
  IMPORTS_READ: "imports:read",
  AUDIT_READ: "audit:read",
} as const;

export type PermissionValue = (typeof Permission)[keyof typeof Permission];
export type PermissionGroup =
  | "users"
  | "roles"
  | "documents"
  | "chat"
  | "analytics"
  | "knowledge-gaps"
  | "company-settings"
  | "billing"
  | "imports"
  | "audit";
export type PermissionScopeType =
  | "departmentIds"
  | "documentCategories"
  | "documentClassifications"
  | "selfOnly";

export interface PermissionDefinition {
  id: PermissionValue;
  group: PermissionGroup;
  label: string;
  description: string;
  defaultBaseRoles: readonly BaseRole[];
  delegableByTenantAdmin: boolean;
  platformOnly: boolean;
  deprecated: boolean;
  active: boolean;
  tenantGrantable: boolean;
  compatibleScopes: readonly PermissionScopeType[];
  contractVersion: typeof PERMISSION_CONTRACT_VERSION;
}

const ALL_SCOPES: readonly PermissionScopeType[] = [
  "departmentIds",
  "documentCategories",
  "documentClassifications",
  "selfOnly",
];
const SELF_SCOPE: readonly PermissionScopeType[] = ["selfOnly"];
const NO_SCOPES: readonly PermissionScopeType[] = [];

const definitions: Array<Omit<PermissionDefinition, "contractVersion" | "active" | "tenantGrantable">> = [
  { id: Permission.USERS_READ, group: "users", label: "View Users", description: "List and view tenant users", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ["departmentIds", "selfOnly"] },
  { id: Permission.USERS_CREATE, group: "users", label: "Invite Users", description: "Invite tenant users", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: NO_SCOPES },
  { id: Permission.USERS_UPDATE, group: "users", label: "Edit Users", description: "Edit tenant users", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ["departmentIds", "selfOnly"] },
  { id: Permission.USERS_DELETE, group: "users", label: "Remove Users", description: "Remove tenant users", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: false, platformOnly: false, deprecated: false, compatibleScopes: NO_SCOPES },
  { id: Permission.USERS_ASSIGN_ROLE, group: "users", label: "Assign Roles", description: "Assign tenant custom roles", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: false, platformOnly: false, deprecated: false, compatibleScopes: NO_SCOPES },
  { id: Permission.ROLES_READ, group: "roles", label: "View Roles", description: "View tenant roles", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: NO_SCOPES },
  { id: Permission.ROLES_CREATE, group: "roles", label: "Create Roles", description: "Create tenant roles", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: false, platformOnly: false, deprecated: false, compatibleScopes: NO_SCOPES },
  { id: Permission.ROLES_UPDATE, group: "roles", label: "Edit Roles", description: "Edit tenant roles", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: false, platformOnly: false, deprecated: false, compatibleScopes: NO_SCOPES },
  { id: Permission.ROLES_DELETE, group: "roles", label: "Delete Roles", description: "Delete tenant roles", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: false, platformOnly: false, deprecated: false, compatibleScopes: NO_SCOPES },
  { id: Permission.DOCUMENTS_READ, group: "documents", label: "View Documents", description: "View tenant documents", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ALL_SCOPES },
  { id: Permission.DOCUMENTS_CREATE, group: "documents", label: "Upload Documents", description: "Upload tenant documents", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ["departmentIds", "documentCategories", "documentClassifications"] },
  { id: Permission.DOCUMENTS_UPDATE, group: "documents", label: "Edit Documents", description: "Edit tenant documents", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ALL_SCOPES },
  { id: Permission.DOCUMENTS_DELETE, group: "documents", label: "Delete Documents", description: "Delete tenant documents", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ALL_SCOPES },
  { id: Permission.CHAT_READ, group: "chat", label: "View Conversations", description: "View conversations", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: SELF_SCOPE },
  { id: Permission.CHAT_CREATE, group: "chat", label: "Create Conversations", description: "Create conversations", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: SELF_SCOPE },
  { id: Permission.CHAT_DELETE, group: "chat", label: "Delete Conversations", description: "Delete conversations", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: SELF_SCOPE },
  { id: Permission.ANALYTICS_READ, group: "analytics", label: "View Analytics", description: "View tenant analytics", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ["departmentIds"] },
  { id: Permission.ANALYTICS_EXPORT, group: "analytics", label: "Export Analytics", description: "Export tenant analytics", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ["departmentIds"] },
  { id: Permission.KNOWLEDGE_GAPS_READ, group: "knowledge-gaps", label: "View Knowledge Gaps", description: "View tenant knowledge gaps", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ["departmentIds", "documentCategories", "documentClassifications"] },
  { id: Permission.KNOWLEDGE_GAPS_UPDATE, group: "knowledge-gaps", label: "Resolve Knowledge Gaps", description: "Update tenant knowledge gaps", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ["departmentIds", "documentCategories", "documentClassifications"] },
  { id: Permission.COMPANY_SETTINGS_READ, group: "company-settings", label: "View Company Settings", description: "View tenant settings", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: NO_SCOPES },
  { id: Permission.COMPANY_SETTINGS_UPDATE, group: "company-settings", label: "Edit Company Settings", description: "Edit tenant settings", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: false, platformOnly: false, deprecated: false, compatibleScopes: NO_SCOPES },
  { id: Permission.BILLING_READ, group: "billing", label: "View Billing", description: "View tenant billing", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: NO_SCOPES },
  { id: Permission.BILLING_MANAGE, group: "billing", label: "Manage Billing", description: "Manage tenant billing", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: false, platformOnly: false, deprecated: false, compatibleScopes: NO_SCOPES },
  { id: Permission.IMPORTS_CREATE, group: "imports", label: "Create Imports", description: "Create tenant imports", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ["departmentIds"] },
  { id: Permission.IMPORTS_READ, group: "imports", label: "View Imports", description: "View tenant imports", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ["departmentIds"] },
  { id: Permission.AUDIT_READ, group: "audit", label: "View Audit Logs", description: "View tenant audit logs", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: false, platformOnly: false, deprecated: false, compatibleScopes: NO_SCOPES },
];

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = definitions.map((definition) => ({
  ...definition,
  active: !definition.deprecated,
  tenantGrantable: !definition.platformOnly && !definition.deprecated && definition.delegableByTenantAdmin,
  contractVersion: PERMISSION_CONTRACT_VERSION,
}));

export const PERMISSION_BY_ID = new Map(PERMISSION_CATALOG.map((definition) => [definition.id, definition]));
const DEPRECATED_PERMISSION_IDENTIFIERS = new Set(["documents:view"]);
export const ALL_PERMISSIONS = PERMISSION_CATALOG.filter((definition) => definition.active).map((definition) => definition.id);
export const VALID_PERMISSIONS = new Set<PermissionValue>(ALL_PERMISSIONS);
export const BASE_ROLE_DEFAULTS: Record<BaseRole, readonly PermissionValue[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  COMPANY_ADMIN: PERMISSION_CATALOG.filter((item) => item.defaultBaseRoles.includes("COMPANY_ADMIN")).map((item) => item.id),
  EMPLOYEE: PERMISSION_CATALOG.filter((item) => item.defaultBaseRoles.includes("EMPLOYEE")).map((item) => item.id),
};

export const PERMISSION_CATALOG_GROUPS = Array.from(
  PERMISSION_CATALOG.reduce((groups, permission) => {
    const group = groups.get(permission.group) ?? { group: permission.group, label: permission.group, permissions: [] as PermissionValue[] };
    group.permissions.push(permission.id);
    groups.set(permission.group, group);
    return groups;
  }, new Map<PermissionGroup, { group: PermissionGroup; label: string; permissions: PermissionValue[] }>()).values(),
);

const GROUP_LABELS: Record<PermissionGroup, string> = {
  users: "Users",
  roles: "Roles",
  documents: "Documents",
  chat: "Chat",
  analytics: "Analytics",
  "knowledge-gaps": "Knowledge Gaps",
  "company-settings": "Company Settings",
  billing: "Billing",
  imports: "Imports",
  audit: "Audit",
};

export const TENANT_PERMISSION_CATALOG_GROUPS = Array.from(
  PERMISSION_CATALOG.filter((permission) => permission.tenantGrantable).reduce((groups, permission) => {
    const group = groups.get(permission.group) ?? { group: permission.group, label: GROUP_LABELS[permission.group], permissions: [] as PermissionValue[] };
    group.permissions.push(permission.id);
    groups.set(permission.group, group);
    return groups;
  }, new Map<PermissionGroup, { group: PermissionGroup; label: string; permissions: PermissionValue[] }>()).values(),
);

export const PERMISSION_LABELS = Object.fromEntries(PERMISSION_CATALOG.map((item) => [item.id, item.label])) as Record<PermissionValue, string>;
export const PERMISSION_DESCRIPTIONS = Object.fromEntries(PERMISSION_CATALOG.map((item) => [item.id, item.description])) as Record<PermissionValue, string>;

export function getPermissionDefinition(value: string): PermissionDefinition | undefined {
  return PERMISSION_BY_ID.get(value.trim().toLowerCase() as PermissionValue);
}

export function isDeprecatedPermissionIdentifier(value: string): boolean {
  return DEPRECATED_PERMISSION_IDENTIFIERS.has(value.trim().toLowerCase());
}

export function normalizePermissionIdentifiers(values: readonly string[]): PermissionValue[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()))].sort() as PermissionValue[];
}

export function assertPersistableTenantPermissions(values: readonly string[]): PermissionValue[] {
  const normalized = normalizePermissionIdentifiers(values);
  for (const value of normalized) {
    const definition = getPermissionDefinition(value);
    if (!definition || definition.deprecated) throw new Error(`UNKNOWN_PERMISSION:${value}`);
    if (definition.platformOnly || !definition.tenantGrantable || !definition.delegableByTenantAdmin) {
      throw new Error(`NON_DELEGABLE_PERMISSION:${value}`);
    }
  }
  return normalized;
}

export function isSuperAdminOnlyPermission(permission: string): boolean {
  return getPermissionDefinition(permission)?.platformOnly ?? false;
}
