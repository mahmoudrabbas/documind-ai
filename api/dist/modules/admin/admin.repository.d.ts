import { type TenantDocument } from "../../db/models/tenant.model.js";
export declare function countTenantsByFilter(filter: Record<string, unknown>): Promise<number>;
export declare function findTenantsByFilter(filter: Record<string, unknown>, page: number, pageSize: number): Promise<TenantDocument[]>;
//# sourceMappingURL=admin.repository.d.ts.map