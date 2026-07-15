import { apiClient } from "@/lib/api-client";
import type {
  ArchiveRoleResponse,
  CloneRoleResponse,
  CreateRoleResponse,
  ListRolesResponse,
  UpdateRoleResponse,
} from "@/types/api/users.types";

export function listRoles(signal?: AbortSignal) {
  return apiClient<ListRolesResponse>("/roles", { signal });
}

export function createRole(input: {
  name: string;
  baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
  permissions?: string[];
  scopes?: { selfOnly?: boolean; departmentIds?: string[]; categories?: string[] };
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
    permissions?: string[];
    scopes?: { selfOnly?: boolean; departmentIds?: string[]; categories?: string[] };
  },
) {
  return apiClient<UpdateRoleResponse>(`/roles/${roleId}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteRole(roleId: string) {
  return apiClient<{ success: true; message: string }>(
    `/roles/${roleId}`,
    { method: "DELETE" },
  );
}

export function cloneRole(roleId: string, input: { name: string }) {
  return apiClient<CloneRoleResponse>(`/roles/${roleId}/clone`, {
    method: "POST",
    body: input,
  });
}

export function archiveRole(roleId: string) {
  return apiClient<ArchiveRoleResponse>(`/roles/${roleId}/archive`, {
    method: "POST",
  });
}
