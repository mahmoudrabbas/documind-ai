import { AppError } from "../../common/errors/AppError.js";
import { NOT_FOUND, VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import RoleModel from "../../db/models/role.model.js";
import UserModel from "../../db/models/user.model.js";
import { tenantScopedFind } from "../../db/repositories/tenantScopedRepository.js";
import {
  validateCreateRoleInput,
  validateUpdateRoleInput,
} from "./roles.validator.js";
import type {
  CreateRoleResult,
  ListRolesResult,
  RolePublicView,
  UpdateRoleResult,
} from "./roles.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeRole(doc: any, userCount = 0): RolePublicView {
  return {
    id: doc._id?.toString() ?? "",
    tenantId: doc.tenantId?.toString() ?? "",
    name: (doc.name as string) ?? "",
    baseRole: (doc.baseRole as string) ?? "",
    userCount,
    createdAt: (doc.createdAt as Date)?.toISOString() ?? new Date().toISOString(),
    updatedAt: (doc.updatedAt as Date)?.toISOString() ?? new Date().toISOString(),
  };
}

async function getUserCountForRole(
  tenantId: string,
  roleId: string,
): Promise<number> {
  return UserModel.countDocuments({
    tenantId,
    customRoleId: roleId,
  }).exec();
}

export async function createRole(
  input: unknown,
  tenantId: string,
): Promise<CreateRoleResult> {
  const payload = validateCreateRoleInput(input);
  const normalizedName = payload.name.trim().toLowerCase();

  const existing = await RoleModel.findOne({
    tenantId,
    normalizedName,
  }).exec();

  if (existing) {
    throw new AppError(
      409,
      VALIDATION_ERROR,
      "A role with this name already exists in your tenant",
    );
  }

  const role = await RoleModel.create({
    tenantId,
    name: payload.name.trim(),
    normalizedName,
    baseRole: payload.baseRole,
  });

  return {
    role: serializeRole(role.toObject()),
  };
}

export async function listRoles(tenantId: string): Promise<ListRolesResult> {
  const roles = await tenantScopedFind(RoleModel, tenantId, {})
    .sort({ name: 1 })
    .lean()
    .exec();

  const rolesWithCounts = await Promise.all(
    roles.map(async (role) => {
      const count = await getUserCountForRole(
        tenantId,
        (role._id as { toString(): string }).toString(),
      );
      return serializeRole(role as Parameters<typeof serializeRole>[0], count);
    }),
  );

  return { roles: rolesWithCounts };
}

export async function updateRole(
  input: unknown,
  tenantId: string,
  roleId: string,
): Promise<UpdateRoleResult> {
  const payload = validateUpdateRoleInput(input);

  const role = await RoleModel.findOne({ _id: roleId, tenantId }).exec();
  if (!role) {
    throw new AppError(404, NOT_FOUND, "Role not found");
  }

  const update: Record<string, unknown> = {};

  if (payload.name !== undefined) {
    const normalizedName = payload.name.trim().toLowerCase();

    const duplicate = await RoleModel.findOne({
      _id: { $ne: roleId },
      tenantId,
      normalizedName,
    }).exec();

    if (duplicate) {
      throw new AppError(
        409,
        VALIDATION_ERROR,
        "A role with this name already exists in your tenant",
      );
    }

    update.name = payload.name.trim();
    update.normalizedName = normalizedName;
  }

  if (payload.baseRole !== undefined) {
    update.baseRole = payload.baseRole;
  }

  const updated = await RoleModel.findOneAndUpdate(
    { _id: roleId, tenantId },
    { $set: update },
    { returnDocument: "after" },
  ).exec();

  if (!updated) {
    throw new AppError(404, NOT_FOUND, "Role not found");
  }

  if (payload.baseRole !== undefined && payload.baseRole !== role.baseRole) {
    await UserModel.updateMany(
      { tenantId, customRoleId: roleId },
      { $set: { role: payload.baseRole } },
    ).exec();
  }

  const userCount = await getUserCountForRole(tenantId, roleId);

  return {
    role: serializeRole(updated.toObject(), userCount),
  };
}

export async function deleteRole(
  tenantId: string,
  roleId: string,
): Promise<{ success: boolean }> {
  const role = await RoleModel.findOne({ _id: roleId, tenantId }).exec();
  if (!role) {
    throw new AppError(404, NOT_FOUND, "Role not found");
  }

  const assignedCount = await getUserCountForRole(tenantId, roleId);
  if (assignedCount > 0) {
    throw new AppError(
      409,
      VALIDATION_ERROR,
      `Cannot delete role: ${assignedCount} user(s) are currently assigned this role`,
    );
  }

  await RoleModel.deleteOne({ _id: roleId }).exec();

  return { success: true };
}
