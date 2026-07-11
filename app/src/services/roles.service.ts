import { apiClient } from "@/lib/api-client";
import type {
  CreateRoleResponse,
  ListRolesResponse,
  RoleView,
  UpdateRoleResponse,
} from "@/types/api/users.types";

export function listRoles(signal?: AbortSignal) {
  return apiClient<ListRolesResponse>("/roles", { signal });
}

export function createRole(input: { name: string; baseRole: "COMPANY_ADMIN" | "EMPLOYEE" }) {
  return apiClient<CreateRoleResponse>("/roles", {
    method: "POST",
    body: input,
  });
}

export function updateRole(
  roleId: string,
  input: { name?: string; baseRole?: "COMPANY_ADMIN" | "EMPLOYEE" },
) {
  return apiClient<UpdateRoleResponse>(`/roles/${roleId}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteRole(roleId: string) {
  return apiClient<{ success: true; message: string; data: { success: boolean } }>(
    `/roles/${roleId}`,
    { method: "DELETE" },
  );
}
