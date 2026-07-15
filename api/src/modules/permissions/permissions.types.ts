export interface PermissionScopes {
  selfOnly: boolean;
  departmentIds: string[];
  categories: string[];
}

export interface ResolvedPermissions {
  permissions: ReadonlySet<string>;
  scopes: PermissionScopes;
  baseRole: string;
}

export interface PermissionEvaluator {
  resolve(
    userId: string,
    tenantId: string,
  ): Promise<ResolvedPermissions>;
  evict(userId: string, tenantId: string): void;
  evictAllForTenant(tenantId: string): void;
}

export interface PermissionCatalogGroup {
  group: string;
  label: string;
  permissions: Array<{
    id: string;
    label: string;
    description: string;
  }>;
}

export const DEFAULT_SCOPES: PermissionScopes = {
  selfOnly: false,
  departmentIds: [],
  categories: [],
};
