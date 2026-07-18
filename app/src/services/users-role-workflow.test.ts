import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiClient, assignRole } = vi.hoisted(() => ({
  apiClient: vi.fn(),
  assignRole: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({ apiClient }));
vi.mock("@/services/roles.service", () => ({ assignRole }));

import {
  inviteUserWithRole,
  retryInvitationRoleAssignment,
  updateUserWithRole,
} from "./users.service";
import type { RoleView, UserView } from "@/types/api/users.types";

const user: UserView = {
  id: "user-1",
  tenantId: "tenant-1",
  name: "User",
  email: "user@example.test",
  role: "EMPLOYEE",
  status: "active",
  emailVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
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
  userCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  createdBy: null,
  updatedBy: null,
  migrationState: "complete",
};

beforeEach(() => {
  apiClient.mockReset();
  assignRole.mockReset();
});

describe("user custom-role workflows", () => {
  it("invites a base-role user with one base-role-only request", async () => {
    apiClient.mockResolvedValue({ data: { user } });
    await inviteUserWithRole({ name: "User", email: user.email, role: "EMPLOYEE" });
    expect(apiClient).toHaveBeenCalledWith("/users", {
      method: "POST",
      body: { name: "User", email: user.email, role: "EMPLOYEE" },
    });
    expect(assignRole).not.toHaveBeenCalled();
  });

  it("invites then assigns a custom role with the observed version", async () => {
    apiClient.mockResolvedValue({ data: { user } });
    assignRole.mockResolvedValue({ data: { changed: true } });
    const result = await inviteUserWithRole({ name: "User", email: user.email, role });
    expect(assignRole).toHaveBeenCalledWith("role-1", "user-1", 3);
    expect(result.status).toBe("complete");
  });

  it("returns explicit partial success when assignment fails", async () => {
    apiClient.mockResolvedValue({ data: { user } });
    assignRole.mockRejectedValue(new Error("stale"));
    const result = await inviteUserWithRole({ name: "User", email: user.email, role });
    expect(result.status).toBe("assignment-failed");
    if (result.status === "assignment-failed") expect(result.user.id).toBe("user-1");
  });

  it("retries only assignment and never resends the invitation", async () => {
    assignRole.mockResolvedValue({ data: { changed: true } });
    await retryInvitationRoleAssignment("user-1", { ...role, version: 4 });
    expect(apiClient).not.toHaveBeenCalled();
    expect(assignRole).toHaveBeenCalledWith("role-1", "user-1", 4);
  });

  it("assigns a custom role to an existing compatible user without PATCH", async () => {
    assignRole.mockResolvedValue({ data: { changed: true } });
    await updateUserWithRole({ user, selectedRole: role, status: "active" });
    expect(apiClient).not.toHaveBeenCalled();
    expect(assignRole).toHaveBeenCalledWith("role-1", "user-1", 3);
  });

  it("combines a status update with custom-role assignment without customRoleId", async () => {
    apiClient.mockResolvedValue({ data: { user: { ...user, status: "disabled" } } });
    assignRole.mockResolvedValue({ data: { changed: true } });
    await updateUserWithRole({ user, selectedRole: role, status: "disabled" });
    expect(apiClient).toHaveBeenCalledWith("/users/user-1", {
      method: "PATCH",
      body: { status: "disabled" },
    });
    expect(assignRole).toHaveBeenCalledWith("role-1", "user-1", 3);
  });

  it("surfaces stale role-version assignment as partial invitation success", async () => {
    apiClient.mockResolvedValue({ data: { user } });
    assignRole.mockRejectedValue(Object.assign(new Error("Role changed"), {
      code: "ROLE_VERSION_CONFLICT",
    }));
    const result = await inviteUserWithRole({ name: "User", email: user.email, role });
    expect(result.status).toBe("assignment-failed");
    if (result.status === "assignment-failed") {
      expect((result.error as { code: string }).code).toBe("ROLE_VERSION_CONFLICT");
      expect(result.user.id).toBe("user-1");
    }
  });

  it("does not return a false custom-role success when existing-user assignment fails", async () => {
    assignRole.mockRejectedValue(new Error("denied"));
    await expect(updateUserWithRole({
      user,
      selectedRole: role,
      status: "active",
    })).rejects.toThrow("denied");
  });

  it("updates a base-role mismatch before dedicated assignment", async () => {
    const admin = { ...user, role: "COMPANY_ADMIN" as const };
    apiClient.mockResolvedValue({ data: { user } });
    assignRole.mockResolvedValue({ data: { changed: true } });
    await updateUserWithRole({ user: admin, selectedRole: role, status: "disabled" });
    expect(apiClient).toHaveBeenCalledWith("/users/user-1", {
      method: "PATCH",
      body: { role: "EMPLOYEE", status: "disabled" },
    });
    expect(assignRole).toHaveBeenCalledWith("role-1", "user-1", 3);
  });

  it("switches from custom role to base role through PATCH, clearing it server-side", async () => {
    const customUser = { ...user, customRoleId: role.id, customRoleName: role.name };
    apiClient.mockResolvedValue({ data: { user } });
    await updateUserWithRole({ user: customUser, selectedRole: "EMPLOYEE", status: "active" });
    expect(apiClient.mock.calls[0][1].body).toEqual({ role: "EMPLOYEE", status: "active" });
    expect(assignRole).not.toHaveBeenCalled();
  });

  it("never sends customRoleId in any /users request", async () => {
    apiClient.mockResolvedValue({ data: { user } });
    assignRole.mockResolvedValue({ data: { changed: true } });
    await inviteUserWithRole({ name: "User", email: user.email, role });
    await updateUserWithRole({ user, selectedRole: "EMPLOYEE", status: "disabled" });
    for (const [path, options] of apiClient.mock.calls) {
      if (String(path).startsWith("/users")) {
        expect(options.body).not.toHaveProperty("customRoleId");
      }
    }
  });
});
