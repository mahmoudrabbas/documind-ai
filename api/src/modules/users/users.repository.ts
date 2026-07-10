import type { UserDocument } from "../../db/models/user.model.js";
import UserModel from "../../db/models/user.model.js";
import { tenantScopedFind } from "../../db/repositories/tenantScopedRepository.js";
import { createUser, findTenantById, findUserDocumentByTenantAndEmail, findUserByTenantAndId } from "../auth/auth.repository.js";

export { createUser, findTenantById, findUserDocumentByTenantAndEmail, findUserByTenantAndId };

export function countUsersByTenant(tenantId: string) {
  return tenantScopedFind(UserModel, tenantId, {}).countDocuments().exec();
}

export function findUsersByTenant(tenantId: string, page: number, pageSize: number) {
  return tenantScopedFind(UserModel, tenantId, {})
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean<UserDocument[]>()
    .exec();
}
