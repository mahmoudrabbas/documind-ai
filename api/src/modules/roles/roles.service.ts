import mongoose from "mongoose";
import type { BaseRole } from "../../common/auth/baseRoles.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  DUPLICATE_ROLE_NAME,
  MALFORMED_OBJECT_ID,
  NOT_FOUND,
  PERMISSION_REQUIRED,
  ROLE_IN_USE,
  ROLE_NOT_ASSIGNABLE,
  ROLE_VERSION_CONFLICT,
  STALE_ROLE_VERSION,
} from "../../common/errors/errorCodes.js";
import { logger } from "../../common/logger/logger.js";
import {
  requireAuthenticatedAuditActor,
  type AuthenticatedAuditActor,
} from "../../common/observability/auditActor.js";
import { getAuditWriter, getMetricRecorder } from "../../common/observability/index.js";
import RoleModel, { normalizeRoleName, type RoleDocument } from "../../db/models/role.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { tenantScopedFind } from "../../db/repositories/tenantScopedRepository.js";
import { PERMISSION_CONTRACT_VERSION, Permission } from "../permissions/permissions.catalog.js";
import { assertDelegableGrants, authorizePermission } from "../permissions/permissions.authorization.js";
import { normalizeRoleGrants } from "../permissions/permissions.grants.js";
import {
  validateAssignRoleInput,
  validateChangeRoleStatusInput,
  validateCloneRoleInput,
  validateCreateRoleInput,
  validateMigrateRoleUsersInput,
  validateRemoveRoleAssignmentInput,
  validateUpdateRoleInput,
} from "./roles.validator.js";
import type {
  CreateRoleResult,
  ListRolesResult,
  RoleAssignmentResult,
  RoleMigrationResult,
  RolePublicView,
  RoleUsageResult,
  UpdateRoleResult,
} from "./roles.types.js";

type RoleRecord = Pick<RoleDocument, "tenantId" | "name" | "baseRole" | "grants" | "contractVersion" | "status" | "version" | "createdBy" | "updatedBy" | "migrationState" | "migrationReason" | "createdAt" | "updatedAt"> & { _id: { toString(): string } };
export interface RoleOperationContext { tenantId: string; actorId: string; actorEmail?: string; actorRole?: BaseRole; traceId?: string; requestId?: string }
type ResolvedRoleOperationContext = AuthenticatedAuditActor & Pick<RoleOperationContext, "traceId" | "requestId">;

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

export async function createRole(input: unknown, contextOrTenant: RoleOperationContext | string, actorId?: string): Promise<CreateRoleResult> {
  const context = await resolveRoleOperationContext(normalizeContext(contextOrTenant, actorId));
  await authorizePermission(context, Permission.ROLES_CREATE);
  let payload: ReturnType<typeof validateCreateRoleInput>;
  try { payload = validateCreateRoleInput(input); } catch (error) {
    await auditRejectedGrant(context, undefined, error);
    throw error;
  }
  const normalizedName = normalizeRoleName(payload.name);
  let result: CreateRoleResult | undefined;
  try {
    await withTenantRoleTransaction(context.tenantId, async (session) => {
      await authorizePermission(context, Permission.ROLES_CREATE);
      await auditEscalationFailure(context, undefined, () => assertDelegableGrants(context, payload.grants));
      if (await RoleModel.exists({ tenantId: context.tenantId, normalizedName }).session(session)) throw duplicateNameError();
      const [role] = await RoleModel.create([{ ...payload, tenantId: context.tenantId, name: payload.name.trim(), normalizedName, createdBy: context.actorId, updatedBy: context.actorId }], { session });
      result = { role: serializeRole(role.toObject() as RoleRecord) };
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw duplicateNameError();
    throw error;
  }
  if (!result) throw roleVersionError();
  await audit(context, "ROLE_CREATED", result.role.id, { baseRole: result.role.baseRole, permissions: result.role.grants.map((grant) => grant.permission) });
  return result;
}

export async function listRoles(contextOrTenant: RoleOperationContext | string, actorId?: string): Promise<ListRolesResult> {
  const context = await resolveRoleOperationContext(normalizeContext(contextOrTenant, actorId));
  await authorizePermission(context, Permission.ROLES_READ);
  const roles = await tenantScopedFind(RoleModel, context.tenantId, {}).sort({ name: 1 }).lean().exec();
  const counts = await UserModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { tenantId: new mongoose.Types.ObjectId(context.tenantId), customRoleId: { $ne: null } } },
    { $group: { _id: "$customRoleId", count: { $sum: 1 } } },
  ]);
  const byRole = new Map(counts.map((item) => [item._id.toString(), item.count]));
  return { roles: roles.map((role) => serializeRole(role as unknown as RoleRecord, byRole.get(role._id.toString()) ?? 0)) };
}

