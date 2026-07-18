import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clipGrantScopesToActorScope,
  combineSelectableWithActorGrants,
  constrainCompatibleScopes,
  deriveDeleteFlowState,
  deriveInheritedPermissionIds,
  deriveRoleActionVisibility,
  deriveRoleListViewState,
  deriveVersionConflictState,
  filterCatalogGroupsForActor,
  flattenCatalogEntries,
  normalizeScopesForPermission,
  prepareCreateRoleSubmission,
  prepareRoleGrantsForSubmission,
  prepareUpdateRoleSubmission,
  scopeContains,
  validateCreateRoleInput,
  validateRoleGrantScopes,
  type ActorGrantMap,
} from "@/lib/permission-utils";
import type {
  PermissionCatalogEntry,
  PermissionCatalogGroup,
  PermissionScopes,
} from "@/types/api/permissions.types";
import type { RoleView } from "@/types/api/users.types";

const { apiClient } = vi.hoisted(() => ({ apiClient: vi.fn() }));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiClient };
});

import {
  archiveRole,
  assignRole,
  cloneRole,
  createRole,
  deleteRole,
  getPermissionCatalog,
  getRole,
  getRoleUsage,
  listRoles,
  migrateRoleUsers,
  reactivateRole,
  removeRoleAssignment,
  updateRole,
} from "@/services/roles.service";

const unrestrictedScope = (): PermissionScopes => ({
  selfOnly: false,
  departmentIds: [],
  documentCategories: [],
  documentClassifications: [],
});

const documentRead: PermissionCatalogEntry = {
  id: "documents:read",
  label: "View Documents",
  description: "View tenant documents",
  compatibleScopes: [
    "selfOnly",
    "departmentIds",
    "documentCategories",
    "documentClassifications",
  ],
  defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"],
  allowedCustomRoleBases: ["COMPANY_ADMIN", "EMPLOYEE"],
  active: true,
  deprecated: false,
  platformOnly: false,
  tenantGrantable: true,
  delegableByTenantAdmin: true,
  contractVersion: 1,
};

const analyticsRead: PermissionCatalogEntry = {
  ...documentRead,
  id: "analytics:read",
  label: "View Analytics",
  compatibleScopes: ["departmentIds"],
  defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"],
  allowedCustomRoleBases: ["COMPANY_ADMIN", "EMPLOYEE"],
};

const deprecatedPermission: PermissionCatalogEntry = {
  ...documentRead,
  id: "documents:legacy",
  deprecated: true,
  active: false,
};

const nonDelegablePermission: PermissionCatalogEntry = {
  ...documentRead,
  id: "users:delete",
  delegableByTenantAdmin: false,
  tenantGrantable: false,
};

const catalogGroups: PermissionCatalogGroup[] = [
  {
    group: "documents",
    label: "Documents",
    permissions: [documentRead, deprecatedPermission],
  },
  {
    group: "analytics",
    label: "Analytics",
    permissions: [analyticsRead],
  },
  {
    group: "users",
    label: "Users",
    permissions: [nonDelegablePermission],
  },
];

const actorGrants: ActorGrantMap = {
  "documents:read": {
    source: "custom-role",
    scope: {
      selfOnly: false,
      departmentIds: ["dept-a", "dept-b"],
      documentCategories: ["invoices", "contracts"],
      documentClassifications: ["internal", "confidential"],
    },
  },
  "analytics:read": {
    source: "base-role",
    scope: null,
  },
};

const role: RoleView = {
  id: "role-1",
  tenantId: "tenant-1",
  name: "Analyst",
  baseRole: "EMPLOYEE",
  grants: [],
  contractVersion: 1,
  version: 3,
  status: "active",
  userCount: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-06T00:00:00.000Z",
  createdBy: "user-1",
  updatedBy: "user-1",
  migrationState: "complete",
};

const archivedRole: RoleView = {
  ...role,
  id: "role-2",
  name: "Archived Analyst",
  status: "archived",
  userCount: 0,
  version: 5,
};

beforeEach(() => {
  apiClient.mockReset();
});

