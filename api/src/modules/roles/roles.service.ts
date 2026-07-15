import { AppError } from "../../common/errors/AppError.js";
import {
  NOT_FOUND,
  VALIDATION_ERROR,
  PRIVILEGE_ESCALATION,
  ROLE_IN_USE,
} from "../../common/errors/errorCodes.js";
import UserModel from "../../db/models/user.model.js";
import {
  isSuperAdminOnlyPermission,
  VALID_PERMISSIONS,
} from "../permissions/permissions.catalog.js";
import { getPermissionEvaluator } from "../permissions/permissions.evaluator.js";
import { createAuditLog } from "../audit/audit.repository.js";
import {
  findRoleByTenantAndId,
  findRoleByTenantAndNormalizedName,
  findDuplicateRoleName,
  findAllRolesByTenant,
  createRoleDocument,
  updateRoleById,
  archiveRoleById,
  deleteRoleDocument,
} from "./roles.repository.js";
import {
  validateCreateRoleInput,
  validateUpdateRoleInput,
  validateCloneRoleInput,
} from "./roles.validator.js";
import type {
  CreateRoleResult,
  ListRolesResult,
  RolePublicView,
  UpdateRoleResult,
  CloneRoleResult,
  ArchiveRoleResult,
} from "./roles.types.js";
import type { PermissionScopes } from "../permissions/permissions.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeRole(doc: any, userCount = 0): RolePublicView {
  return {
    id: doc._id?.toString?.() ?? "",
    tenantId: doc.tenantId?.toString?.() ?? "",
    name: (doc.name as string) ?? "",
    baseRole: (doc.baseRole as string) ?? "",
    permissions: (doc.permissions as string[]) ?? [],
    scopes: {
      selfOnly:
        (doc.scopes as PermissionScopes)?.selfOnly ?? false,
      departmentIds:
        (doc.scopes as PermissionScopes)?.departmentIds ?? [],
      categories:
        (doc.scopes as PermissionScopes)?.categories ?? [],
    },
    status: (doc.status as string) ?? "active",
    version: (doc.version as number) ?? 0,
    userCount,
    createdBy: doc.createdBy?.toString() ?? null,
    updatedBy: doc.updatedBy?.toString() ?? null,
    createdAt:
      (doc.createdAt as Date)?.toISOString() ??
      new Date().toISOString(),
    updatedAt:
      (doc.updatedAt as Date)?.toISOString() ??
      new Date().toISOString(),
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

async function assertActorCanDelegatePermissions(
  actorUserId: string,
  tenantId: string,
  permissions: string[],
): Promise<void> {
  if (permissions.length === 0) return;

  const evaluator = getPermissionEvaluator();
  const actorPermissions = await evaluator.resolve(
    actorUserId,
    tenantId,
  );

  for (const p of permissions) {
    if (!actorPermissions.permissions.has(p)) {
      throw new AppError(
        403,
        PRIVILEGE_ESCALATION,
        "Cannot grant permissions you do not yourself possess",
        { denied: p },
      );
    }
  }
}

function assertNoSuperAdminPermissions(
  permissions: string[],
): void {
  const forbidden = permissions.filter((p) =>
    isSuperAdminOnlyPermission(p),
  );

  if (forbidden.length > 0) {
    throw new AppError(
      403,
      PRIVILEGE_ESCALATION,
      `Cannot delegate platform-level permissions: ${forbidden.join(", ")}`,
    );
  }
}

function validatePermissions(
  permissions: string[],
): string[] {
  const invalid = permissions.filter(
    (p) => !VALID_PERMISSIONS.has(p),
  );

  if (invalid.length > 0) {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      `Unknown permission identifiers: ${invalid.join(", ")}`,
    );
  }

  return [...new Set(permissions)];
}

