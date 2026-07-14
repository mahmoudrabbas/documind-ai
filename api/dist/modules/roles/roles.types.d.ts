export interface CreateRoleInput {
    name: string;
    baseRole: "COMPANY_ADMIN" | "EMPLOYEE";
}
export interface UpdateRoleInput {
    name?: string;
    baseRole?: "COMPANY_ADMIN" | "EMPLOYEE";
}
export interface RolePublicView {
    id: string;
    tenantId: string;
    name: string;
    baseRole: string;
    userCount: number;
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
//# sourceMappingURL=roles.types.d.ts.map