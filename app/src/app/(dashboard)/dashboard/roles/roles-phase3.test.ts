import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiClient } = vi.hoisted(() => ({ apiClient: vi.fn() }));
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api-client")>();

  return {
    ...actual,
    apiClient,
  };
});

import {
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  cloneRole,
  archiveRole,
  reactivateRole,
  assignRole,
  removeRoleAssignment,
  migrateRoleUsers,
  getPermissionCatalog,
  getRoleUsage,
} from "@/services/roles.service";
import type { RoleView } from "@/types/api/users.types";

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
  name: "Legacy",
  status: "archived",
  userCount: 0,
  version: 1,
};

const roleWithGrants: RoleView = {
  ...role,
  id: "role-3",
  name: "Document Manager",
  grants: [
    { permission: "documents:create" },
    { permission: "documents:read", scopes: { selfOnly: true, departmentIds: [], documentCategories: [], documentClassifications: [] } },
  ],
};

const catalogResponse = {
  success: true as const,
  data: {
    contractVersion: 1,
    groups: [
      {
        group: "documents",
        label: "Documents",
        permissions: [
          { id: "documents:read", label: "View Documents", description: "View tenant documents", compatibleScopes: ["selfOnly", "departmentIds", "documentCategories", "documentClassifications"], defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"], active: true, deprecated: false, platformOnly: false, tenantGrantable: true, contractVersion: 1 },
          { id: "documents:create", label: "Upload Documents", description: "Upload tenant documents", compatibleScopes: ["departmentIds", "documentCategories", "documentClassifications"], defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], active: true, deprecated: false, platformOnly: false, tenantGrantable: true, contractVersion: 1 },
        ],
      },
      {
        group: "users",
        label: "Users",
        permissions: [
          { id: "users:read", label: "View Users", description: "List and view tenant users", compatibleScopes: ["departmentIds", "selfOnly"], defaultBaseRoles: ["SUPER_ADMIN", "COMPANY_ADMIN"], active: true, deprecated: false, platformOnly: false, tenantGrantable: true, contractVersion: 1 },
        ],
      },
    ],
  },
};

beforeEach(() => {
  apiClient.mockReset();
});

describe("role list rendering", () => {
  it("fetches and returns roles", async () => {
    apiClient.mockResolvedValue({ success: true, data: { roles: [role, archivedRole] } });
    const response = await listRoles();
    expect(response.data.roles).toHaveLength(2);
    expect(response.data.roles[0].name).toBe("Analyst");
    expect(response.data.roles[1].status).toBe("archived");
  });

  it("returns a single role by id", async () => {
    apiClient.mockResolvedValue({ success: true, data: { role } });
    const response = await getRole("role-1");
    expect(response.data.role.id).toBe("role-1");
    expect(response.data.role.name).toBe("Analyst");
  });
});

describe("loading, empty, and error states", () => {
  it("returns an empty list when no roles exist", async () => {
    apiClient.mockResolvedValue({ success: true, data: { roles: [] } });
    const response = await listRoles();
    expect(response.data.roles).toHaveLength(0);
  });

  it("throws ApiError on server error", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiClient.mockRejectedValue(new ApiError({ status: 500, code: "INTERNAL_SERVER_ERROR", message: "Server error" }));
    await expect(listRoles()).rejects.toThrow(ApiError);
  });

  it("throws ApiError with NOT_FOUND on missing role", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiClient.mockRejectedValue(new ApiError({ status: 404, code: "NOT_FOUND", message: "Role not found" }));
    await expect(getRole("nonexistent")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("create/edit payload construction", () => {
  it("sends correct payload for creating a role with grants", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Role created", data: { role } });
    await createRole({
      name: "Analyst",
      baseRole: "EMPLOYEE",
      grants: [{ permission: "documents:read" }],
    });
    expect(apiClient).toHaveBeenCalledWith("/roles", {
      method: "POST",
      body: { name: "Analyst", baseRole: "EMPLOYEE", grants: [{ permission: "documents:read" }] },
    });
  });

  it("sends correct payload for creating a role without grants", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Role created", data: { role } });
    await createRole({ name: "Analyst", baseRole: "EMPLOYEE" });
    expect(apiClient).toHaveBeenCalledWith("/roles", {
      method: "POST",
      body: { name: "Analyst", baseRole: "EMPLOYEE" },
    });
  });

  it("sends correct payload for updating name only", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Role updated", data: { role: { ...role, name: "Senior Analyst" } } });
    await updateRole("role-1", { name: "Senior Analyst", version: 3 });
    expect(apiClient).toHaveBeenCalledWith("/roles/role-1", {
      method: "PATCH",
      body: { name: "Senior Analyst", version: 3 },
    });
  });

  it("sends correct payload for updating grants and name", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Role updated", data: { role: { ...role, grants: [{ permission: "documents:read" }] } } });
    await updateRole("role-1", {
      name: "Advanced Analyst",
      grants: [{ permission: "documents:read" }],
      version: 3,
    });
    expect(apiClient).toHaveBeenCalledWith("/roles/role-1", {
      method: "PATCH",
      body: { name: "Advanced Analyst", grants: [{ permission: "documents:read" }], version: 3 },
    });
  });
});

