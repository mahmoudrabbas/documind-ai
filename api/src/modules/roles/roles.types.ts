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
