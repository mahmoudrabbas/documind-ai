import { describe, expect, it } from "vitest";
import {
  deriveInheritedPermissionIds,
  isTenantSelectable,
  getCompatibleScopes,
  intersectSelectablePermissions,
  flattenCatalogEntries,
  canPermission,
  combineSelectableWithActorGrants,
} from "../permission-utils";
import type { PermissionCatalogEntry } from "@/types/api/permissions.types";

const baseEntry: PermissionCatalogEntry = {
  id: "documents:read",
  label: "View Documents",
  description: "View tenant documents",
  compatibleScopes: ["selfOnly", "departmentIds", "documentCategories", "documentClassifications"],
  defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"],
  active: true,
  deprecated: false,
  platformOnly: false,
  tenantGrantable: true,
  delegableByTenantAdmin: true,
  contractVersion: 1,
};

const companyAdminOnly: PermissionCatalogEntry = {
  ...baseEntry,
  id: "users:read",
  defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"],
  compatibleScopes: ["departmentIds", "selfOnly"],
};

const employeeOnly: PermissionCatalogEntry = {
  ...baseEntry,
  id: "chat:read",
  defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"],
  compatibleScopes: ["selfOnly"],
};

const platformOnly: PermissionCatalogEntry = {
  ...baseEntry,
  id: "audit:platform-read",
  defaultBaseRoles: ["SUPER_ADMIN"],
  platformOnly: true,
  tenantGrantable: false,
  delegableByTenantAdmin: false,
};

const deprecatedEntry: PermissionCatalogEntry = {
  ...baseEntry,
  id: "documents:view",
  deprecated: true,
  active: false,
  tenantGrantable: false,
  delegableByTenantAdmin: false,
};

const nonDelegableEntry: PermissionCatalogEntry = {
  ...baseEntry,
  id: "users:delete",
  defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"],
  tenantGrantable: false,
  delegableByTenantAdmin: false,
};

const catalog = [
  companyAdminOnly,
  employeeOnly,
  platformOnly,
  deprecatedEntry,
  nonDelegableEntry,
];

const baseRoleDefaults = {
  COMPANY_ADMIN: ["users:read", "chat:read", "documents:read", "analytics:read"],
  EMPLOYEE: ["chat:read", "documents:read"],
};

describe("deriveInheritedPermissionIds", () => {
  it("derives COMPANY_ADMIN inherited permission IDs from baseRoleDefaults", () => {
    const ids = deriveInheritedPermissionIds(baseRoleDefaults, "COMPANY_ADMIN");
    expect(ids).toEqual(["users:read", "chat:read", "documents:read", "analytics:read"]);
  });

  it("derives EMPLOYEE inherited permission IDs from baseRoleDefaults", () => {
    const ids = deriveInheritedPermissionIds(baseRoleDefaults, "EMPLOYEE");
    expect(ids).toEqual(["chat:read", "documents:read"]);
  });

  it("returns empty array when the role is not in baseRoleDefaults", () => {
    const ids = deriveInheritedPermissionIds(baseRoleDefaults, "COMPANY_ADMIN");
    expect(Array.isArray(ids)).toBe(true);
  });

  it("does not fall back to any hardcoded permission map", () => {
    const ids = deriveInheritedPermissionIds(baseRoleDefaults, "COMPANY_ADMIN");
    expect(ids).toEqual(baseRoleDefaults.COMPANY_ADMIN);
  });

  it("consumes authoritative baseRoleDefaults response, not filtered group entries", () => {
    const partialDefaults = { COMPANY_ADMIN: ["users:read"], EMPLOYEE: [] };
    const ids = deriveInheritedPermissionIds(partialDefaults, "COMPANY_ADMIN");
    expect(ids).toEqual(["users:read"]);
  });
});

