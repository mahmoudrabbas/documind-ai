import type { PermissionScopes } from "../permissions/permissions.types.js";

export interface CreateRoleInput {
  name: string;
  baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
  permissions?: string[];
  scopes?: Partial<PermissionScopes>;
}

export interface UpdateRoleInput {
  name?: string;
  baseRole?: "COMPANY_ADMIN" | "EMPLOYEE";
  permissions?: string[];
  scopes?: Partial<PermissionScopes>;
}

export interface CloneRoleInput {
  name: string;
}

export interface RolePublicView {
  id: string;
  tenantId: string;
  name: string;
  baseRole: string;
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

export interface CreateRoleResult {
  role: RolePublicView;
}

export interface UpdateRoleResult {
  role: RolePublicView;
}

export interface ListRolesResult {
  roles: RolePublicView[];
}

export interface CloneRoleResult {
  role: RolePublicView;
}

export interface ArchiveRoleResult {
  role: RolePublicView;
}
