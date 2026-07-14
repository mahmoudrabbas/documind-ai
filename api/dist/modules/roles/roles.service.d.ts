import type { CreateRoleResult, ListRolesResult, UpdateRoleResult } from "./roles.types.js";
export declare function createRole(input: unknown, tenantId: string): Promise<CreateRoleResult>;
export declare function listRoles(tenantId: string): Promise<ListRolesResult>;
export declare function updateRole(input: unknown, tenantId: string, roleId: string): Promise<UpdateRoleResult>;
export declare function deleteRole(tenantId: string, roleId: string): Promise<{
    success: boolean;
}>;
//# sourceMappingURL=roles.service.d.ts.map