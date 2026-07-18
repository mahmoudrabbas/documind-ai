import type {
  PermissionCatalogEntry,
  PermissionCatalogGroup,
  PermissionGrant,
  PermissionScopeType,
  PermissionSource,
  PermissionScopes,
} from "@/types/api/permissions.types";

export type ActorGrantMap = Record<
  string,
  { source: PermissionSource; scope: PermissionScopes | null }
>;

export function deriveInheritedPermissionIds(
  baseRoleDefaults: Record<string, string[]>,
  baseRole: "COMPANY_ADMIN" | "EMPLOYEE",
): string[] {
  return [...(baseRoleDefaults[baseRole] ?? [])];
}

export function isTenantSelectable(entry: PermissionCatalogEntry): boolean {
  return (
    entry.active &&
    !entry.deprecated &&
    !entry.platformOnly &&
    entry.tenantGrantable &&
    entry.delegableByTenantAdmin &&
    entry.allowedCustomRoleBases.length > 0
  );
}

export function getCompatibleScopes(
  entry: PermissionCatalogEntry,
): PermissionScopeType[] {
  return [...entry.compatibleScopes];
}

export function intersectSelectablePermissions(
  catalog: PermissionCatalogEntry[],
  effectivePermissionIds: Set<string>,
): PermissionCatalogEntry[] {
  return catalog.filter(
    (entry) =>
      isTenantSelectable(entry) && effectivePermissionIds.has(entry.id),
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
  grants: ActorGrantMap,
): Array<{
  entry: PermissionCatalogEntry;
  source: PermissionSource;
  scope: PermissionScopes | null;
}> {
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

export function filterCatalogGroupsForActor(
  groups: PermissionCatalogGroup[],
  grants: ActorGrantMap,
): PermissionCatalogGroup[] {
  const selectableIds = new Set(
    combineSelectableWithActorGrants(flattenCatalogEntries(groups), grants).map(
      ({ entry }) => entry.id,
    ),
  );

  return groups
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter((entry) =>
        selectableIds.has(entry.id),
      ),
    }))
    .filter((group) => group.permissions.length > 0);
}

