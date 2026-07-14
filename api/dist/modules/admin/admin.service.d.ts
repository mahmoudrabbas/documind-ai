import type { ListTenantsResult, TenantPublicView, ListTenantsInput, UpdateTenantInput, UpdateTenantResult } from "./admin.types.js";
import type { AuthIdentity } from "../auth/auth.types.js";
export declare function listTenants(input: ListTenantsInput): Promise<ListTenantsResult>;
export declare function getTenant(id: string): Promise<TenantPublicView>;
export declare function updateTenant(input: UpdateTenantInput, actor?: AuthIdentity): Promise<UpdateTenantResult>;
//# sourceMappingURL=admin.service.d.ts.map