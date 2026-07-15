import UserModel from "../../db/models/user.model.js";
import { tenantScopedDeleteOne, tenantScopedFind, tenantScopedUpdateOne, } from "../../db/repositories/tenantScopedRepository.js";
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
        .populate("customRoleId", "name")
        .lean()
        .exec();
}
export function countActiveCompanyAdminsByTenant(tenantId) {
    return UserModel.countDocuments({
        tenantId,
        role: "COMPANY_ADMIN",
        status: "active",
    }).exec();
}
export async function updateUserByTenantAndId(tenantId, userId, update) {
    await tenantScopedUpdateOne(UserModel, tenantId, { _id: userId }, { $set: update }).exec();
    return findUserByTenantAndId(tenantId, userId);
}
export async function deleteUserByTenantAndId(tenantId, userId) {
    return tenantScopedDeleteOne(UserModel, tenantId, { _id: userId }).exec();
}
//# sourceMappingURL=users.repository.js.map