export async function createRole(
  input: unknown,
  tenantId: string,
  actorUserId: string,
): Promise<CreateRoleResult> {
  const payload = validateCreateRoleInput(input);
  const normalizedName = payload.name.trim().toLowerCase();

  const existing = await findRoleByTenantAndNormalizedName(
    tenantId,
    normalizedName,
  );

  if (existing) {
    throw new AppError(
      409,
      VALIDATION_ERROR,
      "A role with this name already exists in your tenant",
    );
  }

  const permissions = validatePermissions(
    payload.permissions ?? [],
  );

  assertNoSuperAdminPermissions(permissions);
  await assertActorCanDelegatePermissions(
    actorUserId,
    tenantId,
    permissions,
  );

  const role = await createRoleDocument(tenantId, {
    name: payload.name.trim(),
    normalizedName,
    baseRole: payload.baseRole,
    permissions,
    scopes: payload.scopes
      ? {
          selfOnly: payload.scopes.selfOnly ?? false,
          departmentIds: payload.scopes.departmentIds ?? [],
          categories: payload.scopes.categories ?? [],
        }
      : undefined,
    createdBy: actorUserId,
  });

  return {
    role: serializeRole(role.toObject()),
  };
}

export async function listRoles(
  tenantId: string,
): Promise<ListRolesResult> {
  const roles = await findAllRolesByTenant(tenantId);

  const counts = await UserModel.aggregate([
    { $match: { tenantId, customRoleId: { $exists: true, $ne: null } } },
    { $group: { _id: "$customRoleId", count: { $sum: 1 } } },
  ]).exec();

  const countMap = new Map<string, number>(
    (counts as Array<{ _id: { toString(): string }; count: number }>).map(
      (c) => [c._id.toString(), c.count],
    ),
  );

  const rolesWithCounts = roles.map((role) =>
    serializeRole(role, countMap.get(role._id.toString()) ?? 0),
  );

  return { roles: rolesWithCounts };
}

export async function getRole(
  tenantId: string,
  roleId: string,
): Promise<RolePublicView> {
  const role = await findRoleByTenantAndId(tenantId, roleId);
  if (!role) {
    throw new AppError(404, NOT_FOUND, "Role not found");
  }

  const userCount = await getUserCountForRole(
    tenantId,
    roleId,
  );
  return serializeRole(role.toObject(), userCount);
}

export async function updateRole(
  input: unknown,
  tenantId: string,
  roleId: string,
  actorUserId: string,
): Promise<UpdateRoleResult> {
  const payload = validateUpdateRoleInput(input);

  const role = await findRoleByTenantAndId(tenantId, roleId);
  if (!role) {
    throw new AppError(404, NOT_FOUND, "Role not found");
  }

  if (role.status === "archived") {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Cannot update an archived role",
    );
  }

  const update: Record<string, unknown> = {};

  if (payload.name !== undefined) {
    const normalizedName = payload.name.trim().toLowerCase();
    const duplicate = await findDuplicateRoleName(
      tenantId,
      normalizedName,
      roleId,
    );
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

  if (payload.permissions !== undefined) {
    const permissions = validatePermissions(
      payload.permissions,
    );
    assertNoSuperAdminPermissions(permissions);
    await assertActorCanDelegatePermissions(
      actorUserId,
      tenantId,
      permissions,
    );
    update.permissions = permissions;
  }

  if (payload.scopes !== undefined) {
    update.scopes = {
      selfOnly: payload.scopes.selfOnly ?? false,
      departmentIds: payload.scopes.departmentIds ?? [],
      categories: payload.scopes.categories ?? [],
    };
  }

  update.version = (role.version ?? 0) + 1;
  update.updatedBy = actorUserId;

  const updated = await updateRoleById(
    tenantId,
    roleId,
    update,
  );

  if (!updated) {
    throw new AppError(404, NOT_FOUND, "Role not found");
  }

  if (
    payload.baseRole !== undefined &&
    payload.baseRole !== role.baseRole
  ) {
    await UserModel.updateMany(
      { tenantId, customRoleId: roleId },
      { $set: { role: payload.baseRole } },
    ).exec();
  }

  if (
    payload.permissions !== undefined ||
    payload.baseRole !== undefined
  ) {
    const evaluator = getPermissionEvaluator();
    const affectedUsers = await UserModel.find({
      tenantId,
      customRoleId: roleId,
    })
      .select("_id")
      .lean()
      .exec();

    for (const user of affectedUsers) {
      evaluator.evict(
        (user as { _id: { toString(): string } })._id.toString(),
        tenantId,
      );
    }
  }

  const userCount = await getUserCountForRole(
    tenantId,
    roleId,
  );
  return {
    role: serializeRole(updated.toObject(), userCount),
  };
}

