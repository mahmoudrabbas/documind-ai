import type { UserDocument } from "../../db/models/user.model.js";
import { createUser, findTenantById, findUserDocumentByTenantAndEmail, findUserByTenantAndId } from "../auth/auth.repository.js";
export { createUser, findTenantById, findUserDocumentByTenantAndEmail, findUserByTenantAndId, };
export declare function countUsersByTenant(tenantId: string): Promise<number>;
export declare function findUsersByTenant(tenantId: string, page: number, pageSize: number): Promise<UserDocument[]>;
export declare function updateUserByTenantAndId(tenantId: string, userId: string, update: Partial<Pick<UserDocument, "role" | "status">>): Promise<UserDocument | null>;
//# sourceMappingURL=users.repository.d.ts.map