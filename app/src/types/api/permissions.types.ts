// Canonical Permission Contract v1 identifiers. This is an identifier type
// surface only; effective grants and catalog metadata always come from the API.
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

export interface PermissionScopes {
  selfOnly: boolean;
  departmentIds: string[];
  documentCategories: string[];
  documentClassifications: string[];
}

export interface PermissionGrant {
  permission: string;
  scopes?: PermissionScopes;
}

export interface PermissionCatalogEntry {
  id: string;
  label: string;
  description: string;
  compatibleScopes: PermissionScopeType[];
  defaultBaseRoles: Array<"SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE">;
  allowedCustomRoleBases: Array<"COMPANY_ADMIN" | "EMPLOYEE">;
  active: boolean;
  deprecated: boolean;
  platformOnly: boolean;
  tenantGrantable: boolean;
  delegableByTenantAdmin: boolean;
  contractVersion: number;
}

export interface PermissionCatalogGroup {
  group: string;
  label: string;
  permissions: PermissionCatalogEntry[];
}

export type PermissionScopeType =
  | "selfOnly"
  | "departmentIds"
  | "documentCategories"
  | "documentClassifications";

export interface PermissionCatalogResponse {
  success: true;
  data: {
    contractVersion: number;
    groups: PermissionCatalogGroup[];
    baseRoleDefaults: Record<string, string[]>;
  };
}

export type PermissionSource = "platform" | "base-role" | "custom-role";

export type CustomRoleState = "none" | "active" | "missing" | "archived" | "invalid";

export interface CurrentPermissionsResponse {
  success: true;
  data: {
    permissions: string[];
    grants: Record<
      string,
      { source: PermissionSource; scope: PermissionScopes | null }
    >;
    baseRole: string;
    customRoleId: string | null;
    customRoleState: CustomRoleState;
    roleVersion: number | null;
  };
}
