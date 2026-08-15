import { apiClient } from "@/lib/api-client";
import { assignRole } from "@/services/roles.service";
import type { RoleView, UserView, UsersResponse } from "@/types/api/users.types";

export function listUsers(
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
  filters?: { search?: string; role?: "COMPANY_ADMIN" | "EMPLOYEE" },
) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (filters?.search?.trim()) params.set("search", filters.search.trim());
  if (filters?.role) params.set("role", filters.role);
  return apiClient<UsersResponse>(`/users?${params.toString()}`, { signal });
}

export function inviteUser(input: {
  name: string;
  email: string;
  role: "COMPANY_ADMIN" | "EMPLOYEE";
  departmentId?: string | null;
}) {
  return apiClient<{
    success: true;
    message: string;
    data: { user: UserView; emailDelivery?: { sent: boolean; error?: string } };
  }>("/users", { method: "POST", body: input });
}

export function updateUser(
  userId: string,
  input: {
    role?: "COMPANY_ADMIN" | "EMPLOYEE";
    status?: UserView["status"];
    departmentId?: string | null;
  },
) {
  return apiClient<{ success: true; message: string; data: { user: UserView } }>(
    `/users/${userId}`,
    { method: "PATCH", body: input },
  );
}

export type InvitationResult =
  | { status: "complete"; user: UserView; emailDelivery?: { sent: boolean; error?: string } }
  | {
      status: "assignment-failed";
      user: UserView;
      role: RoleView;
      error: unknown;
      emailDelivery?: { sent: boolean; error?: string };
    };

export async function inviteUserWithRole(input: {
  name: string;
  email: string;
  role: "COMPANY_ADMIN" | "EMPLOYEE" | RoleView;
  departmentId?: string | null;
}): Promise<InvitationResult> {
  const baseRole = typeof input.role === "string" ? input.role : input.role.baseRole;
  const invitation = await inviteUser({
    name: input.name,
    email: input.email,
    role: baseRole,
    departmentId: input.departmentId ?? null,
  });
  const emailDelivery = invitation.data.emailDelivery;
  if (typeof input.role === "string") {
    return { status: "complete", user: invitation.data.user, emailDelivery };
  }
  try {
    await assignRole(input.role.id, invitation.data.user.id, input.role.version);
    return {
      status: "complete",
      user: { ...invitation.data.user, customRoleId: input.role.id, customRoleName: input.role.name },
      emailDelivery,
    };
  } catch (error) {
    return { status: "assignment-failed", user: invitation.data.user, role: input.role, error, emailDelivery };
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
  departmentId?: string | null;
}): Promise<UserView> {
  if (typeof input.selectedRole === "string") {
    const response = await updateUser(input.user.id, {
      role: input.selectedRole,
      status: input.status,
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
    });
    return response.data.user;
  }

  let user = input.user;
  if (
    user.role !== input.selectedRole.baseRole ||
    user.status !== input.status ||
    input.departmentId !== undefined && user.departmentId !== input.departmentId
  ) {
    const response = await updateUser(user.id, {
      ...(user.role !== input.selectedRole.baseRole ? { role: input.selectedRole.baseRole } : {}),
      ...(user.status !== input.status ? { status: input.status } : {}),
      ...(input.departmentId !== undefined && user.departmentId !== input.departmentId
        ? { departmentId: input.departmentId }
        : {}),
    });
    user = response.data.user;
  }
  await assignRole(input.selectedRole.id, user.id, input.selectedRole.version);
  return { ...user, customRoleId: input.selectedRole.id, customRoleName: input.selectedRole.name };
}

export async function listAllUsers(
  signal?: AbortSignal,
  filters?: { search?: string; role?: "COMPANY_ADMIN" | "EMPLOYEE" },
): Promise<UserView[]> {
  const first = await listUsers(1, 100, signal, filters);
  const pages = first.data.pagination.totalPages;
  if (pages <= 1) return first.data.users;
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      listUsers(index + 2, 100, signal, filters),
    ),
  );
  return first.data.users.concat(rest.flatMap((response) => response.data.users));
}

export function resendInvitation(userId: string) {
  return apiClient<{
    success: true;
    message: string;
    data: {
      user: UserView;
      emailDelivery?: { sent: boolean; error?: string };
    };
  }>(`/users/${userId}/resend-invitation`, { method: "POST" });
}

export function revokeInvitation(userId: string) {
  return apiClient<{ success: true; message: string }>(
    `/users/${userId}/revoke-invitation`,
    { method: "POST" },
  );
}
