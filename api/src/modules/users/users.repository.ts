import type { Types } from "mongoose";
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
  type UserSingleRecord,
} from "../auth/auth.repository.js";

export {
  createUser,
  findTenantById,
  findUserDocumentByTenantAndEmail,
  findUserByTenantAndId,
};

export function countUsersByTenant(
  tenantId: string,
  filter: ListUsersFilter = {},
  authorizationFilter: Record<string, unknown> = {},
) {
  return tenantScopedFind(UserModel, tenantId, { ...buildListFilter(filter), ...authorizationFilter })
    .countDocuments()
    .exec();
}

export function findUsersByTenant(
  tenantId: string,
  page: number,
  pageSize: number,
  filter: ListUsersFilter = {},
  authorizationFilter: Record<string, unknown> = {},
): Promise<UserSingleRecord[]> {
  return tenantScopedFind(UserModel, tenantId, { ...buildListFilter(filter), ...authorizationFilter })
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .populate<{ customRoleId: { _id: Types.ObjectId; name: string } | null }>(
      "customRoleId",
      "name",
    )
    .populate<{ employeeProfile: { departmentId: { _id: Types.ObjectId; name: string } | null } }>(
      "employeeProfile.departmentId",
      "name",
    )
    .lean<UserSingleRecord[]>()
    .exec();
}

export interface ListUsersFilter {
  search?: string;
  role?: "COMPANY_ADMIN" | "EMPLOYEE";
  status?: "active" | "pending" | "pending_email_verification" | "disabled";
  departmentId?: string;
}

function buildListFilter(filter: ListUsersFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  if (filter.role) query.role = filter.role;
  if (filter.status) query.status = filter.status;
  if (filter.departmentId) query["employeeProfile.departmentId"] = filter.departmentId;
  if (filter.search) {
    const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { email: { $regex: escaped, $options: "i" } },
    ];
  }
  return query;
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
