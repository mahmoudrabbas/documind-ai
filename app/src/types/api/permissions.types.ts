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
    grants: Record<string, { source: PermissionSource; scope: PermissionScopes | null }>;
    baseRole: string;
    customRoleId: string | null;
    customRoleState: CustomRoleState;
    roleVersion: number | null;
  };
}
