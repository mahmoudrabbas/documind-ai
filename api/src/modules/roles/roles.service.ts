import { AppError } from "../../common/errors/AppError.js";
import mongoose from "mongoose";
import { DUPLICATE_ROLE_NAME, MALFORMED_OBJECT_ID, NOT_FOUND, ROLE_IN_USE, STALE_ROLE_VERSION } from "../../common/errors/errorCodes.js";
import RoleModel, { type RoleDocument } from "../../db/models/role.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { tenantScopedFind } from "../../db/repositories/tenantScopedRepository.js";
import { validateCreateRoleInput, validateUpdateRoleInput } from "./roles.validator.js";
import type { CreateRoleResult, ListRolesResult, RolePublicView, UpdateRoleResult } from "./roles.types.js";

type RoleRecord = Pick<RoleDocument, "tenantId" | "name" | "baseRole" | "grants" | "contractVersion" | "status" | "version" | "createdBy" | "updatedBy" | "migrationState" | "migrationReason" | "createdAt" | "updatedAt"> & { _id: { toString(): string } };

function serializeRole(doc: RoleRecord, userCount = 0): RolePublicView {
  return {
    id: doc._id.toString(), tenantId: doc.tenantId.toString(), name: doc.name,
    baseRole: doc.baseRole, grants: Array.isArray(doc.grants) ? [...doc.grants] : [], contractVersion: doc.contractVersion ?? 0,
    status: doc.status === "active" ? "active" : "archived", version: Number.isInteger(doc.version) ? doc.version : 0,
    createdBy: doc.createdBy?.toString() ?? null, updatedBy: doc.updatedBy?.toString() ?? null,
    migrationState: doc.migrationState ?? "quarantined", migrationReason: doc.migrationReason,
    userCount, createdAt: safeDate(doc.createdAt), updatedAt: safeDate(doc.updatedAt),
  };
}

async function getUserCountForRole(tenantId: string, roleId: string) {
  return UserModel.countDocuments({ tenantId, customRoleId: roleId }).exec();
}

export async function createRole(input: unknown, tenantId: string, actorId: string): Promise<CreateRoleResult> {
  assertObjectId(tenantId);
  assertObjectId(actorId);
  const payload = validateCreateRoleInput(input);
  await assertSameTenantActor(tenantId, actorId);
  const normalizedName = payload.name.trim().toLowerCase();
  if (await RoleModel.exists({ tenantId, normalizedName })) throw duplicateNameError();
  try {
    const role = await RoleModel.create({ ...payload, tenantId, name: payload.name.trim(), normalizedName, createdBy: actorId, updatedBy: actorId });
    return { role: serializeRole(role.toObject() as RoleRecord) };
  } catch (error) {
    if (isDuplicateKeyError(error)) throw duplicateNameError();
    throw error;
  }
}

export async function listRoles(tenantId: string): Promise<ListRolesResult> {
  const roles = await tenantScopedFind(RoleModel, tenantId, {}).sort({ name: 1 }).lean().exec();
  return { roles: await Promise.all(roles.map(async (role) => serializeRole(role as unknown as RoleRecord, await getUserCountForRole(tenantId, role._id.toString())))) };
}

export async function updateRole(input: unknown, tenantId: string, roleId: string, actorId: string): Promise<UpdateRoleResult> {
  assertObjectId(tenantId);
  assertObjectId(roleId);
  assertObjectId(actorId);
  const payload = validateUpdateRoleInput(input);
  await assertSameTenantActor(tenantId, actorId);
  let result: UpdateRoleResult | undefined;
  try {
    await withTenantRoleTransaction(tenantId, async (session) => {
      const role = await RoleModel.findOne({ _id: roleId, tenantId }).session(session).exec();
      if (!role) throw new AppError(404, NOT_FOUND, "Role not found");
      if (payload.version !== role.version) throw staleRoleError();

      const userCount = await UserModel.countDocuments({ tenantId, customRoleId: roleId }).session(session).exec();
      if (payload.baseRole !== undefined && payload.baseRole !== role.baseRole && userCount > 0) {
        throw new AppError(409, ROLE_IN_USE, "Role base cannot change while the role is assigned");
      }
      if (payload.name !== undefined) {
        role.name = payload.name.trim();
        role.normalizedName = payload.name.trim().toLowerCase();
      }
      if (payload.baseRole !== undefined) role.baseRole = payload.baseRole;
      if (payload.grants !== undefined) role.grants = payload.grants;
      if (payload.status !== undefined) role.status = payload.status;
      role.updatedBy = new mongoose.Types.ObjectId(actorId);
      role.version += 1;
      await role.save({ session });
      result = { role: serializeRole(role.toObject() as RoleRecord, userCount) };
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw duplicateNameError();
    if (error instanceof mongoose.Error.VersionError) throw staleRoleError();
    throw error;
  }
  if (!result) throw staleRoleError();
  return result;
}

export async function deleteRole(tenantId: string, roleId: string, expectedVersion: number): Promise<{ success: boolean }> {
  assertObjectId(tenantId);
  assertObjectId(roleId);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw staleRoleError();
  await withTenantRoleTransaction(tenantId, async (session) => {
    const role = await RoleModel.findOne({ _id: roleId, tenantId }).session(session).exec();
    if (!role) throw new AppError(404, NOT_FOUND, "Role not found");
    if (role.version !== expectedVersion) throw staleRoleError();
    if (await UserModel.exists({ tenantId, customRoleId: roleId }).session(session)) {
      throw new AppError(409, ROLE_IN_USE, "Role is assigned and cannot be deleted");
    }
    const deleted = await RoleModel.deleteOne({ _id: roleId, tenantId, version: expectedVersion }).session(session).exec();
    if (deleted.deletedCount !== 1) throw staleRoleError();
  });
  return { success: true };
}

function duplicateNameError() { return new AppError(409, DUPLICATE_ROLE_NAME, "A role with this name already exists in your tenant"); }
function staleRoleError() { return new AppError(409, STALE_ROLE_VERSION, "Role was modified by another request"); }
function isDuplicateKeyError(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000); }
function safeDate(value: unknown) { return value instanceof Date ? value.toISOString() : new Date(0).toISOString(); }

function assertObjectId(value: string) {
  if (!mongoose.isObjectIdOrHexString(value)) throw new AppError(400, MALFORMED_OBJECT_ID, "Malformed identifier");
}

async function assertSameTenantActor(tenantId: string, actorId: string) {
  if (!await UserModel.exists({ _id: actorId, tenantId })) {
    throw new AppError(403, "INVALID_PROVENANCE", "Role actor is not valid for this tenant");
  }
}

export async function withTenantRoleTransaction<T>(
  tenantId: string,
  operation: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  let result: T | undefined;
  let completed = false;
  try {
    await session.withTransaction(async () => {
      const locked = await TenantModel.updateOne(
        { _id: tenantId },
        { $inc: { roleGuardVersion: 1 } },
        { session },
      ).exec();
      if (locked.matchedCount !== 1) throw new AppError(404, NOT_FOUND, "Tenant not found");
      result = await operation(session);
      completed = true;
    });
    if (!completed) throw new Error("Role transaction did not complete");
    return result as T;
  } finally {
    await session.endSession();
  }
}