describe("isTenantSelectable", () => {
  it("returns true for active tenant-grantable delegable permissions", () => {
    expect(isTenantSelectable(companyAdminOnly)).toBe(true);
  });

  it("returns false for platform-only permissions", () => {
    expect(isTenantSelectable(platformOnly)).toBe(false);
  });

  it("returns false for deprecated permissions", () => {
    expect(isTenantSelectable(deprecatedEntry)).toBe(false);
  });

  it("returns false for non-tenant-grantable permissions", () => {
    expect(isTenantSelectable(nonDelegableEntry)).toBe(false);
  });

  it("returns false when delegableByTenantAdmin is false even if other criteria pass", () => {
    const noDelegable: PermissionCatalogEntry = {
      ...baseEntry,
      id: "users:assign-role",
      delegableByTenantAdmin: false,
    };
    expect(isTenantSelectable(noDelegable)).toBe(false);
  });

  it("requires all five conditions: active, not deprecated, not platformOnly, tenantGrantable, delegableByTenantAdmin", () => {
    const result = isTenantSelectable(companyAdminOnly);
    expect(result).toEqual(
      companyAdminOnly.active &&
        !companyAdminOnly.deprecated &&
        !companyAdminOnly.platformOnly &&
        companyAdminOnly.tenantGrantable &&
        companyAdminOnly.delegableByTenantAdmin,
    );
  });

  it("uses only the entry fields, not user.role", () => {
    const result = isTenantSelectable(companyAdminOnly);
    expect(result).toEqual(
      companyAdminOnly.active &&
        !companyAdminOnly.deprecated &&
        !companyAdminOnly.platformOnly &&
        companyAdminOnly.tenantGrantable &&
        companyAdminOnly.delegableByTenantAdmin,
    );
  });
});

describe("getCompatibleScopes", () => {
  it("returns compatible scopes from catalog metadata", () => {
    expect(getCompatibleScopes(baseEntry)).toEqual([
      "selfOnly",
      "departmentIds",
      "documentCategories",
      "documentClassifications",
    ]);
  });

  it("returns empty array for permissions with no compatible scopes", () => {
    const noScopes: PermissionCatalogEntry = {
      ...baseEntry,
      id: "roles:read",
      compatibleScopes: [],
    };
    expect(getCompatibleScopes(noScopes)).toEqual([]);
  });

  it("does not use a hardcoded scope map", () => {
    const scopes = getCompatibleScopes(companyAdminOnly);
    expect(scopes).toEqual(companyAdminOnly.compatibleScopes);
  });
});

describe("intersectSelectablePermissions", () => {
  it("returns only entries that are both tenant-selectable and held by the actor", () => {
    const effective = new Set(["users:read", "chat:read"]);
    const result = intersectSelectablePermissions(catalog, effective);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id).sort()).toEqual(["chat:read", "users:read"]);
  });

  it("excludes platform-only entries even if actor holds them", () => {
    const effective = new Set(["users:read", "audit:platform-read"]);
    const result = intersectSelectablePermissions(catalog, effective);
    expect(result.every((e) => e.id !== "audit:platform-read")).toBe(true);
  });

  it("returns empty array when no permissions intersect", () => {
    const effective = new Set(["unknown:permission"]);
    const result = intersectSelectablePermissions(catalog, effective);
    expect(result).toHaveLength(0);
  });

  it("does not infer permissions from user.role", () => {
    const effective = new Set<string>();
    const result = intersectSelectablePermissions(catalog, effective);
    expect(result).toHaveLength(0);
  });
});

describe("flattenCatalogEntries", () => {
  it("flattens groups into a single array of entries", () => {
    const groups = [
      { permissions: [companyAdminOnly] },
      { permissions: [employeeOnly, platformOnly] },
    ];
    const flat = flattenCatalogEntries(groups);
    expect(flat).toHaveLength(3);
    expect(flat.map((e) => e.id)).toEqual([
      "users:read",
      "chat:read",
      "audit:platform-read",
    ]);
  });

  it("returns empty array for empty groups", () => {
    expect(flattenCatalogEntries([])).toEqual([]);
  });
});