describe("permission grouping and search", () => {
  it("fetches the permission catalog with groups", async () => {
    apiClient.mockResolvedValue(catalogResponse);
    const response = await getPermissionCatalog();
    expect(response.data.contractVersion).toBe(1);
    expect(response.data.groups).toHaveLength(2);
    expect(response.data.groups[0].permissions).toHaveLength(2);
  });

  it("catalog groups have the correct extended structure", async () => {
    apiClient.mockResolvedValue(catalogResponse);
    const response = await getPermissionCatalog();
    const docGroup = response.data.groups.find((g) => g.group === "documents");
    expect(docGroup).toBeDefined();
    const permission = docGroup!.permissions[0];
    expect(permission).toHaveProperty("id");
    expect(permission).toHaveProperty("label");
    expect(permission).toHaveProperty("description");
    expect(permission).toHaveProperty("compatibleScopes");
    expect(permission).toHaveProperty("defaultBaseRoles");
    expect(permission).toHaveProperty("active");
    expect(permission).toHaveProperty("deprecated");
    expect(permission).toHaveProperty("platformOnly");
    expect(permission).toHaveProperty("tenantGrantable");
    expect(permission).toHaveProperty("contractVersion");
  });
});

describe("inherited versus explicit permission display", () => {
  it("returns role with grants field", async () => {
    apiClient.mockResolvedValue({ success: true, data: { role: roleWithGrants } });
    const response = await getRole("role-3");
    expect(response.data.role.grants).toHaveLength(2);
  });

  it("permission grants have canonical structure", async () => {
    apiClient.mockResolvedValue({ success: true, data: { role: roleWithGrants } });
    const response = await getRole("role-3");
    const grant = response.data.role.grants[0];
    expect(grant).toHaveProperty("permission");
    expect(grant.permission).toBe("documents:create");
  });

  it("grants may include scopes", async () => {
    apiClient.mockResolvedValue({ success: true, data: { role: roleWithGrants } });
    const response = await getRole("role-3");
    const scopedGrant = response.data.role.grants.find((g) => g.permission === "documents:read");
    expect(scopedGrant?.scopes?.selfOnly).toBe(true);
  });
});

describe("supported scope handling", () => {
  it("handles scope fields in grant payload", async () => {
    const scopes: {
      selfOnly: boolean;
      departmentIds: string[];
      documentCategories: string[];
      documentClassifications: string[];
    } = {
      selfOnly: false,
      departmentIds: ["dept-1"],
      documentCategories: [],
      documentClassifications: [],
    };
    expect(scopes).toHaveProperty("selfOnly");
    expect(scopes).toHaveProperty("departmentIds");
    expect(scopes).toHaveProperty("documentCategories");
    expect(scopes).toHaveProperty("documentClassifications");
  });

  it("serializes scopes in create role", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Role created", data: { role } });
    await createRole({
      name: "Scoped Role",
      baseRole: "EMPLOYEE",
      grants: [{ permission: "documents:read", scopes: { selfOnly: true, departmentIds: [], documentCategories: [], documentClassifications: [] } }],
    });
    const body = apiClient.mock.calls[0][1].body;
    expect(body.grants[0].scopes.selfOnly).toBe(true);
  });
});

describe("lifecycle confirmation", () => {
  it("clones a role", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Role cloned", data: { role: { ...role, id: "role-clone", name: "Analyst (copy)" } } });
    const response = await cloneRole("role-1", "Analyst (copy)", 3);
    expect(apiClient).toHaveBeenCalledWith("/roles/role-1/clone", {
      method: "POST",
      body: { name: "Analyst (copy)", version: 3 },
    });
    expect(response.data.role.name).toBe("Analyst (copy)");
  });

  it("archives a role", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Role archived", data: { role: { ...role, status: "archived" } } });
    const response = await archiveRole("role-1", 3);
    expect(apiClient).toHaveBeenCalledWith("/roles/role-1/archive", {
      method: "POST",
      body: { version: 3 },
    });
    expect(response.data.role.status).toBe("archived");
  });

  it("reactivates a role", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Role reactivated", data: { role: { ...archivedRole, status: "active" } } });
    const response = await reactivateRole("role-2", 1);
    expect(apiClient).toHaveBeenCalledWith("/roles/role-2/reactivate", {
      method: "POST",
      body: { version: 1 },
    });
    expect(response.data.role.status).toBe("active");
  });

  it("deletes a role", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Role deleted", data: { success: true } });
    await deleteRole("role-2", 1);
    expect(apiClient).toHaveBeenCalledWith("/roles/role-2", {
      method: "DELETE",
      body: { version: 1 },
    });
  });
});

