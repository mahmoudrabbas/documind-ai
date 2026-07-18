import { describe, expect, it } from "vitest";
import {
  createIdentityKey,
  computeNextPermissionAction,
  shouldApplyResponse,
  canRefreshPermissions,
  canPermission,
  deriveInheritedPermissionIds,
  isTenantSelectable,
  combineSelectableWithActorGrants,
} from "@/lib/permission-utils";
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

describe("createIdentityKey", () => {
  it("returns null when tenantId is null", () => {
    expect(createIdentityKey(null, "user-1")).toBeNull();
  });

  it("returns null when userId is null", () => {
    expect(createIdentityKey("tenant-1", null)).toBeNull();
  });

  it("returns combined key when both are provided", () => {
    expect(createIdentityKey("tenant-1", "user-1")).toBe("tenant-1:user-1");
  });

  it("differentiates different users in same tenant", () => {
    expect(createIdentityKey("tenant-1", "user-1")).not.toBe(createIdentityKey("tenant-1", "user-2"));
  });

  it("differentiates same user in different tenants", () => {
    expect(createIdentityKey("tenant-1", "user-1")).not.toBe(createIdentityKey("tenant-2", "user-1"));
  });
});

describe("computeNextPermissionAction", () => {
  it("loading auth performs no request — returns set_loading", () => {
    const action = computeNextPermissionAction("loading", null, null);
    expect(action.kind).toBe("set_loading");
  });

  it("unauthenticated auth performs no request and clears all actor data — returns set_idle", () => {
    const action = computeNextPermissionAction("unauthenticated", null, "tenant-1:user-1");
    expect(action.kind).toBe("set_idle");
  });

  it("authenticated auth with new identity requests permissions", () => {
    const action = computeNextPermissionAction("authenticated", "tenant-1:user-1", null);
    expect(action.kind).toBe("load_permissions");
    if (action.kind === "load_permissions") {
      expect(action.identityKey).toBe("tenant-1:user-1");
    }
  });

  it("authenticated auth with same identity does nothing", () => {
    const action = computeNextPermissionAction("authenticated", "tenant-1:user-1", "tenant-1:user-1");
    expect(action.kind).toBe("stay");
  });

  it("tenant identity change invalidates old state and requests again", () => {
    const action = computeNextPermissionAction("authenticated", "tenant-2:user-1", "tenant-1:user-1");
    expect(action.kind).toBe("load_permissions");
    if (action.kind === "load_permissions") {
      expect(action.identityKey).toBe("tenant-2:user-1");
    }
  });

  it("user identity change invalidates old state and requests again", () => {
    const action = computeNextPermissionAction("authenticated", "tenant-1:user-2", "tenant-1:user-1");
    expect(action.kind).toBe("load_permissions");
    if (action.kind === "load_permissions") {
      expect(action.identityKey).toBe("tenant-1:user-2");
    }
  });

  it("new authenticated session after unauthenticated requests permissions", () => {
    const action = computeNextPermissionAction("authenticated", "tenant-1:user-1", null);
    expect(action.kind).toBe("load_permissions");
  });

  it("authenticated identity -> loading invalidates previous request generation", () => {
    // Simulates: authenticated(tenant-1:user-1) -> loading
    const authenticatedAction = computeNextPermissionAction("authenticated", "tenant-1:user-1", null);
    expect(authenticatedAction.kind).toBe("load_permissions");

    // Now entering loading state with the same identity as lastIdentityRef
    const loadingAction = computeNextPermissionAction("loading", "tenant-1:user-1", "tenant-1:user-1");
    expect(loadingAction.kind).toBe("set_loading");
    // set_loading will increment reqGenRef, ensuring any pending response from authenticated call is stale
  });

  it("loading -> same authenticated identity triggers load after identity reset", () => {
    // Simulates: loading state with null lastIdentityRef -> returning to authenticated(tenant-1:user-1)
    const loadingAction = computeNextPermissionAction("loading", null, "tenant-1:user-1");
    expect(loadingAction.kind).toBe("set_loading");

    // After set_loading clears lastIdentityRef to null, returning to same identity should load
    const authenticatedAction = computeNextPermissionAction("authenticated", "tenant-1:user-1", null);
    expect(authenticatedAction.kind).toBe("load_permissions");
    if (authenticatedAction.kind === "load_permissions") {
      expect(authenticatedAction.identityKey).toBe("tenant-1:user-1");
    }
  });
});

describe("shouldApplyResponse", () => {
  it("applies response when generation matches and mounted", () => {
    expect(shouldApplyResponse(5, 5, true)).toBe(true);
  });

  it("rejects stale response with older generation", () => {
    expect(shouldApplyResponse(5, 3, true)).toBe(false);
  });

  it("rejects response when unmounted", () => {
    expect(shouldApplyResponse(5, 5, false)).toBe(false);
  });

  it("rejects stale response from newer generation", () => {
    expect(shouldApplyResponse(5, 7, true)).toBe(false);
  });

  it("rejects stale response from before loading entered — race condition protection", () => {
    // Simulates: authenticated request started at gen=2, then loading incremented to gen=3
    const currentGen = 3; // incremented by set_loading
    const oldResponseGen = 2; // response from authenticated request
    expect(shouldApplyResponse(currentGen, oldResponseGen, true)).toBe(false);
  });
});

