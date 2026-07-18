import type { Role } from "@/constants/routes";
import type { PermissionGrant } from "@/types/api/permissions.types";

export type {
  PermissionScopes,
  PermissionGrant,
  PermissionCatalogEntry,
  PermissionCatalogGroup,
  PermissionScopeType,
  PermissionCatalogResponse,
  PermissionSource,
  CustomRoleState,
  CurrentPermissionsResponse,
} from "@/types/api/permissions.types";

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
  grants: PermissionGrant[];
  contractVersion: number;
  status: "active" | "archived";
  version: number;
  userCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  migrationState: "complete" | "quarantined";
  migrationReason?: string;
}

export interface ListRolesResponse { success: true; data: { roles: RoleView[] } }
export interface CreateRoleResponse { success: true; message: string; data: { role: RoleView } }
export interface UpdateRoleResponse { success: true; message: string; data: { role: RoleView } }
