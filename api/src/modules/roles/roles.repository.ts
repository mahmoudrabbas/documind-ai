import RoleModel from "../../db/models/role.model.js";
import type { RoleDocument } from "../../db/models/role.model.js";
import {
  tenantScopedCreate,
  tenantScopedFind,
  tenantScopedFindOne,
  tenantScopedDeleteOne,
} from "../../db/repositories/tenantScopedRepository.js";

export async function findRoleByTenantAndId(
  tenantId: string,
  roleId: string,
): Promise<RoleDocument | null> {
  return tenantScopedFindOne(RoleModel, tenantId, {
    _id: roleId,
  });
}

export async function findRoleByTenantAndNormalizedName(
  tenantId: string,
  normalizedName: string,
): Promise<RoleDocument | null> {
  return tenantScopedFindOne(RoleModel, tenantId, {
    normalizedName,
  });
}

export async function findDuplicateRoleName(
  tenantId: string,
  normalizedName: string,
  excludeRoleId: string,
): Promise<RoleDocument | null> {
  return tenantScopedFindOne(RoleModel, tenantId, {
    _id: { $ne: excludeRoleId },
    normalizedName,
  });
}

export async function findAllRolesByTenant(
  tenantId: string,
): Promise<RoleDocument[]> {
  return tenantScopedFind(RoleModel, tenantId, {})
    .sort({ name: 1 })
    .lean()
    .exec() as Promise<RoleDocument[]>;
}

export async function createRoleDocument(
  tenantId: string,
  data: {
    name: string;
    normalizedName: string;
    baseRole: string;
    permissions?: string[];
    scopes?: {
      selfOnly: boolean;
      departmentIds: string[];
      categories: string[];
    };
    status?: string;
    version?: number;
    createdBy?: string | null;
  },
): Promise<RoleDocument> {
  return tenantScopedCreate(RoleModel, {
    tenantId,
    ...data,
    status: data.status ?? "active",
    version: data.version ?? 1,
  } as Parameters<typeof tenantScopedCreate>[1]);
}

export async function updateRoleById(
  tenantId: string,
  roleId: string,
  update: Record<string, unknown>,
): Promise<RoleDocument | null> {
  return RoleModel.findOneAndUpdate(
    { _id: roleId, tenantId },
    { $set: update },
    { returnDocument: "after" },
  ).exec();
}

export async function archiveRoleById(
  tenantId: string,
  roleId: string,
): Promise<RoleDocument | null> {
  return RoleModel.findOneAndUpdate(
    { _id: roleId, tenantId, status: { $ne: "archived" } },
    { $set: { status: "archived" } },
    { returnDocument: "after" },
  ).exec();
}

export async function deleteRoleDocument(
  tenantId: string,
  roleId: string,
): Promise<boolean> {
  const result = await tenantScopedDeleteOne(RoleModel, tenantId, {
    _id: roleId,
  });
  return result.deletedCount > 0;
}
