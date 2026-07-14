import { type TenantDocument } from "../../db/models/tenant.model.js";
import type { Types } from "mongoose";
export declare function countTenantsByFilter(filter: Record<string, unknown>): Promise<number>;
export declare function findTenantsByFilter(filter: Record<string, unknown>, page: number, pageSize: number): Promise<TenantDocument[]>;
export declare function updateTenantById(id: string, updateData: Record<string, unknown>): Promise<TenantDocument | null>;
export declare function findTenantById(id: string): Promise<TenantDocument | null>;
export declare function aggregateTenantStats(tenantIds: Types.ObjectId[]): Promise<{
    users: Map<any, any>;
    documents: Map<any, any>;
    questions: Map<any, any>;
}>;
//# sourceMappingURL=admin.repository.d.ts.map