describe("production permission action visibility", () => {
  it("requires roles:read for view/list/details/usage visibility", () => {
    expect(
      deriveRoleActionVisibility(new Set(["roles:read"]), "active").canView,
    ).toBe(true);
    expect(deriveRoleActionVisibility(new Set(), "active").canView).toBe(false);
  });

  it("uses roles:create for create-adjacent clone visibility", () => {
    expect(
      deriveRoleActionVisibility(new Set(["roles:create"]), "active").canClone,
    ).toBe(true);
    expect(
      deriveRoleActionVisibility(new Set(["roles:update"]), "active").canClone,
    ).toBe(false);
  });

  it("uses roles:update for edit and archive on active roles", () => {
    const visible = deriveRoleActionVisibility(
      new Set(["roles:update"]),
      "active",
    );
    expect(visible.canEdit).toBe(true);
    expect(visible.canArchive).toBe(true);
    expect(visible.canReactivate).toBe(false);
  });

  it("uses roles:update for reactivate on archived roles", () => {
    const visible = deriveRoleActionVisibility(
      new Set(["roles:update"]),
      "archived",
    );
    expect(visible.canEdit).toBe(false);
    expect(visible.canArchive).toBe(false);
    expect(visible.canReactivate).toBe(true);
  });

  it("uses roles:delete and archived status for delete", () => {
    expect(
      deriveRoleActionVisibility(new Set(["roles:delete"]), "archived")
        .canDelete,
    ).toBe(true);
    expect(
      deriveRoleActionVisibility(new Set(["roles:delete"]), "active").canDelete,
    ).toBe(false);
  });

  it("uses users:assign-role for assignment, removal, and migration", () => {
    const active = deriveRoleActionVisibility(
      new Set(["users:assign-role"]),
      "active",
    );
    const archived = deriveRoleActionVisibility(
      new Set(["users:assign-role"]),
      "archived",
    );
    expect(active.canAssign).toBe(true);
    expect(active.canMigrate).toBe(true);
    expect(archived.canAssign).toBe(false);
    expect(archived.canMigrate).toBe(true);
  });
});

describe("production list view-state derivation", () => {
  const base = {
    permissionsReady: true,
    canRead: true,
    loading: false,
    error: null,
    rolesCount: 1,
    filteredCount: 1,
  };

  it("returns permissionLoading before permission readiness", () => {
    expect(
      deriveRoleListViewState({ ...base, permissionsReady: false }).viewState,
    ).toBe("permissionLoading");
  });

  it("returns permissionDenied without roles:read", () => {
    expect(deriveRoleListViewState({ ...base, canRead: false }).viewState).toBe(
      "permissionDenied",
    );
  });

  it("returns loading", () => {
    expect(deriveRoleListViewState({ ...base, loading: true }).viewState).toBe(
      "loading",
    );
  });

  it("returns recoverable error with retry", () => {
    const result = deriveRoleListViewState({
      ...base,
      error: "Network error",
    });
    expect(result.viewState).toBe("error");
    expect(result.canRetry).toBe(true);
  });

  it("returns empty when no roles exist", () => {
    expect(
      deriveRoleListViewState({
        ...base,
        rolesCount: 0,
        filteredCount: 0,
      }).viewState,
    ).toBe("empty");
  });

  it("returns filteredEmpty and exposes clear filters", () => {
    const result = deriveRoleListViewState({ ...base, filteredCount: 0 });
    expect(result.viewState).toBe("filteredEmpty");
    expect(result.showClearFilters).toBe(true);
  });

  it("returns ready", () => {
    expect(deriveRoleListViewState(base).viewState).toBe("ready");
  });
});

describe("production role-name validation", () => {
  it("rejects empty and whitespace-only names", () => {
    expect(validateCreateRoleInput("").valid).toBe(false);
    expect(validateCreateRoleInput("   ").valid).toBe(false);
  });

  it("rejects names over 50 characters", () => {
    expect(validateCreateRoleInput("x".repeat(51)).valid).toBe(false);
  });

  it("trims and accepts a valid name", () => {
    expect(validateCreateRoleInput("  Finance Analyst  ")).toEqual({
      valid: true,
      normalizedName: "Finance Analyst",
    });
  });
});