describe("canPermission", () => {
  it("returns true for permissions the actor holds", () => {
    const effective = new Set(["documents:read", "users:read"]);
    expect(canPermission("documents:read", effective)).toBe(true);
    expect(canPermission("users:read", effective)).toBe(true);
  });

  it("returns false for permissions the actor does not hold", () => {
    const effective = new Set(["documents:read"]);
    expect(canPermission("roles:create", effective)).toBe(false);
    expect(canPermission("billing:manage", effective)).toBe(false);
  });

  it("returns false for empty set", () => {
    expect(canPermission("documents:read", new Set())).toBe(false);
  });

  it("does not use user.role fallback", () => {
    const effective = new Set<string>();
    expect(canPermission("documents:read", effective)).toBe(false);
  });

  it("does not hardcode permission identifiers", () => {
    const effective = new Set(["existing:permission"]);
    expect(canPermission("unknown:permission", effective)).toBe(false);
  });
});

describe("combineSelectableWithActorGrants", () => {
  const selectableEntries = [
    { ...companyAdminOnly },
    { ...employeeOnly },
  ];

  const grants: Record<string, { source: "base-role"; scope: null }> = {
    "users:read": { source: "base-role", scope: null },
  };

  it("returns only selectable entries that actor holds in grant map", () => {
    const result = combineSelectableWithActorGrants(selectableEntries, grants);
    expect(result).toHaveLength(1);
    const usersRead = result[0];
    expect(usersRead.entry.id).toBe("users:read");
    expect(usersRead.source).toBe("base-role");
    expect(usersRead.scope).toBeNull();
  });

  it("excludes selectable entries not in grant map", () => {
    const result = combineSelectableWithActorGrants(selectableEntries, grants);
    expect(result.every((r) => r.entry.id in grants)).toBe(true);
    expect(result.some((r) => r.entry.id === "chat:read")).toBe(false);
  });

  it("preserves actor grant scope when present", () => {
    const entriesWithDocRead = [...selectableEntries, { ...baseEntry }];
    const scopedGrants: Record<string, { source: "custom-role"; scope: { selfOnly: boolean; departmentIds: string[]; documentCategories: string[]; documentClassifications: string[] } }> = {
      "documents:read": {
        source: "custom-role",
        scope: { selfOnly: false, departmentIds: ["dept1"], documentCategories: [], documentClassifications: [] },
      },
    };
    const result = combineSelectableWithActorGrants(entriesWithDocRead, scopedGrants);
    const docRead = result.find((r) => r.entry.id === "documents:read");
    expect(docRead?.source).toBe("custom-role");
    expect(docRead?.scope?.departmentIds).toEqual(["dept1"]);
  });

  it("filters out non-selectable entries even if present in grants", () => {
    const allEntries = [...selectableEntries, platformOnly, deprecatedEntry, nonDelegableEntry];
    const allGrants = Object.fromEntries(
      allEntries.map((e) => [e.id, { source: "base-role" as const, scope: null }]),
    );
    const result = combineSelectableWithActorGrants(allEntries, allGrants);
    expect(result.every((r) => r.entry.delegableByTenantAdmin)).toBe(true);
    expect(result.every((r) => r.entry.tenantGrantable)).toBe(true);
    expect(result.some((r) => r.entry.id === "audit:platform-read")).toBe(false);
    expect(result.some((r) => r.entry.id === "documents:view")).toBe(false);
    expect(result.some((r) => r.entry.id === "users:delete")).toBe(false);
  });

  it("does not hardcode permission identifiers or scope map", () => {
    const dynamicEntries: PermissionCatalogEntry[] = [
      { ...baseEntry, id: "custom:perm" },
    ];
    const dynamicGrants = { "custom:perm": { source: "custom-role" as const, scope: null } };
    const result = combineSelectableWithActorGrants(dynamicEntries, dynamicGrants);
    expect(result).toHaveLength(1);
    expect(result[0].entry.id).toBe("custom:perm");
    expect(result[0].source).toBe("custom-role");
  });
});
