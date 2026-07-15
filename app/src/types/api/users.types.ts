export interface UserView {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
  customRoleId?: string;
  customRoleName?: string;
  status: "active" | "pending" | "pending_email_verification" | "disabled";
  emailVerified: boolean;
  createdAt: string;
}

export interface UsersPagination { page: number; pageSize: number; totalPages: number; totalRecords: number }
export interface UsersResponse { success: true; data: { users: UserView[]; pagination: UsersPagination } }

export interface RoleView {
  id: string;
  tenantId: string;
  name: string;
  baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
  permissions: string[];
  scopes: {
    selfOnly: boolean;
    departmentIds: string[];
    categories: string[];
  };
  status: string;
  version: number;
  userCount: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListRolesResponse { success: true; data: { roles: RoleView[] } }
export interface CreateRoleResponse { success: true; message: string; data: { role: RoleView } }
export interface UpdateRoleResponse { success: true; message: string; data: { role: RoleView } }
export interface CloneRoleResponse { success: true; message: string; data: { role: RoleView } }
export interface ArchiveRoleResponse { success: true; message: string; data: { role: RoleView } }
