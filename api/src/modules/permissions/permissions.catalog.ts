import {
  BASE_ROLES,
  TENANT_ROLE_BASES,
  isBaseRole,
  type BaseRole,
  type TenantRoleBase,
} from "../../common/auth/baseRoles.js";

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
  DOCUMENTS_DOWNLOAD: "documents:download",
  DOCUMENTS_ARCHIVE: "documents:archive",

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
  DOCUMENTS_OCR_PROCESS: "documents:ocr-process",
  DOCUMENTS_QUALITY_REVIEW: "documents:quality-review",
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
  | "audit"
  | "processing";
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
  allowedCustomRoleBases: readonly TenantRoleBase[];
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

type PermissionDefinitionSource = Omit<
  PermissionDefinition,
  "contractVersion" | "active" | "tenantGrantable" | "allowedCustomRoleBases"
>;

const definitions: readonly PermissionDefinitionSource[] = [
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
  { id: Permission.DOCUMENTS_DOWNLOAD, group: "documents", label: "Download Documents", description: "Download tenant document files", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ALL_SCOPES },
  { id: Permission.DOCUMENTS_ARCHIVE, group: "documents", label: "Archive Documents", description: "Archive and restore tenant documents", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ALL_SCOPES },
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
  { id: Permission.DOCUMENTS_OCR_PROCESS, group: "documents", label: "Process OCR", description: "Trigger OCR processing on documents", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ALL_SCOPES },
  { id: Permission.DOCUMENTS_QUALITY_REVIEW, group: "documents", label: "Review Document Quality", description: "Review and approve/reject low-confidence OCR results", defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], delegableByTenantAdmin: true, platformOnly: false, deprecated: false, compatibleScopes: ALL_SCOPES },
];

export const PERMISSION_CATALOG: readonly PermissionDefinition[] =
  buildPermissionCatalog(definitions);

export const PERMISSION_BY_ID: ReadonlyMap<string, PermissionDefinition> =
  new Map(PERMISSION_CATALOG.map((definition) => [definition.id, definition]));
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
  processing: "Processing",
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
  return PERMISSION_BY_ID.get(value.trim().toLowerCase());
}

export function isDeprecatedPermissionIdentifier(value: string): boolean {
  return DEPRECATED_PERMISSION_IDENTIFIERS.has(value.trim().toLowerCase());
}

export function normalizePermissionIdentifiers(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()))].sort();
}

export function assertPersistableTenantPermissions(values: readonly string[]): PermissionValue[] {
  const normalized = normalizePermissionIdentifiers(values);
  const accepted: PermissionValue[] = [];
  for (const value of normalized) {
    const definition = getPermissionDefinition(value);
    if (!definition || definition.deprecated) throw new Error(`UNKNOWN_PERMISSION:${value}`);
    if (definition.platformOnly || !definition.tenantGrantable || !definition.delegableByTenantAdmin) {
      throw new Error(`NON_DELEGABLE_PERMISSION:${value}`);
    }
    accepted.push(definition.id);
  }
  return accepted;
}

export function isSuperAdminOnlyPermission(permission: string): boolean {
  return getPermissionDefinition(permission)?.platformOnly ?? false;
}

function buildPermissionCatalog(
  sources: readonly PermissionDefinitionSource[],
): readonly PermissionDefinition[] {
  const catalog = sources.map((definition): PermissionDefinition => {
    const active = !definition.deprecated;
    const tenantGrantable =
      active &&
      !definition.platformOnly &&
      definition.delegableByTenantAdmin;
    return {
      ...definition,
      active,
      tenantGrantable,
      allowedCustomRoleBases: tenantGrantable ? [...TENANT_ROLE_BASES] : [],
      contractVersion: PERMISSION_CONTRACT_VERSION,
    };
  });
  validatePermissionCatalog(catalog);
  return catalog;
}

export function validatePermissionCatalog(
  catalog: readonly PermissionDefinition[],
): void {
  const identifiers = new Set<string>();
  const knownScopes = new Set<PermissionScopeType>([
    "departmentIds",
    "documentCategories",
    "documentClassifications",
    "selfOnly",
  ]);

  for (const definition of catalog) {
    if (identifiers.has(definition.id)) {
      throw new Error(`DUPLICATE_PERMISSION:${definition.id}`);
    }
    identifiers.add(definition.id);

    if (
      definition.id !== definition.id.trim().toLowerCase() ||
      !/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(definition.id)
    ) {
      throw new Error(`INVALID_PERMISSION_IDENTIFIER:${definition.id}`);
    }
    if (!definition.label.trim() || !definition.description.trim()) {
      throw new Error(`INCOMPLETE_PERMISSION_METADATA:${definition.id}`);
    }
    if (definition.contractVersion !== PERMISSION_CONTRACT_VERSION) {
      throw new Error(`INVALID_PERMISSION_VERSION:${definition.id}`);
    }
    if (definition.active === definition.deprecated) {
      throw new Error(`INVALID_PERMISSION_LIFECYCLE:${definition.id}`);
    }

    const defaultRoles = new Set(definition.defaultBaseRoles);
    if (
      defaultRoles.size !== definition.defaultBaseRoles.length ||
      definition.defaultBaseRoles.some((role) => !isBaseRole(role))
    ) {
      throw new Error(`INVALID_PERMISSION_BASE_ROLES:${definition.id}`);
    }
    if (
      definition.platformOnly &&
      definition.defaultBaseRoles.some((role) => role !== "SUPER_ADMIN")
    ) {
      throw new Error(`PLATFORM_PERMISSION_TENANT_DEFAULT:${definition.id}`);
    }

    const expectedTenantGrantable =
      definition.active &&
      !definition.platformOnly &&
      definition.delegableByTenantAdmin;
    if (definition.tenantGrantable !== expectedTenantGrantable) {
      throw new Error(`INVALID_TENANT_GRANTABILITY:${definition.id}`);
    }
    const expectedBases = expectedTenantGrantable ? TENANT_ROLE_BASES : [];
    if (
      definition.allowedCustomRoleBases.length !== expectedBases.length ||
      expectedBases.some(
        (role) => !definition.allowedCustomRoleBases.includes(role),
      )
    ) {
      throw new Error(`INVALID_CUSTOM_ROLE_BASES:${definition.id}`);
    }

    const scopes = new Set(definition.compatibleScopes);
    if (
      scopes.size !== definition.compatibleScopes.length ||
      definition.compatibleScopes.some((scope) => !knownScopes.has(scope))
    ) {
      throw new Error(`INVALID_PERMISSION_SCOPES:${definition.id}`);
    }
  }

  const declaredPermissions = new Set<string>(Object.values(Permission));
  if (
    declaredPermissions.size !== identifiers.size ||
    [...declaredPermissions].some((permission) => !identifiers.has(permission))
  ) {
    throw new Error("PERMISSION_CATALOG_DECLARATION_MISMATCH");
  }
  if (BASE_ROLES.length !== 3) {
    throw new Error("BASE_ROLE_CONTRACT_MISMATCH");
  }
}
