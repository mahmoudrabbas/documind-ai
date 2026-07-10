import UserModel from "../../db/models/user.model.js";
import { tenantScopedFind, tenantScopedUpdateOne, } from "../../db/repositories/tenantScopedRepository.js";
import { createUser, findTenantById, findUserDocumentByTenantAndEmail, findUserByTenantAndId, } from "../auth/auth.repository.js";
export { createUser, findTenantById, findUserDocumentByTenantAndEmail, findUserByTenantAndId, };
export function countUsersByTenant(tenantId) {
    return tenantScopedFind(UserModel, tenantId, {}).countDocuments().exec();
}
export function findUsersByTenant(tenantId, page, pageSize) {
    return tenantScopedFind(UserModel, tenantId, {})
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec();
}
export async function updateUserByTenantAndId(tenantId, userId, update) {
    await tenantScopedUpdateOne(UserModel, tenantId, { _id: userId }, { $set: update }).exec();
    return findUserByTenantAndId(tenantId, userId);
}
//# sourceMappingURL=users.repository.js.map