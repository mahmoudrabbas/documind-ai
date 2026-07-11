import { apiClient } from "@/lib/api-client";
import type { UserView, UsersResponse } from "@/types/api/users.types";

export function listUsers(page = 1, pageSize = 20, signal?: AbortSignal) {
  return apiClient<UsersResponse>(`/users?page=${page}&pageSize=${pageSize}`, { signal });
}

export function inviteUser(input: {
  name: string;
  email: string;
  role?: "COMPANY_ADMIN" | "EMPLOYEE";
  customRoleId?: string;
}) {
  return apiClient<{ success: true; message: string; data: { user: UserView } }>("/users", { method: "POST", body: input });
}

export async function listAllUsers(signal?: AbortSignal): Promise<UserView[]> {
  const first = await listUsers(1, 100, signal);
  const pages = first.data.pagination.totalPages;
  if (pages <= 1) return first.data.users;
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => listUsers(index + 2, 100, signal)));
  return first.data.users.concat(rest.flatMap((response) => response.data.users));
}