describe("version conflict behavior", () => {
  it("throws ROLE_VERSION_CONFLICT on stale clone", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiClient.mockRejectedValue(new ApiError({ status: 409, code: "ROLE_VERSION_CONFLICT", message: "Role was modified by another request" }));
    await expect(cloneRole("role-1", "Analyst (copy)", 2)).rejects.toMatchObject({ code: "ROLE_VERSION_CONFLICT" });
  });

  it("throws STALE_ROLE_VERSION on legacy update", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiClient.mockRejectedValue(new ApiError({ status: 409, code: "STALE_ROLE_VERSION", message: "Role was modified by another request" }));
    await expect(updateRole("role-1", { name: "Old", version: 1 })).rejects.toMatchObject({ code: "STALE_ROLE_VERSION" });
  });

  it("throws ROLE_VERSION_CONFLICT on assignment with stale version", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiClient.mockRejectedValue(new ApiError({ status: 409, code: "ROLE_VERSION_CONFLICT", message: "Role was modified" }));
    await expect(assignRole("role-1", "user-1", 2)).rejects.toMatchObject({ code: "ROLE_VERSION_CONFLICT" });
  });
});

describe("assignment and removal workflow", () => {
  it("assigns a custom role to a user with correct version", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Role assigned", data: { userId: "user-1", roleId: "role-1", changed: true } });
    const response = await assignRole("role-1", "user-1", 3);
    expect(apiClient).toHaveBeenCalledWith("/roles/role-1/assignments", {
      method: "POST",
      body: { userId: "user-1", roleVersion: 3 },
    });
    expect(response.data.changed).toBe(true);
  });

  it("removes a role assignment", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Assignment removed", data: { userId: "user-1", roleId: null, changed: true } });
    const response = await removeRoleAssignment("role-1", "user-1", 3);
    expect(apiClient).toHaveBeenCalledWith("/roles/role-1/assignments", {
      method: "DELETE",
      body: { userId: "user-1", roleVersion: 3 },
    });
    expect(response.data.changed).toBe(true);
  });

  it("returns changed: false for idempotent assignment", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Already assigned", data: { userId: "user-1", roleId: "role-1", changed: false } });
    const response = await assignRole("role-1", "user-1", 3);
    expect(response.data.changed).toBe(false);
  });

  it("returns changed: false for idempotent removal", async () => {
    apiClient.mockResolvedValue({ success: true, message: "No assignment found", data: { userId: "user-1", roleId: null, changed: false } });
    const response = await removeRoleAssignment("role-1", "user-1", 3);
    expect(response.data.changed).toBe(false);
  });
});

describe("assignment-only retry", () => {
  it("retries only assignment without re-invitation", async () => {
    const { assignRole } = await import("@/services/roles.service");
    apiClient.mockResolvedValue({ success: true, message: "Assigned on retry", data: { userId: "user-1", roleId: "role-1", changed: true } });
    await assignRole("role-1", "user-1", 4);
    expect(apiClient).toHaveBeenCalledTimes(1);
    expect(apiClient).toHaveBeenCalledWith("/roles/role-1/assignments", {
      method: "POST",
      body: { userId: "user-1", roleVersion: 4 },
    });
  });
});

describe("base-role mismatch and archived-role denial", () => {
  it("rejects assigning to mismatched base role", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiClient.mockRejectedValue(new ApiError({ status: 409, code: "ROLE_NOT_ASSIGNABLE", message: "Custom role is not assignable to this base role" }));
    await expect(assignRole("role-1", "user-1", 3)).rejects.toMatchObject({ code: "ROLE_NOT_ASSIGNABLE" });
  });

  it("rejects assigning an archived role", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiClient.mockRejectedValue(new ApiError({ status: 409, code: "ROLE_NOT_ASSIGNABLE", message: "Role is not assignable" }));
    await expect(assignRole("role-2", "user-1", 1)).rejects.toMatchObject({ code: "ROLE_NOT_ASSIGNABLE" });
  });
});

