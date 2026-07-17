import { apiClient } from "@/lib/api-client";
import type {
  CreateRoleResponse,
  ListRolesResponse,
  UpdateRoleResponse,
  PermissionGrant,
  RoleView,
} from "@/types/api/users.types";
import { getPermissionCatalog, getMyPermissions } from "@/services/permissions.service";

export { getPermissionCatalog, getMyPermissions };

export function listRoles(signal?: AbortSignal) {
  return apiClient<ListRolesResponse>("/roles", { signal });
}

export function getRole(roleId: string) {
  return apiClient<{ success: true; data: { role: RoleView } }>(`/roles/${roleId}`, {
    method: "GET",
  });
}

export function createRole(input: {
  name: string;
  baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
  grants?: PermissionGrant[];
}) {
  return apiClient<CreateRoleResponse>("/roles", {
    method: "POST",
    body: input,
  });
}

export function updateRole(
  roleId: string,
  input: {
    name?: string;
    baseRole?: "COMPANY_ADMIN" | "EMPLOYEE";
    grants?: PermissionGrant[];
    status?: "active" | "archived";
    version: number;
  },
) {
  return apiClient<UpdateRoleResponse>(`/roles/${roleId}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteRole(roleId: string, version: number) {
  return apiClient<{ success: true; message: string; data: { success: boolean } }>(
    `/roles/${roleId}`,
    { method: "DELETE", body: { version } },
  );
}

export function cloneRole(roleId: string, name: string, version: number) {
  return apiClient<CreateRoleResponse>(`/roles/${roleId}/clone`, {
    method: "POST",
    body: { name, version },
  });
}

export function archiveRole(roleId: string, version: number) {
  return apiClient<UpdateRoleResponse>(`/roles/${roleId}/archive`, {
    method: "POST",
    body: { version },
  });
}

export function reactivateRole(roleId: string, version: number) {
  return apiClient<UpdateRoleResponse>(`/roles/${roleId}/reactivate`, {
    method: "POST",
    body: { version },
  });
}

export function assignRole(roleId: string, userId: string, roleVersion: number) {
  return apiClient<{
    success: true;
    message: string;
    data: { userId: string; roleId: string; changed: boolean };
  }>(`/roles/${roleId}/assignments`, {
    method: "POST",
    body: { userId, roleVersion },
  });
}

export function removeRoleAssignment(roleId: string, userId: string, roleVersion: number) {
  return apiClient<{
    success: true;
    message: string;
    data: { userId: string; roleId: null; changed: boolean };
  }>(`/roles/${roleId}/assignments`, {
    method: "DELETE",
    body: { userId, roleVersion },
  });
}

export function migrateRoleUsers(
  sourceRoleId: string,
  destinationRoleId: string,
  sourceVersion: number,
  destinationVersion: number,
) {
  return apiClient<{
    success: true;
    message: string;
    data: {
      sourceRoleId: string;
      destinationRoleId: string;
      affected: number;
      skipped: number;
      conflicted: number;
    };
  }>(`/roles/${sourceRoleId}/user-migrations`, {
    method: "POST",
    body: {
      destinationRoleId,
      sourceVersion,
      destinationVersion,
    },
  });
}

export function getRoleUsage(roleId: string) {
  return apiClient<{ success: true; data: { roleId: string; assignedUserCount: number } }>(
    `/roles/${roleId}/usage`,
  );
}