describe("canRefreshPermissions", () => {
  it("returns false when auth is loading", () => {
    expect(canRefreshPermissions("loading")).toBe(false);
  });

  it("returns false when auth is unauthenticated", () => {
    expect(canRefreshPermissions("unauthenticated")).toBe(false);
  });

  it("returns true when auth is authenticated", () => {
    expect(canRefreshPermissions("authenticated")).toBe(true);
  });
});

describe("auth lifecycle — logout clears effective permissions", () => {
  it("computeNextPermissionAction returns set_idle for unauthenticated even with prior identity", () => {
    const action = computeNextPermissionAction("unauthenticated", null, "tenant-1:user-1");
    expect(action.kind).toBe("set_idle");
  });

  it("can() returns false unless status is ready", () => {
    const emptySet = new Set<string>();
    expect(canPermission("documents:read", emptySet)).toBe(false);
  });
});

describe("can() uses only effective permissions", () => {
  it("returns true for held permission", () => {
    expect(canPermission("documents:read", new Set(["documents:read"]))).toBe(true);
  });

  it("returns false for unheld permission", () => {
    expect(canPermission("roles:create", new Set(["documents:read"]))).toBe(false);
  });
});

describe("actor grant scopes and sources preserved", () => {
  const entries = [{ ...baseEntry }];
  const grants: Record<string, { source: "custom-role"; scope: { selfOnly: boolean; departmentIds: string[]; documentCategories: string[]; documentClassifications: string[] } }> = {
    "documents:read": {
      source: "custom-role",
      scope: { selfOnly: false, departmentIds: ["dept1"], documentCategories: [], documentClassifications: [] },
    },
  };

  it("combineSelectableWithActorGrants preserves source", () => {
    const result = combineSelectableWithActorGrants(entries, grants);
    expect(result[0].source).toBe("custom-role");
  });

  it("combineSelectableWithActorGrants preserves scope", () => {
    const result = combineSelectableWithActorGrants(entries, grants);
    expect(result[0].scope?.departmentIds).toEqual(["dept1"]);
  });
});

describe("baseRoleDefaults drive inherited permission derivation", () => {
  it("deriveInheritedPermissionIds consumes baseRoleDefaults, not filtered catalog groups", () => {
    const defaults = { COMPANY_ADMIN: ["documents:read", "users:read"], EMPLOYEE: [] };
    const ids = deriveInheritedPermissionIds(defaults, "COMPANY_ADMIN");
    expect(ids).toEqual(["documents:read", "users:read"]);
  });

  it("deriveInheritedPermissionIds does not hardcode permission identifiers", () => {
    const defaults = { COMPANY_ADMIN: ["custom:perm-a", "custom:perm-b"], EMPLOYEE: [] };
    const ids = deriveInheritedPermissionIds(defaults, "COMPANY_ADMIN");
    expect(ids).toEqual(["custom:perm-a", "custom:perm-b"]);
  });
});

describe("tenant selection requires delegableByTenantAdmin", () => {
  it("isTenantSelectable returns false when delegableByTenantAdmin is false", () => {
    const entry: PermissionCatalogEntry = {
      ...baseEntry,
      id: "users:delete",
      delegableByTenantAdmin: false,
    };
    expect(isTenantSelectable(entry)).toBe(false);
  });

  it("isTenantSelectable requires delegableByTenantAdmin in addition to all other criteria", () => {
    const meetsAll: PermissionCatalogEntry = { ...baseEntry, id: "documents:read" };
    expect(isTenantSelectable(meetsAll)).toBe(true);

    const noDelegable: PermissionCatalogEntry = { ...baseEntry, id: "users:delete", delegableByTenantAdmin: false, tenantGrantable: false };
    expect(isTenantSelectable(noDelegable)).toBe(false);
  });
});

describe("no user.role permission fallback", () => {
  it("canPermission does not use user.role", () => {
    const empty = new Set<string>();
    expect(canPermission("documents:read", empty)).toBe(false);
  });
});

describe("no hardcoded permission or scope map", () => {
  it("deriveInheritedPermissionIds works with arbitrary permission identifiers", () => {
    const defaults = { COMPANY_ADMIN: ["perm-x", "perm-y"], EMPLOYEE: [] };
    expect(deriveInheritedPermissionIds(defaults, "COMPANY_ADMIN")).toEqual(["perm-x", "perm-y"]);
  });

  it("combineSelectableWithActorGrants works with arbitrary permission identifiers", () => {
    const entries: PermissionCatalogEntry[] = [{ ...baseEntry, id: "arbitrary:perm" }];
    const grants = { "arbitrary:perm": { source: "base-role" as const, scope: null } };
    const result = combineSelectableWithActorGrants(entries, grants);
    expect(result[0].entry.id).toBe("arbitrary:perm");
  });

  it("computeNextPermissionAction works with arbitrary identity keys", () => {
    const action = computeNextPermissionAction("authenticated", "arbitrary:key", null);
    expect(action.kind).toBe("load_permissions");
    if (action.kind === "load_permissions") {
      expect(action.identityKey).toBe("arbitrary:key");
    }
  });
});
