import type {
  PermissionCatalogEntry,
  PermissionScopeType,
  PermissionSource,
  PermissionScopes,
} from "@/types/api/permissions.types";

export function deriveInheritedPermissionIds(
  baseRoleDefaults: Record<string, string[]>,
  baseRole: "COMPANY_ADMIN" | "EMPLOYEE",
): string[] {
  return baseRoleDefaults[baseRole] ?? [];
}

export function isTenantSelectable(entry: PermissionCatalogEntry): boolean {
  return entry.active && !entry.deprecated && !entry.platformOnly && entry.tenantGrantable && entry.delegableByTenantAdmin;
}

export function getCompatibleScopes(entry: PermissionCatalogEntry): PermissionScopeType[] {
  return entry.compatibleScopes;
}

export function intersectSelectablePermissions(
  catalog: PermissionCatalogEntry[],
  effectivePermissionIds: Set<string>,
): PermissionCatalogEntry[] {
  return catalog.filter(
    (entry) => isTenantSelectable(entry) && effectivePermissionIds.has(entry.id),
  );
}

export function flattenCatalogEntries(
  groups: ReadonlyArray<{ permissions: PermissionCatalogEntry[] }>,
): PermissionCatalogEntry[] {
  return groups.flatMap((group) => group.permissions);
}

export function canPermission(
  permission: string,
  effectivePermissions: Set<string>,
): boolean {
  return effectivePermissions.has(permission);
}

export function combineSelectableWithActorGrants(
  catalogEntries: PermissionCatalogEntry[],
  grants: Record<string, { source: PermissionSource; scope: PermissionScopes | null }>,
): Array<{ entry: PermissionCatalogEntry; source: PermissionSource; scope: PermissionScopes | null }> {
  return catalogEntries
    .filter(isTenantSelectable)
    .filter((entry) => entry.id in grants)
    .map((entry) => {
      const grant = grants[entry.id]!;
      return {
        entry,
        source: grant.source,
        scope: grant.scope,
      };
    });
}

export function createIdentityKey(tenantId: string | null, userId: string | null): string | null {
  if (!tenantId || !userId) return null;
  return `${tenantId}:${userId}`;
}

export type PermissionLifecycleAction =
  | { kind: "set_loading" }
  | { kind: "set_idle" }
  | { kind: "load_permissions"; identityKey: string }
  | { kind: "stay" };

export function computeNextPermissionAction(
  authStatus: string,
  currentIdentityKey: string | null,
  lastIdentityKey: string | null,
): PermissionLifecycleAction {
  if (authStatus === "loading") return { kind: "set_loading" };
  if (authStatus === "unauthenticated") return { kind: "set_idle" };
  if (currentIdentityKey && currentIdentityKey !== lastIdentityKey) {
    return { kind: "load_permissions", identityKey: currentIdentityKey };
  }
  return { kind: "stay" };
}

export function shouldApplyResponse(
  currentGen: number,
  responseGen: number,
  isMounted: boolean,
): boolean {
  return isMounted && responseGen === currentGen;
}

export function canRefreshPermissions(authStatus: string): boolean {
  return authStatus === "authenticated";
}