export async function getRole(inputContext: RoleOperationContext, roleId: string): Promise<{ role: RolePublicView }> {
  const context = await resolveRoleOperationContext(inputContext);
  assertObjectId(roleId);
  await authorizePermission(context, Permission.ROLES_READ);
  const role = await RoleModel.findOne({ _id: roleId, tenantId: context.tenantId }).lean().exec();
  if (!role) {
    await audit(context, "ROLE_ACCESS_DENIED", roleId, { reason: "ROLE_NOT_FOUND_OR_TENANT_MISMATCH" }, "DENIED");
    throw new AppError(404, NOT_FOUND, "Role not found");
  }
  const count = await UserModel.countDocuments({ tenantId: context.tenantId, customRoleId: roleId });
  return { role: serializeRole(role as unknown as RoleRecord, count) };
}

export async function getRoleUsage(context: RoleOperationContext, roleId: string): Promise<RoleUsageResult> {
  const { role } = await getRole(context, roleId);
  return { roleId: role.id, assignedUserCount: role.userCount };
}

export async function updateRole(
  input: unknown,
  contextOrTenant: RoleOperationContext | string,
  roleId: string,
  actorId?: string,
  versionPolicy: "legacy" | "phase2" = "legacy",
): Promise<UpdateRoleResult> {
  const context = await resolveRoleOperationContext(normalizeContext(contextOrTenant, actorId));
  assertObjectId(roleId);
  await authorizePermission(context, Permission.ROLES_UPDATE);
  let payload: ReturnType<typeof validateUpdateRoleInput>;
  try { payload = validateUpdateRoleInput(input); } catch (error) {
    await auditRejectedGrant(context, roleId, error);
    throw error;
  }
  let result: UpdateRoleResult | undefined;
  let auditAction: "ROLE_UPDATED" | "ROLE_ARCHIVED" | "ROLE_REACTIVATED" = "ROLE_UPDATED";
  let auditChanges: Record<string, unknown> = {};
  try {
    await withTenantRoleTransaction(context.tenantId, async (session) => {
      await authorizePermission(context, Permission.ROLES_UPDATE);
      if (payload.grants) await auditEscalationFailure(context, roleId, () => assertDelegableGrants(context, payload.grants!));
      const role = await RoleModel.findOne({ _id: roleId, tenantId: context.tenantId }).session(session).exec();
      if (!role) throw new AppError(404, NOT_FOUND, "Role not found");
      if (payload.version !== role.version) throw versionError(versionPolicy);
      const beforePermissions = role.grants.map((grant) => grant.permission);
      const beforeStatus = role.status;
      const userCount = await UserModel.countDocuments({ tenantId: context.tenantId, customRoleId: roleId }).session(session);
      if (payload.baseRole !== undefined && payload.baseRole !== role.baseRole && userCount > 0) throw new AppError(409, ROLE_IN_USE, "Role base cannot change while the role is assigned");
      if (payload.name !== undefined) { role.name = payload.name.trim(); role.normalizedName = normalizeRoleName(payload.name); }
      if (payload.baseRole !== undefined) role.baseRole = payload.baseRole;
      if (payload.grants !== undefined) role.grants = payload.grants;
      if (payload.status === "active" && role.migrationState !== "complete") throw new AppError(409, ROLE_NOT_ASSIGNABLE, "Quarantined roles cannot be reactivated");
      if (payload.status !== undefined) role.status = payload.status;
      role.updatedBy = new mongoose.Types.ObjectId(context.actorId);
      role.version += 1;
      await role.save({ session });
      result = { role: serializeRole(role.toObject() as RoleRecord, userCount) };
      auditAction = payload.status === "archived" && beforeStatus !== "archived" ? "ROLE_ARCHIVED" : payload.status === "active" && beforeStatus !== "active" ? "ROLE_REACTIVATED" : "ROLE_UPDATED";
      auditChanges = {
        permissionsBefore: beforePermissions,
        permissionsAfter: role.grants.map((grant) => grant.permission),
        version: role.version,
      };
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw duplicateNameError();
    if (error instanceof mongoose.Error.VersionError) throw versionError(versionPolicy);
    throw error;
  }
  if (!result) throw versionError(versionPolicy);
  await audit(context, auditAction, roleId, auditChanges);
  return result;
}

export async function cloneRole(input: unknown, inputContext: RoleOperationContext, roleId: string): Promise<CreateRoleResult> {
  const context = await resolveRoleOperationContext(inputContext);
  assertObjectId(roleId);
  await authorizePermission(context, Permission.ROLES_CREATE);
  const payload = validateCloneRoleInput(input);
  const normalizedName = normalizeRoleName(payload.name);
  let result: CreateRoleResult | undefined;
  try {
    await withTenantRoleTransaction(context.tenantId, async (session) => {
      await authorizePermission(context, Permission.ROLES_CREATE);
      const source = await RoleModel.findOne({ _id: roleId, tenantId: context.tenantId }).session(session).exec();
      if (!source) throw new AppError(404, NOT_FOUND, "Role not found");
      if (source.version !== payload.version) throw roleVersionError();
      await assertRoleIntegrity(source, session, true);
      await auditEscalationFailure(context, roleId, () => assertDelegableGrants(context, source.grants));
      if (await RoleModel.exists({ tenantId: context.tenantId, normalizedName }).session(session)) throw duplicateNameError();
      const [created] = await RoleModel.create([{
        tenantId: context.tenantId,
        name: payload.name.trim(),
        normalizedName,
        baseRole: source.baseRole,
        grants: source.grants,
        createdBy: context.actorId,
        updatedBy: context.actorId,
      }], { session });
      result = { role: serializeRole(created.toObject() as RoleRecord) };
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw duplicateNameError();
    throw error;
  }
  if (!result) throw roleVersionError();
  await audit(context, "ROLE_CLONED", result.role.id, { sourceRoleId: roleId, sourceVersion: payload.version });
  return result;
}

export async function changeRoleStatus(input: unknown, context: RoleOperationContext, roleId: string, status: "active" | "archived"): Promise<UpdateRoleResult> {
  const payload = validateChangeRoleStatusInput(input);
  return updateRole({ status, version: payload.version }, context, roleId, undefined, "phase2");
}

export async function deleteRole(contextOrTenant: RoleOperationContext | string, roleId: string, expectedVersion: number, actorId?: string): Promise<{ success: boolean }> {
  const context = await resolveRoleOperationContext(normalizeContext(contextOrTenant, actorId));
  assertObjectId(roleId);
  await authorizePermission(context, Permission.ROLES_DELETE);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw legacyRoleVersionError();
  await withTenantRoleTransaction(context.tenantId, async (session) => {
    await authorizePermission(context, Permission.ROLES_DELETE);
    const role = await RoleModel.findOne({ _id: roleId, tenantId: context.tenantId }).session(session).exec();
    if (!role) throw new AppError(404, NOT_FOUND, "Role not found");
    if (role.version !== expectedVersion) throw legacyRoleVersionError();
    if (await UserModel.exists({ tenantId: context.tenantId, customRoleId: roleId }).session(session)) throw new AppError(409, ROLE_IN_USE, "Role is assigned and cannot be deleted");
    const deleted = await RoleModel.deleteOne({ _id: roleId, tenantId: context.tenantId, version: expectedVersion }).session(session);
    if (deleted.deletedCount !== 1) throw legacyRoleVersionError();
  });
  await audit(context, "ROLE_DELETED", roleId, { version: expectedVersion });
  return { success: true };
}

export async function assignRole(input: unknown, inputContext: RoleOperationContext, roleId: string): Promise<RoleAssignmentResult> {
  const context = await resolveRoleOperationContext(inputContext);
  assertObjectId(roleId);
  await authorizePermission(context, Permission.USERS_ASSIGN_ROLE);
  const payload = validateAssignRoleInput(input);
  let changed = false;
  await withTenantRoleTransaction(context.tenantId, async (session) => {
    await authorizePermission(context, Permission.USERS_ASSIGN_ROLE);
    changed = await assignRoleInSession(context, payload.userId, roleId, payload.roleVersion, session);
  });
  if (changed) {
    await audit(context, "ROLE_ASSIGNED", roleId, { targetUserId: payload.userId, changed: true });
  }
  return { userId: payload.userId, roleId, changed };
}

export async function removeRoleAssignment(input: unknown, inputContext: RoleOperationContext, roleId: string): Promise<RoleAssignmentResult> {
  const context = await resolveRoleOperationContext(inputContext);
  assertObjectId(roleId);
  await authorizePermission(context, Permission.USERS_ASSIGN_ROLE);
  const payload = validateRemoveRoleAssignmentInput(input);
  let changed = false;
  await withTenantRoleTransaction(context.tenantId, async (session) => {
    await authorizePermission(context, Permission.USERS_ASSIGN_ROLE);
    const role = await RoleModel.findOne({ _id: roleId, tenantId: context.tenantId }).session(session).exec();
    if (!role) throw new AppError(404, NOT_FOUND, "Role not found");
    if (role.version !== payload.roleVersion) throw roleVersionError();
    const target = await UserModel.findOne({ _id: payload.userId, tenantId: context.tenantId }).session(session).exec();
    if (!target) throw new AppError(404, NOT_FOUND, "User not found");
    if (target.role === "SUPER_ADMIN") throw new AppError(409, ROLE_NOT_ASSIGNABLE, "Super Admin assignments cannot be changed through tenant roles");
    if (target.customRoleId?.toString() !== roleId) return;
    target.customRoleId = null;
    await target.save({ session });
    changed = true;
  });
  if (changed) {
    await audit(context, "ROLE_ASSIGNMENT_REMOVED", roleId, { targetUserId: payload.userId, changed: true });
  }
  return { userId: payload.userId, roleId: null, changed };
}

export async function migrateRoleUsers(input: unknown, inputContext: RoleOperationContext, sourceRoleId: string): Promise<RoleMigrationResult> {
  const context = await resolveRoleOperationContext(inputContext);
  assertObjectId(sourceRoleId);
  await authorizePermission(context, Permission.USERS_ASSIGN_ROLE);
  const payload = validateMigrateRoleUsersInput(input);
  if (sourceRoleId === payload.destinationRoleId) throw new AppError(409, ROLE_NOT_ASSIGNABLE, "Source and destination roles must differ");
  let affected = 0;
  let skipped = 0;
  await withTenantRoleTransaction(context.tenantId, async (session) => {
    await authorizePermission(context, Permission.USERS_ASSIGN_ROLE);
    const [source, destination] = await Promise.all([
      RoleModel.findOne({ _id: sourceRoleId, tenantId: context.tenantId }).session(session).exec(),
      RoleModel.findOne({ _id: payload.destinationRoleId, tenantId: context.tenantId }).session(session).exec(),
    ]);
    if (!source || !destination) throw new AppError(404, NOT_FOUND, "Role not found");
    if (source.version !== payload.sourceVersion || destination.version !== payload.destinationVersion) throw roleVersionError();
    await assertRoleIntegrity(destination, session, true);
    if (source.baseRole !== destination.baseRole) throw new AppError(409, ROLE_NOT_ASSIGNABLE, "Destination role is not assignable");
    await auditEscalationFailure(context, destination.id, () => assertDelegableGrants(context, destination.grants));
    const assigned = await UserModel.countDocuments({ tenantId: context.tenantId, customRoleId: sourceRoleId }).session(session);
    const eligible = await UserModel.countDocuments({ tenantId: context.tenantId, customRoleId: sourceRoleId, role: source.baseRole }).session(session);
    skipped = assigned - eligible;
    const result = await UserModel.updateMany(
      { tenantId: context.tenantId, customRoleId: sourceRoleId, role: source.baseRole },
      { $set: { customRoleId: destination._id } },
      { session, runValidators: true },
    );
    affected = result.modifiedCount;
  });
  const result = { sourceRoleId, destinationRoleId: payload.destinationRoleId, affected, skipped, conflicted: 0 };
  await audit(context, "ROLE_USERS_MIGRATED", sourceRoleId, result);
  return result;
}

async function assignRoleInSession(
  context: ResolvedRoleOperationContext,
  targetUserId: string,
  roleId: string,
  expectedVersion: number,
  session: mongoose.ClientSession,
): Promise<boolean> {
  await authorizePermission(context, Permission.USERS_ASSIGN_ROLE);
  const [role, target] = await Promise.all([
    RoleModel.findOne({ _id: roleId, tenantId: context.tenantId }).session(session).exec(),
    UserModel.findOne({ _id: targetUserId, tenantId: context.tenantId }).session(session).exec(),
  ]);
  if (!role) throw new AppError(404, NOT_FOUND, "Role not found");
  if (role.version !== expectedVersion) throw roleVersionError();
  await assertRoleIntegrity(role, session, true);
  if (!target) throw new AppError(404, NOT_FOUND, "User not found");
  if (target.role === "SUPER_ADMIN" || role.baseRole !== target.role) {
    throw new AppError(409, ROLE_NOT_ASSIGNABLE, "Custom role is not assignable to this base role");
  }
  await auditEscalationFailure(context, roleId, () => assertDelegableGrants(context, role.grants));
  if (target.customRoleId?.toString() === roleId) return false;
  target.customRoleId = role._id;
  await target.save({ session });
  return true;
}

async function assertRoleIntegrity(
  role: RoleDocument,
  session: mongoose.ClientSession,
  requireActive: boolean,
): Promise<void> {
  if ((requireActive && role.status !== "active") ||
      role.migrationState !== "complete" ||
      role.contractVersion !== PERMISSION_CONTRACT_VERSION) {
    throw new AppError(409, ROLE_NOT_ASSIGNABLE, "Role is not assignable");
  }
  try {
    const rawGrants = role.grants.map((grant) =>
      typeof (grant as unknown as { toObject?: unknown }).toObject === "function"
        ? (grant as unknown as { toObject(): unknown }).toObject()
        : grant);
    normalizeRoleGrants(rawGrants, { requireCanonical: true });
  } catch {
    throw new AppError(409, ROLE_NOT_ASSIGNABLE, "Role grants are invalid");
  }
  const provenance = [role.createdBy, role.updatedBy];
  if (provenance.some((actor) => !actor || !mongoose.isObjectIdOrHexString(actor))) {
    throw new AppError(409, ROLE_NOT_ASSIGNABLE, "Role provenance is invalid");
  }
  const actorIds = [...new Set(provenance.map((actor) => actor!.toString()))];
  const count = await UserModel.countDocuments({
    _id: { $in: actorIds },
    tenantId: role.tenantId,
  }).session(session);
  if (count !== actorIds.length) {
    throw new AppError(409, ROLE_NOT_ASSIGNABLE, "Role provenance is invalid");
  }
}

async function auditEscalationFailure(context: ResolvedRoleOperationContext, roleId: string | undefined, operation: () => Promise<void>): Promise<void> {
  try { await operation(); } catch (error) {
    await audit(context, "ROLE_ESCALATION_BLOCKED", roleId ?? "new", { reason: error instanceof AppError ? error.code : "INVALID_GRANT" }, "DENIED");
    throw error;
  }
}

async function auditRejectedGrant(context: ResolvedRoleOperationContext, roleId: string | undefined, error: unknown): Promise<void> {
  if (error instanceof AppError && ["PRIVILEGE_ESCALATION", "UNKNOWN_PERMISSION", "INVALID_PERMISSION"].includes(error.code)) {
    await audit(context, "ROLE_ESCALATION_BLOCKED", roleId ?? "new", { reason: error.code }, "DENIED");
  }
}

async function audit(context: ResolvedRoleOperationContext, action: import("../../common/observability/auditEvents.js").AuditAction, resourceId: string, changes: Record<string, unknown>, outcome: "SUCCESS" | "DENIED" = "SUCCESS") {
  const written = await getAuditWriter().write({
    tenantId: context.tenantId,
    actorId: context.actorId,
    actorEmail: context.actorEmail,
    actorRole: context.actorRole,
    actorKind: context.actorKind,
    resourceType: "Role", resourceId, action, outcome, changes,
    metadata: { traceId: context.traceId, requestId: context.requestId },
  });
  if (!written) {
    getMetricRecorder().increment("role_operation_audit_failure", { action, outcome });
    logger.error({
      action,
      tenantId: context.tenantId,
      actorId: context.actorId,
      resourceId,
      traceId: context.traceId,
      requestId: context.requestId,
    }, "Role operation audit persistence failed");
  }
}

function normalizeContext(value: RoleOperationContext | string, actorId?: string): RoleOperationContext {
  if (typeof value !== "string") {
    return value;
  }

  if (!actorId) {
    throw new AppError(403, PERMISSION_REQUIRED, "Permission denied");
  }

  return {
    tenantId: value,
    actorId,
  };
}
async function resolveRoleOperationContext(context: RoleOperationContext): Promise<ResolvedRoleOperationContext> {
  assertObjectId(context.tenantId);
  assertObjectId(context.actorId);
  const actor = await UserModel.findOne({
    _id: context.actorId,
    tenantId: context.tenantId,
  })
    .select("email role")
    .lean()
    .exec();
  if (!actor) {
    throw new AppError(403, PERMISSION_REQUIRED, "Permission denied");
  }

  return {
    ...requireAuthenticatedAuditActor({
      tenantId: context.tenantId,
      actorId: context.actorId,
      actorEmail: actor.email,
      actorRole: actor.role,
    }),
    traceId: context.traceId,
    requestId: context.requestId,
  };
}
function duplicateNameError() { return new AppError(409, DUPLICATE_ROLE_NAME, "A role with this name already exists in your tenant"); }
function roleVersionError() { return new AppError(409, ROLE_VERSION_CONFLICT, "Role was modified by another request"); }
function legacyRoleVersionError() { return new AppError(409, STALE_ROLE_VERSION, "Role was modified by another request"); }
function versionError(policy: "legacy" | "phase2") {
  return policy === "legacy" ? legacyRoleVersionError() : roleVersionError();
}
function isDuplicateKeyError(error: unknown) { return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000); }
function safeDate(value: unknown) { return value instanceof Date ? value.toISOString() : new Date(0).toISOString(); }
function assertObjectId(value: string) { if (!mongoose.isObjectIdOrHexString(value)) throw new AppError(400, MALFORMED_OBJECT_ID, "Malformed identifier"); }

export async function withTenantRoleTransaction<T>(tenantId: string, operation: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  let result: T | undefined;
  let completed = false;
  try {
    await session.withTransaction(async () => {
      const locked = await TenantModel.updateOne({ _id: tenantId }, { $inc: { roleGuardVersion: 1 } }, { session });
      if (locked.matchedCount !== 1) throw new AppError(404, NOT_FOUND, "Tenant not found");
      result = await operation(session);
      await transactionAttemptHook?.();
      completed = true;
    });
    if (!completed) throw new Error("Role transaction did not complete");
    return result as T;
  } finally { await session.endSession(); }
}

let transactionAttemptHook: (() => Promise<void> | void) | null = null;
export function setRoleTransactionAttemptHookForTests(
  hook: (() => Promise<void> | void) | null,
): void {
  transactionAttemptHook = hook;
}