export async function deleteRole(
  tenantId: string,
  roleId: string,
): Promise<{ success: boolean }> {
  const role = await findRoleByTenantAndId(tenantId, roleId);
  if (!role) {
    throw new AppError(404, NOT_FOUND, "Role not found");
  }

  const assignedCount = await getUserCountForRole(
    tenantId,
    roleId,
  );

  if (assignedCount > 0) {
    throw new AppError(
      409,
      ROLE_IN_USE,
      `Cannot delete role: ${assignedCount} user(s) are currently assigned this role. Migrate users to another role first.`,
      { roleId, assignedCount },
    );
  }

  await deleteRoleDocument(tenantId, roleId);
  return { success: true };
}

export async function cloneRole(
  input: unknown,
  tenantId: string,
  sourceRoleId: string,
  actorUserId: string,
): Promise<CloneRoleResult> {
  const payload = validateCloneRoleInput(input);

  const source = await findRoleByTenantAndId(
    tenantId,
    sourceRoleId,
  );
  if (!source) {
    throw new AppError(404, NOT_FOUND, "Role not found");
  }

  const normalizedName = payload.name.trim().toLowerCase();
  const duplicate = await findRoleByTenantAndNormalizedName(
    tenantId,
    normalizedName,
  );
  if (duplicate) {
    throw new AppError(
      409,
      VALIDATION_ERROR,
      "A role with this name already exists in your tenant",
    );
  }

  const permissions = [
    ...((source.permissions as string[]) ?? []),
  ];

  assertNoSuperAdminPermissions(permissions);
  await assertActorCanDelegatePermissions(
    actorUserId,
    tenantId,
    permissions,
  );

  const cloned = await createRoleDocument(tenantId, {
    name: payload.name.trim(),
    normalizedName,
    baseRole: source.baseRole,
    permissions,
    scopes: source.scopes
      ? {
          selfOnly:
            (source.scopes as PermissionScopes).selfOnly ??
            false,
          departmentIds:
            (source.scopes as PermissionScopes)
              .departmentIds ?? [],
          categories:
            (source.scopes as PermissionScopes).categories ??
            [],
        }
      : undefined,
    createdBy: actorUserId,
  });

  return {
    role: serializeRole(cloned.toObject(), 0),
  };
}

export async function archiveRole(
  tenantId: string,
  roleId: string,
  actorUserId: string,
  actorEmail?: string,
  actorRole?: string,
): Promise<ArchiveRoleResult> {
  const role = await findRoleByTenantAndId(tenantId, roleId);
  if (!role) {
    throw new AppError(404, NOT_FOUND, "Role not found");
  }

  if (role.status === "archived") {
    throw new AppError(
      400,
      VALIDATION_ERROR,
      "Role is already archived",
    );
  }

  const archived = await archiveRoleById(tenantId, roleId);
  if (!archived) {
    throw new AppError(404, NOT_FOUND, "Role not found");
  }

  void createAuditLog({
    tenantId,
    userId: actorUserId,
    resourceType: "Role",
    resourceId: roleId,
    action: "ROLE_ARCHIVED",
    actorId: actorUserId,
    actorEmail: actorEmail ?? "",
    actorRole: actorRole ?? "",
    changes: {
      status: { before: "active", after: "archived" },
    },
  }).catch((err) => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[roles-archive] audit log failed", err);
    }
  });

  const userCount = await getUserCountForRole(
    tenantId,
    roleId,
  );

  return {
    role: serializeRole(archived.toObject(), userCount),
  };
}
