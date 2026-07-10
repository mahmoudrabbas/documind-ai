import { type TenantDocument } from "../../db/models/tenant.model.js";
export declare function countTenantsByFilter(filter: Record<string, unknown>): Promise<number>;
export declare function findTenantsByFilter(filter: Record<string, unknown>, page: number, pageSize: number): Promise<TenantDocument[]>;
export declare function updateTenantById(id: string, updateData: Record<string, unknown>): Promise<TenantDocument | null>;
//# sourceMappingURL=admin.repository.d.ts.map