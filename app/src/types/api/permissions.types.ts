export interface PermissionItem {
  id: string;
  label: string;
  description: string;
}

export interface PermissionGroup {
  group: string;
  label: string;
  permissions: PermissionItem[];
}

export interface PermissionCatalogResponse {
  success: true;
  data: {
    groups: PermissionGroup[];
  };
}

export interface PermissionScopes {
  selfOnly: boolean;
  departmentIds: string[];
  categories: string[];
}

export interface MyPermissionsResponse {
  success: true;
  data: {
    permissions: string[];
    scopes: PermissionScopes;
    baseRole: string;
  };
}