describe("catalog-derived inherited and selectable permissions", () => {
  it("derives inherited permissions only from baseRoleDefaults", () => {
    const defaults = {
      COMPANY_ADMIN: ["documents:read", "analytics:read"],
      EMPLOYEE: ["documents:read"],
    };
    expect(deriveInheritedPermissionIds(defaults, "COMPANY_ADMIN")).toEqual([
      "documents:read",
      "analytics:read",
    ]);
    expect(deriveInheritedPermissionIds(defaults, "EMPLOYEE")).toEqual([
      "documents:read",
    ]);
  });

  it("flattens catalog groups", () => {
    expect(flattenCatalogEntries(catalogGroups)).toHaveLength(4);
  });

  it("preserves actor source and scope metadata", () => {
    const result = combineSelectableWithActorGrants(
      flattenCatalogEntries(catalogGroups),
      actorGrants,
    );
    expect(result.map(({ entry }) => entry.id)).toEqual([
      "documents:read",
      "analytics:read",
    ]);
    expect(result[0]).toMatchObject({
      source: "custom-role",
      scope: actorGrants["documents:read"].scope,
    });
    expect(result[1]).toMatchObject({ source: "base-role", scope: null });
  });

  it("filters catalog groups to actor-held tenant-selectable permissions", () => {
    const filtered = filterCatalogGroupsForActor(catalogGroups, actorGrants);
    expect(filtered.map((group) => group.group)).toEqual([
      "documents",
      "analytics",
    ]);
    expect(
      filtered.flatMap((group) => group.permissions.map((entry) => entry.id)),
    ).toEqual(["documents:read", "analytics:read"]);
  });
});

describe("authoritative scope containment", () => {
  it("treats null actor scope as unrestricted", () => {
    expect(
      scopeContains(null, {
        selfOnly: true,
        departmentIds: ["any"],
        documentCategories: ["any"],
        documentClassifications: ["any"],
      }).valid,
    ).toBe(true);
  });

  it("treats an empty actor scope object as unrestricted", () => {
    expect(
      scopeContains(unrestrictedScope(), {
        selfOnly: false,
        departmentIds: ["dept-x"],
        documentCategories: ["category-x"],
        documentClassifications: ["classification-x"],
      }).valid,
    ).toBe(true);
  });

  it("accepts a non-empty department subset", () => {
    const actor = {
      ...unrestrictedScope(),
      departmentIds: ["dept-a", "dept-b"],
    };
    const requested = {
      ...unrestrictedScope(),
      departmentIds: ["dept-a"],
    };
    expect(scopeContains(actor, requested).valid).toBe(true);
  });

  it("rejects empty or widened department access", () => {
    const actor = {
      ...unrestrictedScope(),
      departmentIds: ["dept-a"],
    };
    expect(scopeContains(actor, unrestrictedScope()).valid).toBe(false);
    expect(
      scopeContains(actor, {
        ...unrestrictedScope(),
        departmentIds: ["dept-a", "dept-b"],
      }).valid,
    ).toBe(false);
  });

  it("accepts category subset and rejects category widening", () => {
    const actor = {
      ...unrestrictedScope(),
      documentCategories: ["invoices", "contracts"],
    };
    expect(
      scopeContains(actor, {
        ...unrestrictedScope(),
        documentCategories: ["invoices"],
      }).valid,
    ).toBe(true);
    expect(
      scopeContains(actor, {
        ...unrestrictedScope(),
        documentCategories: ["invoices", "hr"],
      }).valid,
    ).toBe(false);
  });

  it("accepts classification subset and rejects widening", () => {
    const actor = {
      ...unrestrictedScope(),
      documentClassifications: ["internal", "confidential"],
    };
    expect(
      scopeContains(actor, {
        ...unrestrictedScope(),
        documentClassifications: ["internal"],
      }).valid,
    ).toBe(true);
    expect(
      scopeContains(actor, {
        ...unrestrictedScope(),
        documentClassifications: ["public"],
      }).valid,
    ).toBe(false);
  });

  it("requires selfOnly while allowing additional compatible narrowing", () => {
    const actor = { ...unrestrictedScope(), selfOnly: true };
    expect(scopeContains(actor, unrestrictedScope()).valid).toBe(false);
    expect(
      scopeContains(actor, {
        selfOnly: true,
        departmentIds: ["dept-a"],
        documentCategories: ["invoices"],
        documentClassifications: ["internal"],
      }).valid,
    ).toBe(true);
  });

  it("applies configured dimensions conjunctively", () => {
    const actor = {
      selfOnly: false,
      departmentIds: ["dept-a"],
      documentCategories: ["invoices"],
      documentClassifications: ["internal"],
    };
    expect(
      scopeContains(actor, {
        selfOnly: false,
        departmentIds: ["dept-a"],
        documentCategories: ["invoices"],
        documentClassifications: ["public"],
      }).valid,
    ).toBe(false);
  });

  it("keeps all catalog-compatible controls visible regardless of actor arrays", () => {
    expect(
      constrainCompatibleScopes(
        {
          selfOnly: true,
          departmentIds: [],
          documentCategories: [],
          documentClassifications: [],
        },
        documentRead.compatibleScopes,
      ),
    ).toEqual(documentRead.compatibleScopes);
  });

  it("does not silently clip invalid scopes", () => {
    const actor = {
      ...unrestrictedScope(),
      departmentIds: ["dept-a"],
    };
    const widened = {
      ...unrestrictedScope(),
      departmentIds: ["dept-a", "dept-b"],
    };
    expect(() => clipGrantScopesToActorScope(widened, actor)).toThrow();
  });

  it("returns a valid scope unchanged from the compatibility helper", () => {
    const actor = {
      ...unrestrictedScope(),
      departmentIds: ["dept-a", "dept-b"],
    };
    const narrowed = {
      ...unrestrictedScope(),
      departmentIds: ["dept-a"],
    };
    expect(clipGrantScopesToActorScope(narrowed, actor)).toEqual(narrowed);
  });
});

