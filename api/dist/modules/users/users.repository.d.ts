import type { UserDocument } from "../../db/models/user.model.js";
import { createUser, findTenantById, findUserDocumentByTenantAndEmail, findUserByTenantAndId } from "../auth/auth.repository.js";
export { createUser, findTenantById, findUserDocumentByTenantAndEmail, findUserByTenantAndId, };
export declare function countUsersByTenant(tenantId: string): Promise<number>;
export declare function findUsersByTenant(tenantId: string, page: number, pageSize: number): Promise<UserDocument[]>;
export declare function updateUserByTenantAndId(tenantId: string, userId: string, update: Record<string, unknown>): Promise<UserDocument | null>;
export declare function deleteUserByTenantAndId(tenantId: string, userId: string): Promise<import("mongodb").DeleteResult>;
//# sourceMappingURL=users.repository.d.ts.map