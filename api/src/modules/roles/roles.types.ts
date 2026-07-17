import type { TenantRoleBase } from "../../common/auth/baseRoles.js";
import type { PermissionGrant } from "../permissions/permissions.types.js";

export interface CreateRoleInput {
  name: string;
  baseRole: TenantRoleBase;
  grants: PermissionGrant[];
}

export interface UpdateRoleInput {
  name?: string;
  baseRole?: TenantRoleBase;
  grants?: PermissionGrant[];
  status?: "active" | "archived";
  version: number;
}

export interface DeleteRoleInput { version: number }
export interface CloneRoleInput { name: string; version: number }
export interface ChangeRoleStatusInput { version: number }
export interface AssignRoleInput { userId: string; roleVersion: number }
export interface RemoveRoleAssignmentInput { userId: string; roleVersion: number }
export interface MigrateRoleUsersInput {
  destinationRoleId: string;
  sourceVersion: number;
  destinationVersion: number;
}

export interface RolePublicView {
  id: string;
  tenantId: string;
  name: string;
  baseRole: TenantRoleBase;
  grants: PermissionGrant[];
  contractVersion: number;
  status: "active" | "archived";
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  migrationState: "complete" | "quarantined";
  migrationReason?: string;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleResult { role: RolePublicView }
export interface UpdateRoleResult { role: RolePublicView }
export interface ListRolesResult { roles: RolePublicView[] }
export interface RoleUsageResult { roleId: string; assignedUserCount: number }
export interface RoleAssignmentResult { userId: string; roleId: string | null; changed: boolean }
export interface RoleMigrationResult {
  sourceRoleId: string;
  destinationRoleId: string;
  affected: number;
  skipped: number;
  conflicted: number;
}
