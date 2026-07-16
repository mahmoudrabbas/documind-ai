import type { UserDocument } from "../../db/models/user.model.js";
import UserModel from "../../db/models/user.model.js";
import {
  tenantScopedDeleteOne,
  tenantScopedFind,
  tenantScopedUpdateOne,
} from "../../db/repositories/tenantScopedRepository.js";
import {
  createUser,
  findTenantById,
  findUserDocumentByTenantAndEmail,
  findUserByTenantAndId,
} from "../auth/auth.repository.js";

export {
  createUser,
  findTenantById,
  findUserDocumentByTenantAndEmail,
  findUserByTenantAndId,
};

export function countUsersByTenant(tenantId: string) {
  return tenantScopedFind(UserModel, tenantId, {}).countDocuments().exec();
}

export function findUsersByTenant(
  tenantId: string,
  page: number,
  pageSize: number,
) {
  return tenantScopedFind(UserModel, tenantId, {})
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .populate<{ customRoleId: { _id: string; name: string } | null }>(
      "customRoleId",
      "name",
    )
    .lean<UserDocument[]>()
    .exec();
}

export function countActiveCompanyAdminsByTenant(tenantId: string) {
  return UserModel.countDocuments({
    tenantId,
    role: "COMPANY_ADMIN",
    status: "active",
  }).exec();
}

export async function updateUserByTenantAndId(
  tenantId: string,
  userId: string,
  update: Record<string, unknown>,
) {
  await tenantScopedUpdateOne(
    UserModel,
    tenantId,
    { _id: userId },
    { $set: update },
  ).exec();
  return findUserByTenantAndId(tenantId, userId);
}

export async function deleteUserByTenantAndId(
  tenantId: string,
  userId: string,
) {
  return tenantScopedDeleteOne(UserModel, tenantId, { _id: userId }).exec();
}