export function createIdentityKey(
  tenantId: string | null,
  userId: string | null,
): string | null {
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

export function emptyPermissionScopes(): PermissionScopes {
  return {
    selfOnly: false,
    departmentIds: [],
    documentCategories: [],
    documentClassifications: [],
  };
}

export function permissionScopesAreEmpty(
  scopes: PermissionScopes | null | undefined,
): boolean {
  if (!scopes) return true;
  return (
    !scopes.selfOnly &&
    scopes.departmentIds.length === 0 &&
    scopes.documentCategories.length === 0 &&
    scopes.documentClassifications.length === 0
  );
}

export function scopeContains(
  parentScope: PermissionScopes | null,
  requestedScope: PermissionScopes | null,
): { valid: true } | { valid: false; reason: string } {
  // A null actor scope, or a scope object with no constraints, is unrestricted.
  if (!parentScope || permissionScopesAreEmpty(parentScope)) {
    return { valid: true };
  }

  // An omitted requested scope means unrestricted access. That is broader than
  // any restricted actor grant.
  if (!requestedScope) {
    return {
      valid: false,
      reason:
        "The requested permission scope is broader than your delegated scope.",
    };
  }

  if (parentScope.selfOnly && !requestedScope.selfOnly) {
    return {
      valid: false,
      reason: "This permission must remain limited to the current user.",
    };
  }

  const dimensions: Array<
    keyof Pick<
      PermissionScopes,
      "departmentIds" | "documentCategories" | "documentClassifications"
    >
  > = ["departmentIds", "documentCategories", "documentClassifications"];

  for (const dimension of dimensions) {
    const parentValues = parentScope[dimension];
    const requestedValues = requestedScope[dimension];

    // An empty actor array means this dimension is unrestricted. The child may
    // add any restriction in that dimension as additional narrowing.
    if (parentValues.length === 0) continue;

    // A constrained actor dimension cannot be delegated as an empty child
    // dimension because an empty child dimension means unrestricted.
    if (requestedValues.length === 0) {
      return {
        valid: false,
        reason: `${dimension} must contain at least one value within your delegated scope.`,
      };
    }

    if (!requestedValues.every((value) => parentValues.includes(value))) {
      return {
        valid: false,
        reason: `${dimension} contains values outside your delegated scope.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Actor scope limits values, not which catalog-compatible controls are shown.
 * Every compatible dimension remains available for valid additional narrowing.
 */
export function constrainCompatibleScopes(
  _actorScope: PermissionScopes | null,
  compatibleScopes: PermissionScopeType[],
): PermissionScopeType[] {
  return [...compatibleScopes];
}

/**
 * @deprecated Silent clipping is unsafe. This compatibility helper now either
 * returns the requested scope unchanged or throws when it is wider than the
 * actor scope. New code should use validateRoleGrantScopes instead.
 */
export function clipGrantScopesToActorScope(
  grantScope: PermissionScopes,
  actorScope: PermissionScopes | null,
): PermissionScopes {
  const validation = scopeContains(actorScope, grantScope);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }
  return {
    selfOnly: grantScope.selfOnly,
    departmentIds: [...grantScope.departmentIds],
    documentCategories: [...grantScope.documentCategories],
    documentClassifications: [...grantScope.documentClassifications],
  };
}

export interface RoleActionVisibility {
  canView: boolean;
  canEdit: boolean;
  canClone: boolean;
  canArchive: boolean;
  canReactivate: boolean;
  canDelete: boolean;
  canAssign: boolean;
  canMigrate: boolean;
}

export function deriveRoleActionVisibility(
  effectivePermissions: Set<string>,
  roleStatus: "active" | "archived",
): RoleActionVisibility {
  const canRead = effectivePermissions.has("roles:read");
  const canCreate = effectivePermissions.has("roles:create");
  const canUpdate = effectivePermissions.has("roles:update");
  const canDelete = effectivePermissions.has("roles:delete");
  const canAssign = effectivePermissions.has("users:assign-role");

  return {
    canView: canRead,
    canEdit: canUpdate && roleStatus === "active",
    canClone: canCreate,
    canArchive: canUpdate && roleStatus === "active",
    canReactivate: canUpdate && roleStatus === "archived",
    canDelete: canDelete && roleStatus === "archived",
    canAssign: canAssign && roleStatus === "active",
    // Migration is needed most often for archived source roles before delete.
    canMigrate: canAssign,
  };
}

export interface RoleListViewState {
  viewState:
    | "permissionLoading"
    | "permissionDenied"
    | "loading"
    | "error"
    | "empty"
    | "filteredEmpty"
    | "ready";
  canRetry: boolean;
  showClearFilters: boolean;
}

export function deriveRoleListViewState(input: {
  permissionsReady: boolean;
  canRead: boolean;
  loading: boolean;
  error: string | null;
  rolesCount: number;
  filteredCount: number;
}): RoleListViewState {
  if (!input.permissionsReady) {
    return {
      viewState: "permissionLoading",
      canRetry: false,
      showClearFilters: false,
    };
  }
  if (!input.canRead) {
    return {
      viewState: "permissionDenied",
      canRetry: false,
      showClearFilters: false,
    };
  }
  if (input.loading) {
    return { viewState: "loading", canRetry: false, showClearFilters: false };
  }
  if (input.error) {
    return { viewState: "error", canRetry: true, showClearFilters: false };
  }
  if (input.rolesCount === 0) {
    return { viewState: "empty", canRetry: false, showClearFilters: false };
  }
  if (input.filteredCount === 0) {
    return {
      viewState: "filteredEmpty",
      canRetry: false,
      showClearFilters: true,
    };
  }
  return { viewState: "ready", canRetry: false, showClearFilters: false };
}

export interface CreateRoleValidation {
  valid: boolean;
  normalizedName?: string;
  error?: string;
}

export function validateCreateRoleInput(name: string): CreateRoleValidation {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return { valid: false, error: "Role name is required." };
  }
  if (normalizedName.length > 50) {
    return {
      valid: false,
      error: "Role name must be 50 characters or fewer.",
    };
  }
  return { valid: true, normalizedName };
}

export interface DeleteFlowState {
  state: "requiresArchive" | "usageUnknown" | "requiresMigration" | "ready";
  canDelete: boolean;
  requiresMigration: boolean;
  requiresUsageCheck: boolean;
}

export function deriveDeleteFlowState(
  assignedUserCount: number | null,
  roleStatus: "active" | "archived",
): DeleteFlowState {
  if (roleStatus !== "archived") {
    return {
      state: "requiresArchive",
      canDelete: false,
      requiresMigration: false,
      requiresUsageCheck: false,
    };
  }
  if (assignedUserCount === null) {
    return {
      state: "usageUnknown",
      canDelete: false,
      requiresMigration: false,
      requiresUsageCheck: true,
    };
  }
  if (assignedUserCount > 0) {
    return {
      state: "requiresMigration",
      canDelete: false,
      requiresMigration: true,
      requiresUsageCheck: false,
    };
  }
  return {
    state: "ready",
    canDelete: true,
    requiresMigration: false,
    requiresUsageCheck: false,
  };
}

export interface VersionConflictState {
  isConflict: boolean;
  isStale: boolean;
  canSubmit: boolean;
  errorCode: string | null;
  message: string | null;
}

export function deriveVersionConflictState(
  errorCode: string | null,
): VersionConflictState {
  const isConflict =
    errorCode === "ROLE_VERSION_CONFLICT" || errorCode === "STALE_ROLE_VERSION";

  return {
    isConflict,
    isStale: isConflict,
    canSubmit: !isConflict,
    errorCode,
    message: isConflict
      ? "This role changed on the server. Reload the latest version before submitting again."
      : null,
  };
}

export function normalizeScopesForPermission(
  grantScope: PermissionScopes,
  compatibleScopes: PermissionScopeType[],
): PermissionScopes {
  const supported = new Set(compatibleScopes);
  return {
    selfOnly: supported.has("selfOnly") ? grantScope.selfOnly : false,
    departmentIds: supported.has("departmentIds")
      ? [...grantScope.departmentIds]
      : [],
    documentCategories: supported.has("documentCategories")
      ? [...grantScope.documentCategories]
      : [],
    documentClassifications: supported.has("documentClassifications")
      ? [...grantScope.documentClassifications]
      : [],
  };
}

export interface GrantScopeValidation {
  valid: boolean;
  reason?: string;
}

export function validateRoleGrantScopes(
  grantScope: PermissionScopes | null,
  actorGrantScope: PermissionScopes | null,
): GrantScopeValidation {
  const result = scopeContains(actorGrantScope, grantScope);
  if (result.valid) return { valid: true };
  return { valid: false, reason: result.reason };
}

export type PreparedGrantResult =
  | { valid: true; grants: PermissionGrant[] }
  | { valid: false; error: string; permission?: string };

/**
 * Produces the exact explicit grants that may be sent to create/update. It:
 * - removes inherited permissions,
 * - requires a current actor grant,
 * - normalizes only unsupported catalog dimensions,
 * - rejects widening instead of clipping,
 * - preserves every valid normalized value unchanged.
 */
export function prepareRoleGrantsForSubmission(input: {
  grants: PermissionGrant[];
  inheritedPermissionIds: string[];
  catalogEntries: PermissionCatalogEntry[];
  actorGrants: ActorGrantMap;
}): PreparedGrantResult {
  const inherited = new Set(input.inheritedPermissionIds);
  const catalogById = new Map(
    input.catalogEntries.map((entry) => [entry.id, entry]),
  );
  const prepared = new Map<string, PermissionGrant>();

  for (const grant of input.grants) {
    if (inherited.has(grant.permission)) continue;

    const entry = catalogById.get(grant.permission);
    if (!entry || !isTenantSelectable(entry)) {
      return {
        valid: false,
        permission: grant.permission,
        error: `${grant.permission} is no longer available for tenant delegation.`,
      };
    }

    const actorGrant = input.actorGrants[grant.permission];
    if (!actorGrant) {
      return {
        valid: false,
        permission: grant.permission,
        error: `You no longer hold ${grant.permission}; remove it before submitting.`,
      };
    }

    const requested = normalizeScopesForPermission(
      grant.scopes ?? emptyPermissionScopes(),
      entry.compatibleScopes,
    );
    const validation = validateRoleGrantScopes(requested, actorGrant.scope);
    if (!validation.valid) {
      return {
        valid: false,
        permission: grant.permission,
        error: `${grant.permission}: ${validation.reason ?? "Invalid scope."}`,
      };
    }

    prepared.set(
      grant.permission,
      entry.compatibleScopes.length > 0 && !permissionScopesAreEmpty(requested)
        ? { permission: grant.permission, scopes: requested }
        : { permission: grant.permission },
    );
  }

  return { valid: true, grants: [...prepared.values()] };
}

export type CreateRoleSubmissionResult =
  | {
      valid: true;
      payload: {
        name: string;
        baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
        grants?: PermissionGrant[];
      };
    }
  | { valid: false; error: string };

export function prepareCreateRoleSubmission(input: {
  name: string;
  baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
  grants: PermissionGrant[];
  baseRoleDefaults: Record<string, string[]>;
  catalogEntries: PermissionCatalogEntry[];
  actorGrants: ActorGrantMap;
}): CreateRoleSubmissionResult {
  const nameValidation = validateCreateRoleInput(input.name);
  if (!nameValidation.valid || !nameValidation.normalizedName) {
    return {
      valid: false,
      error: nameValidation.error ?? "Invalid role name.",
    };
  }

  const grantsResult = prepareRoleGrantsForSubmission({
    grants: input.grants,
    inheritedPermissionIds: deriveInheritedPermissionIds(
      input.baseRoleDefaults,
      input.baseRole,
    ),
    catalogEntries: input.catalogEntries,
    actorGrants: input.actorGrants,
  });
  if (!grantsResult.valid) {
    return { valid: false, error: grantsResult.error };
  }

  return {
    valid: true,
    payload: {
      name: nameValidation.normalizedName,
      baseRole: input.baseRole,
      ...(grantsResult.grants.length > 0
        ? { grants: grantsResult.grants }
        : {}),
    },
  };
}

export type UpdateRoleSubmissionResult =
  | {
      valid: true;
      payload: {
        name: string;
        baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
        grants: PermissionGrant[];
        version: number;
      };
    }
  | { valid: false; error: string };

export function prepareUpdateRoleSubmission(input: {
  name: string;
  baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
  grants: PermissionGrant[];
  version: number;
  baseRoleDefaults: Record<string, string[]>;
  catalogEntries: PermissionCatalogEntry[];
  actorGrants: ActorGrantMap;
  isStale: boolean;
}): UpdateRoleSubmissionResult {
  if (input.isStale) {
    return {
      valid: false,
      error: "Reload the latest role version before saving again.",
    };
  }

  const nameValidation = validateCreateRoleInput(input.name);
  if (!nameValidation.valid || !nameValidation.normalizedName) {
    return {
      valid: false,
      error: nameValidation.error ?? "Invalid role name.",
    };
  }

  const grantsResult = prepareRoleGrantsForSubmission({
    grants: input.grants,
    inheritedPermissionIds: deriveInheritedPermissionIds(
      input.baseRoleDefaults,
      input.baseRole,
    ),
    catalogEntries: input.catalogEntries,
    actorGrants: input.actorGrants,
  });
  if (!grantsResult.valid) {
    return { valid: false, error: grantsResult.error };
  }

  return {
    valid: true,
    payload: {
      name: nameValidation.normalizedName,
      baseRole: input.baseRole,
      grants: grantsResult.grants,
      version: input.version,
    },
  };
}
