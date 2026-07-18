import type { Role } from "@/constants/routes";

export interface UserView {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: Role;
  customRoleId?: string;
  customRoleName?: string;
  status: "active" | "pending" | "pending_email_verification" | "disabled";
  emailVerified: boolean;
  employeeProfile?: {
    employeeId?: string;
    department?: string;
    jobTitle?: string;
    phone?: string;
    hireDate?: string;
    managerId?: string;
    preferredLanguage?: string;
  };
  createdAt: string;
}

export interface UsersPagination { page: number; pageSize: number; totalPages: number; totalRecords: number }
export interface UsersResponse { success: true; data: { users: UserView[]; pagination: UsersPagination } }

export interface RoleView {
  id: string;
  tenantId: string;
  name: string;
  baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
  version: number;
  status: "active" | "archived";
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListRolesResponse { success: true; data: { roles: RoleView[] } }
export interface CreateRoleResponse { success: true; message: string; data: { role: RoleView } }
export interface UpdateRoleResponse { success: true; message: string; data: { role: RoleView } }

export interface PermissionCatalogResponse {
  success: true;
  data: {
    contractVersion: number;
    groups: Array<{
      group: string;
      label: string;
      permissions: Array<{ id: string; label: string; description: string }>;
    }>;
  };
}
