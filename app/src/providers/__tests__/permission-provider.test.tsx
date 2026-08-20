// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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
import {
  Permission,
  type CurrentPermissionsResponse,
  type PermissionCatalogEntry,
} from "@/types/api/permissions.types";

const providerMocks = vi.hoisted(() => ({
  auth: {
    status: "authenticated",
    user: { id: "user-1", role: "EMPLOYEE" },
    tenant: { id: "tenant-1" },
  },
  getMyPermissions: vi.fn(),
  deniedListeners: new Set<(error: import("@/lib/api-client").ApiError) => void>(),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => providerMocks.auth,
}));

vi.mock("@/services/permissions.service", () => ({
  getMyPermissions: providerMocks.getMyPermissions,
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>(
    "@/lib/api-client",
  );
  return {
    ...actual,
    subscribePermissionDenied: vi.fn(
      (listener: (error: import("@/lib/api-client").ApiError) => void) => {
        providerMocks.deniedListeners.add(listener);
        return () => providerMocks.deniedListeners.delete(listener);
      },
    ),
  };
});

import { ApiError } from "@/lib/api-client";
import {
  PermissionProvider,
  usePermissions,
} from "@/providers/permission-provider";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function permissionResponse(
  permissions: string[] = [Permission.KNOWLEDGE_GAPS_READ],
): CurrentPermissionsResponse {
  return {
    success: true,
    data: {
      permissions,
      grants: Object.fromEntries(
        permissions.map((permission) => [
          permission,
          { source: "base-role" as const, scope: null },
        ]),
      ),
      baseRole: "EMPLOYEE",
      customRoleId: null,
      customRoleState: "none",
      roleVersion: null,
    },
  };
}

function PermissionProbe() {
  const permissions = usePermissions();
  return (
    <>
      <output data-testid="permission-status">{permissions.status}</output>
      {permissions.status === "error" ? (
        <output data-testid="permission-error">
          {permissions.error.message}
        </output>
      ) : null}
      <button
        type="button"
        onClick={() => void permissions.refreshPermissions()}
      >
        Retry permissions
      </button>
    </>
  );
}

function renderPermissionProvider() {
  return render(
    <PermissionProvider>
      <PermissionProbe />
    </PermissionProvider>,
  );
}

function emitPermissionDenied(): void {
  const error = new ApiError({
    status: 403,
    code: "PERMISSION_REQUIRED",
    message: "Permission required",
  });
  providerMocks.deniedListeners.forEach((listener) => listener(error));
}

beforeEach(() => {
  providerMocks.auth.status = "authenticated";
  providerMocks.auth.user.id = "user-1";
  providerMocks.auth.user.role = "EMPLOYEE";
  providerMocks.auth.tenant.id = "tenant-1";
  providerMocks.getMyPermissions.mockReset();
  providerMocks.deniedListeners.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PermissionProvider request lifecycle", () => {
  it("reuses the active request when rapid permission denials request a refresh", async () => {
    vi.useFakeTimers();
    const initial = deferred<CurrentPermissionsResponse>();
    const competing = deferred<CurrentPermissionsResponse>();
    providerMocks.getMyPermissions
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(competing.promise);

    renderPermissionProvider();
    await act(async () => undefined);
    expect(providerMocks.getMyPermissions).toHaveBeenCalledTimes(1);

    act(() => {
      emitPermissionDenied();
      emitPermissionDenied();
      emitPermissionDenied();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(providerMocks.getMyPermissions).toHaveBeenCalledTimes(1);

    await act(async () => {
      initial.resolve(permissionResponse());
      await initial.promise;
    });

    expect(screen.getByTestId("permission-status")).toHaveTextContent("ready");
  });

  it("times out a stalled request and recovers through a fresh manual retry", async () => {
    vi.useFakeTimers();
    const stalled = deferred<CurrentPermissionsResponse>();
    const retry = deferred<CurrentPermissionsResponse>();
    providerMocks.getMyPermissions
      .mockReturnValueOnce(stalled.promise)
      .mockReturnValueOnce(retry.promise);

    renderPermissionProvider();
    await act(async () => undefined);
    expect(screen.getByTestId("permission-status")).toHaveTextContent("loading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(screen.getByTestId("permission-status")).toHaveTextContent("error");
    expect(screen.getByTestId("permission-error")).toHaveTextContent(
      "Permissions check timed out",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry permissions" }));
      await Promise.resolve();
    });
    expect(providerMocks.getMyPermissions).toHaveBeenCalledTimes(2);

    await act(async () => {
      retry.resolve(permissionResponse());
      await retry.promise;
    });

    expect(screen.getByTestId("permission-status")).toHaveTextContent("ready");
  });

  it("ignores a stale response after unmount and lets the remounted provider settle", async () => {
    const stale = deferred<CurrentPermissionsResponse>();
    const current = deferred<CurrentPermissionsResponse>();
    providerMocks.getMyPermissions
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(current.promise);

    const firstMount = renderPermissionProvider();
    await act(async () => undefined);
    expect(providerMocks.getMyPermissions).toHaveBeenCalledTimes(1);
    firstMount.unmount();

    renderPermissionProvider();
    await act(async () => undefined);
    expect(providerMocks.getMyPermissions).toHaveBeenCalledTimes(2);

    await act(async () => {
      stale.resolve(permissionResponse([]));
      await stale.promise;
    });
    expect(screen.getByTestId("permission-status")).toHaveTextContent("loading");

    await act(async () => {
      current.resolve(permissionResponse());
      await current.promise;
    });
    expect(screen.getByTestId("permission-status")).toHaveTextContent("ready");
  });

  it("turns a synchronous permission client failure into a retryable error", async () => {
    providerMocks.getMyPermissions.mockImplementationOnce(() => {
      throw new Error("Permission client failed");
    });

    renderPermissionProvider();
    await act(async () => undefined);

    expect(screen.getByTestId("permission-status")).toHaveTextContent("error");
    expect(screen.getByTestId("permission-error")).toHaveTextContent(
      "Permission client failed",
    );
  });
});

const baseEntry: PermissionCatalogEntry = {
  id: "documents:read",
  label: "View Documents",
  description: "View tenant documents",
  compatibleScopes: ["selfOnly", "departmentIds", "documentCategories", "documentClassifications"],
  defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"],
  allowedCustomRoleBases: ["COMPANY_ADMIN", "EMPLOYEE"],
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
