import { apiClient } from "@/lib/api-client";
import { assignRole } from "@/services/roles.service";
import type { RoleView, UserView, UsersResponse } from "@/types/api/users.types";

export function listUsers(page = 1, pageSize = 20, signal?: AbortSignal) {
  return apiClient<UsersResponse>(`/users?page=${page}&pageSize=${pageSize}`, { signal });
}

export function inviteUser(input: {
  name: string;
  email: string;
  role: "COMPANY_ADMIN" | "EMPLOYEE";
}) {
  return apiClient<{ success: true; message: string; data: { user: UserView } }>("/users", { method: "POST", body: input });
}

export function updateUser(
  userId: string,
  input: {
    role?: "COMPANY_ADMIN" | "EMPLOYEE";
    status?: UserView["status"];
  },
) {
  return apiClient<{ success: true; message: string; data: { user: UserView } }>(
    `/users/${userId}`,
    { method: "PATCH", body: input },
  );
}

export type InvitationResult =
  | { status: "complete"; user: UserView }
  | {
      status: "assignment-failed";
      user: UserView;
      role: RoleView;
      error: unknown;
    };

export async function inviteUserWithRole(input: {
  name: string;
  email: string;
  role: "COMPANY_ADMIN" | "EMPLOYEE" | RoleView;
}): Promise<InvitationResult> {
  const baseRole = typeof input.role === "string" ? input.role : input.role.baseRole;
  const invitation = await inviteUser({
    name: input.name,
    email: input.email,
    role: baseRole,
  });
  if (typeof input.role === "string") {
    return { status: "complete", user: invitation.data.user };
  }
  try {
    await assignRole(input.role.id, invitation.data.user.id, input.role.version);
    return {
      status: "complete",
      user: { ...invitation.data.user, customRoleId: input.role.id, customRoleName: input.role.name },
    };
  } catch (error) {
    return { status: "assignment-failed", user: invitation.data.user, role: input.role, error };
  }
}

export async function retryInvitationRoleAssignment(
  userId: string,
  role: RoleView,
) {
  return assignRole(role.id, userId, role.version);
}

export async function updateUserWithRole(input: {
  user: UserView;
  selectedRole: "COMPANY_ADMIN" | "EMPLOYEE" | RoleView;
  status: UserView["status"];
}): Promise<UserView> {
  if (typeof input.selectedRole === "string") {
    const response = await updateUser(input.user.id, {
      role: input.selectedRole,
      status: input.status,
    });
    return response.data.user;
  }

  let user = input.user;
  if (user.role !== input.selectedRole.baseRole || user.status !== input.status) {
    const response = await updateUser(user.id, {
      ...(user.role !== input.selectedRole.baseRole ? { role: input.selectedRole.baseRole } : {}),
      ...(user.status !== input.status ? { status: input.status } : {}),
    });
    user = response.data.user;
  }
  await assignRole(input.selectedRole.id, user.id, input.selectedRole.version);
  return { ...user, customRoleId: input.selectedRole.id, customRoleName: input.selectedRole.name };
}

export async function listAllUsers(signal?: AbortSignal): Promise<UserView[]> {
  const first = await listUsers(1, 100, signal);
  const pages = first.data.pagination.totalPages;
  if (pages <= 1) return first.data.users;
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => listUsers(index + 2, 100, signal)));
  return first.data.users.concat(rest.flatMap((response) => response.data.users));
}