describe("compatible-scope normalization", () => {
  it("removes every unsupported dimension, including selfOnly", () => {
    expect(
      normalizeScopesForPermission(
        {
          selfOnly: true,
          departmentIds: ["dept-a"],
          documentCategories: ["invoices"],
          documentClassifications: ["internal"],
        },
        ["departmentIds"],
      ),
    ).toEqual({
      selfOnly: false,
      departmentIds: ["dept-a"],
      documentCategories: [],
      documentClassifications: [],
    });
  });

  it("preserves supported values unchanged", () => {
    const scope = {
      selfOnly: true,
      departmentIds: ["dept-a"],
      documentCategories: ["invoices"],
      documentClassifications: ["internal"],
    };
    expect(
      normalizeScopesForPermission(scope, documentRead.compatibleScopes),
    ).toEqual(scope);
  });

  it("validates a normalized scope against actor scope", () => {
    expect(
      validateRoleGrantScopes(
        {
          ...unrestrictedScope(),
          departmentIds: ["dept-a"],
        },
        {
          ...unrestrictedScope(),
          departmentIds: ["dept-a", "dept-b"],
        },
      ),
    ).toEqual({ valid: true });
  });
});

describe("production grant submission preparation", () => {
  const inheritedIds = ["analytics:read"];

  it("excludes inherited permissions", () => {
    const result = prepareRoleGrantsForSubmission({
      grants: [
        { permission: "analytics:read" },
        {
          permission: "documents:read",
          scopes: {
            ...unrestrictedScope(),
            departmentIds: ["dept-a"],
            documentCategories: ["invoices"],
            documentClassifications: ["internal"],
          },
        },
      ],
      inheritedPermissionIds: inheritedIds,
      catalogEntries: flattenCatalogEntries(catalogGroups),
      actorGrants,
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.grants.map((grant) => grant.permission)).toEqual([
        "documents:read",
      ]);
    }
  });

  it("rejects a permission the actor no longer holds", () => {
    const result = prepareRoleGrantsForSubmission({
      grants: [{ permission: "documents:read" }],
      inheritedPermissionIds: [],
      catalogEntries: [documentRead],
      actorGrants: {},
    });
    expect(result.valid).toBe(false);
  });

  it("rejects department widening instead of clipping", () => {
    const result = prepareRoleGrantsForSubmission({
      grants: [
        {
          permission: "documents:read",
          scopes: {
            ...unrestrictedScope(),
            departmentIds: ["dept-a", "outside"],
            documentCategories: ["invoices"],
            documentClassifications: ["internal"],
          },
        },
      ],
      inheritedPermissionIds: [],
      catalogEntries: [documentRead],
      actorGrants,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects category widening", () => {
    const result = prepareRoleGrantsForSubmission({
      grants: [
        {
          permission: "documents:read",
          scopes: {
            ...unrestrictedScope(),
            departmentIds: ["dept-a"],
            documentCategories: ["invoices", "outside"],
            documentClassifications: ["internal"],
          },
        },
      ],
      inheritedPermissionIds: [],
      catalogEntries: [documentRead],
      actorGrants,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects classification widening", () => {
    const result = prepareRoleGrantsForSubmission({
      grants: [
        {
          permission: "documents:read",
          scopes: {
            ...unrestrictedScope(),
            departmentIds: ["dept-a"],
            documentCategories: ["invoices"],
            documentClassifications: ["outside"],
          },
        },
      ],
      inheritedPermissionIds: [],
      catalogEntries: [documentRead],
      actorGrants,
    });
    expect(result.valid).toBe(false);
  });

  it("removes unsupported dimensions and preserves valid supported values", () => {
    const result = prepareRoleGrantsForSubmission({
      grants: [
        {
          permission: "analytics:read",
          scopes: {
            selfOnly: true,
            departmentIds: ["dept-z"],
            documentCategories: ["ignored"],
            documentClassifications: ["ignored"],
          },
        },
      ],
      inheritedPermissionIds: [],
      catalogEntries: [analyticsRead],
      actorGrants,
    });
    expect(result).toEqual({
      valid: true,
      grants: [
        {
          permission: "analytics:read",
          scopes: {
            selfOnly: false,
            departmentIds: ["dept-z"],
            documentCategories: [],
            documentClassifications: [],
          },
        },
      ],
    });
  });
});

describe("create and update request preparation used by the page", () => {
  const defaults = {
    COMPANY_ADMIN: ["analytics:read"],
    EMPLOYEE: [],
  };

  it("blocks invalid create scope before a payload exists", () => {
    const result = prepareCreateRoleSubmission({
      name: "Scoped role",
      baseRole: "EMPLOYEE",
      grants: [
        {
          permission: "documents:read",
          scopes: {
            ...unrestrictedScope(),
            departmentIds: ["outside"],
            documentCategories: ["invoices"],
            documentClassifications: ["internal"],
          },
        },
      ],
      baseRoleDefaults: defaults,
      catalogEntries: [documentRead],
      actorGrants,
    });
    expect(result.valid).toBe(false);
  });

  it("builds a valid create payload with normalized values unchanged", () => {
    const requested = {
      ...unrestrictedScope(),
      departmentIds: ["dept-a"],
      documentCategories: ["invoices"],
      documentClassifications: ["internal"],
    };
    const result = prepareCreateRoleSubmission({
      name: "  Scoped role  ",
      baseRole: "EMPLOYEE",
      grants: [{ permission: "documents:read", scopes: requested }],
      baseRoleDefaults: defaults,
      catalogEntries: [documentRead],
      actorGrants,
    });
    expect(result).toEqual({
      valid: true,
      payload: {
        name: "Scoped role",
        baseRole: "EMPLOYEE",
        grants: [{ permission: "documents:read", scopes: requested }],
      },
    });
  });

  it("blocks update while the version is stale", () => {
    expect(
      prepareUpdateRoleSubmission({
        name: "Updated",
        baseRole: "EMPLOYEE",
        grants: [],
        version: 3,
        baseRoleDefaults: defaults,
        catalogEntries: [documentRead],
        actorGrants,
        isStale: true,
      }).valid,
    ).toBe(false);
  });

  it("builds update payload with the current version", () => {
    expect(
      prepareUpdateRoleSubmission({
        name: "Updated",
        baseRole: "EMPLOYEE",
        grants: [],
        version: 7,
        baseRoleDefaults: defaults,
        catalogEntries: [documentRead],
        actorGrants,
        isStale: false,
      }),
    ).toEqual({
      valid: true,
      payload: {
        name: "Updated",
        baseRole: "EMPLOYEE",
        grants: [],
        version: 7,
      },
    });
  });
});

describe("delete flow and version conflict state", () => {
  it("requires archive before delete", () => {
    expect(deriveDeleteFlowState(0, "active")).toMatchObject({
      state: "requiresArchive",
      canDelete: false,
    });
  });

  it("requires an authoritative usage check", () => {
    expect(deriveDeleteFlowState(null, "archived")).toMatchObject({
      state: "usageUnknown",
      requiresUsageCheck: true,
      canDelete: false,
    });
  });

  it("requires migration while assigned users remain", () => {
    expect(deriveDeleteFlowState(2, "archived")).toMatchObject({
      state: "requiresMigration",
      requiresMigration: true,
      canDelete: false,
    });
  });

  it("allows delete only after authoritative zero usage", () => {
    expect(deriveDeleteFlowState(0, "archived")).toMatchObject({
      state: "ready",
      canDelete: true,
    });
  });

  it("marks both supported conflict codes stale and blocks submit", () => {
    for (const code of ["ROLE_VERSION_CONFLICT", "STALE_ROLE_VERSION"]) {
      expect(deriveVersionConflictState(code)).toMatchObject({
        isConflict: true,
        isStale: true,
        canSubmit: false,
      });
    }
  });

  it("does not mark unrelated errors stale", () => {
    expect(deriveVersionConflictState("VALIDATION_ERROR")).toMatchObject({
      isConflict: false,
      isStale: false,
      canSubmit: true,
    });
  });
});

describe("roles service route contracts", () => {
  it("lists and reads roles through roles:read routes", async () => {
    apiClient
      .mockResolvedValueOnce({ success: true, data: { roles: [role] } })
      .mockResolvedValueOnce({ success: true, data: { role } })
      .mockResolvedValueOnce({
        success: true,
        data: { roleId: role.id, assignedUserCount: 2 },
      });

    await listRoles();
    await getRole(role.id);
    await getRoleUsage(role.id);

    expect(apiClient).toHaveBeenNthCalledWith(1, "/roles", {
      signal: undefined,
    });
    expect(apiClient).toHaveBeenNthCalledWith(2, `/roles/${role.id}`, {
      method: "GET",
    });
    expect(apiClient).toHaveBeenNthCalledWith(3, `/roles/${role.id}/usage`);
  });

  it("creates and clones through create routes", async () => {
    apiClient.mockResolvedValue({
      success: true,
      message: "ok",
      data: { role },
    });
    await createRole({ name: "Analyst", baseRole: "EMPLOYEE" });
    await cloneRole(role.id, "Analyst copy", role.version);
    expect(apiClient).toHaveBeenNthCalledWith(1, "/roles", {
      method: "POST",
      body: { name: "Analyst", baseRole: "EMPLOYEE" },
    });
    expect(apiClient).toHaveBeenNthCalledWith(2, `/roles/${role.id}/clone`, {
      method: "POST",
      body: { name: "Analyst copy", version: role.version },
    });
  });

  it("updates, archives, and reactivates through update routes", async () => {
    apiClient.mockResolvedValue({
      success: true,
      message: "ok",
      data: { role },
    });
    await updateRole(role.id, { name: "Updated", version: role.version });
    await archiveRole(role.id, role.version);
    await reactivateRole(archivedRole.id, archivedRole.version);
    expect(apiClient).toHaveBeenNthCalledWith(1, `/roles/${role.id}`, {
      method: "PATCH",
      body: { name: "Updated", version: role.version },
    });
    expect(apiClient).toHaveBeenNthCalledWith(2, `/roles/${role.id}/archive`, {
      method: "POST",
      body: { version: role.version },
    });
    expect(apiClient).toHaveBeenNthCalledWith(
      3,
      `/roles/${archivedRole.id}/reactivate`,
      { method: "POST", body: { version: archivedRole.version } },
    );
  });

  it("assigns, removes, and migrates through users:assign-role routes", async () => {
    apiClient
      .mockResolvedValueOnce({
        success: true,
        message: "assigned",
        data: { userId: "user-1", roleId: role.id, changed: true },
      })
      .mockResolvedValueOnce({
        success: true,
        message: "removed",
        data: { userId: "user-1", roleId: null, changed: true },
      })
      .mockResolvedValueOnce({
        success: true,
        message: "migrated",
        data: {
          sourceRoleId: archivedRole.id,
          destinationRoleId: role.id,
          affected: 2,
          skipped: 0,
          conflicted: 0,
        },
      });

    await assignRole(role.id, "user-1", role.version);
    await removeRoleAssignment(role.id, "user-1", role.version);
    await migrateRoleUsers(
      archivedRole.id,
      role.id,
      archivedRole.version,
      role.version,
    );

    expect(apiClient).toHaveBeenNthCalledWith(
      1,
      `/roles/${role.id}/assignments`,
      {
        method: "POST",
        body: { userId: "user-1", roleVersion: role.version },
      },
    );
    expect(apiClient).toHaveBeenNthCalledWith(
      2,
      `/roles/${role.id}/assignments`,
      {
        method: "DELETE",
        body: { userId: "user-1", roleVersion: role.version },
      },
    );
    expect(apiClient).toHaveBeenNthCalledWith(
      3,
      `/roles/${archivedRole.id}/user-migrations`,
      {
        method: "POST",
        body: {
          destinationRoleId: role.id,
          sourceVersion: archivedRole.version,
          destinationVersion: role.version,
        },
      },
    );
  });

  it("deletes through the versioned delete route", async () => {
    apiClient.mockResolvedValue({
      success: true,
      message: "deleted",
      data: { success: true },
    });
    await deleteRole(archivedRole.id, archivedRole.version);
    expect(apiClient).toHaveBeenCalledWith(`/roles/${archivedRole.id}`, {
      method: "DELETE",
      body: { version: archivedRole.version },
    });
  });

  it("loads the authoritative permission catalog", async () => {
    apiClient.mockResolvedValue({
      success: true,
      data: {
        contractVersion: 1,
        groups: catalogGroups,
        baseRoleDefaults: { COMPANY_ADMIN: [], EMPLOYEE: [] },
      },
    });
    const response = await getPermissionCatalog();
    expect(response.data.groups).toEqual(catalogGroups);
  });
});

describe("production source regression checks", () => {
  async function readPageSource() {
    const fs = await import("node:fs");
    const path = await import("node:path");
    return fs.readFileSync(path.resolve(__dirname, "page.tsx"), "utf8");
  }

  it("contains no invented role permission identifiers", async () => {
    const source = await readPageSource();
    for (const invented of [
      "roles:manage",
      "roles:assign",
      "roles:clone",
      "roles:archive",
      "roles:reactivate",
      "roles:migrate",
    ]) {
      expect(source).not.toContain(`"${invented}"`);
      expect(source).not.toContain(`'${invented}'`);
    }
  });

  it("uses the production view-state and submission helpers", async () => {
    const source = await readPageSource();
    for (const helper of [
      "deriveRoleActionVisibility",
      "deriveRoleListViewState",
      "prepareCreateRoleSubmission",
      "prepareUpdateRoleSubmission",
      "deriveDeleteFlowState",
      "deriveVersionConflictState",
      "normalizeScopesForPermission",
    ]) {
      expect(source).toContain(helper);
    }
  });

  it("does not use the deprecated clipping helper in production", async () => {
    expect(await readPageSource()).not.toContain("clipGrantScopesToActorScope");
  });

  it("checks authoritative usage before delete and exposes migration", async () => {
    const source = await readPageSource();
    expect(source).toContain("getRoleUsage");
    expect(source).toContain("migrateRoleUsers");
    expect(source).toContain("deriveDeleteFlowState");
  });
});