describe("ROLE_IN_USE migration flow", () => {
  it("migrates users between roles", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Users migrated", data: { sourceRoleId: "role-1", destinationRoleId: "role-3", affected: 2, skipped: 0, conflicted: 0 } });
    const response = await migrateRoleUsers("role-1", "role-3", 3, 1);
    expect(apiClient).toHaveBeenCalledWith("/roles/role-1/user-migrations", {
      method: "POST",
      body: { destinationRoleId: "role-3", sourceVersion: 3, destinationVersion: 1 },
    });
    expect(response.data.affected).toBe(2);
    expect(response.data.skipped).toBe(0);
  });

  it("rejects migration to same role", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiClient.mockRejectedValue(new ApiError({ status: 409, code: "ROLE_NOT_ASSIGNABLE", message: "Source and destination roles must differ" }));
    await expect(migrateRoleUsers("role-1", "role-1", 3, 3)).rejects.toMatchObject({ code: "ROLE_NOT_ASSIGNABLE" });
  });

  it("handles migration with skipped users due to base-role mismatch", async () => {
    apiClient.mockResolvedValue({ success: true, message: "Users migrated", data: { sourceRoleId: "role-1", destinationRoleId: "role-3", affected: 2, skipped: 1, conflicted: 0 } });
    const response = await migrateRoleUsers("role-1", "role-3", 3, 1);
    expect(response.data.affected).toBe(2);
    expect(response.data.skipped).toBe(1);
  });
});

describe("SUPER_ADMIN target denial", () => {
  it("rejects assignment targeting SUPER_ADMIN", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiClient.mockRejectedValue(new ApiError({ status: 409, code: "ROLE_NOT_ASSIGNABLE", message: "Super Admin assignments cannot be changed through tenant roles" }));
    await expect(assignRole("role-1", "super-admin-id", 3)).rejects.toMatchObject({ code: "ROLE_NOT_ASSIGNABLE" });
  });
});

describe("permission-aware action visibility", () => {
  it("throws PERMISSION_REQUIRED on insufficient permissions", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiClient.mockRejectedValue(new ApiError({ status: 403, code: "PERMISSION_REQUIRED", message: "Missing required permission" }));
    await expect(createRole({ name: "Unauthorized", baseRole: "EMPLOYEE" })).rejects.toMatchObject({ code: "PERMISSION_REQUIRED" });
  });

  it("throws PRIVILEGE_ESCALATION when granting unavailable permissions", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiClient.mockRejectedValue(new ApiError({ status: 403, code: "PRIVILEGE_ESCALATION", message: "Cannot grant permissions you do not hold" }));
    await expect(createRole({ name: "Escalation", baseRole: "EMPLOYEE", grants: [{ permission: "users:delete" }] })).rejects.toMatchObject({ code: "PRIVILEGE_ESCALATION" });
  });
});

describe("no customRoleId in legacy user endpoints", () => {
  it("assignRole does not pass customRoleId to /users endpoints", async () => {
    apiClient.mockResolvedValue({ success: true, data: { userId: "user-1", roleId: "role-1", changed: true } });
    const result = await assignRole("role-1", "user-1", 3);
    for (const [path, options] of apiClient.mock.calls) {
      if (String(path).startsWith("/users")) {
        expect(options.body).not.toHaveProperty("customRoleId");
      }
    }
    expect(result.data.changed).toBe(true);
  });
});

describe("role usage", () => {
  it("fetches role usage count", async () => {
    apiClient.mockResolvedValue({ success: true, data: { roleId: "role-1", assignedUserCount: 2 } });
    const response = await getRoleUsage("role-1");
    expect(response.data.assignedUserCount).toBe(2);
  });
});

describe("error codes coverage", () => {
  const errorCodes = [
    "PERMISSION_REQUIRED",
    "SCOPE_MISMATCH",
    "INVALID_PERMISSION",
    "UNKNOWN_PERMISSION",
    "ROLE_NOT_ASSIGNABLE",
    "STALE_ROLE_VERSION",
    "ROLE_VERSION_CONFLICT",
    "ROLE_IN_USE",
    "DUPLICATE_ROLE_NAME",
    "MALFORMED_OBJECT_ID",
    "NOT_FOUND",
    "PRIVILEGE_ESCALATION",
    "VALIDATION_ERROR",
  ];

  for (const code of errorCodes) {
    it(`coverage: error code ${code}`, async () => {
      const { ApiError } = await import("@/lib/api-client");
      apiClient.mockRejectedValue(new ApiError({ status: 409, code, message: `Error: ${code}` }));
      await expect(deleteRole("role-1", 1)).rejects.toMatchObject({ code });
      apiClient.mockReset();
      apiClient.mockResolvedValue({ success: true, message: "ok", data: { success: true } });
      await deleteRole("role-1", 1);
    });
  }

  it("coverage: NOT_FOUND on delete", async () => {
    const { ApiError } = await import("@/lib/api-client");
    apiClient.mockRejectedValue(new ApiError({ status: 404, code: "NOT_FOUND", message: "Role not found" }));
    await expect(deleteRole("nonexistent", 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
