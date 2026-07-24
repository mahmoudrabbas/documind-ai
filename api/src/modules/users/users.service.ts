import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  EMAIL_ALREADY_EXISTS,
  LAST_ADMIN_PROTECTION,
  NOT_FOUND,
  REGISTRATION_FAILED,
  USER_UPDATE_FAILED,
  INVALID_OR_EXPIRED_VERIFICATION_TOKEN,
  PERMISSION_REQUIRED,
  SELF_ACTION_FORBIDDEN,
} from "../../common/errors/errorCodes.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { createEmailVerificationTokenForUser } from "../auth/auth.service.js";
import {
  verifyEmailVerificationToken,
  hashVerificationJti,
  USER_INVITATION_PURPOSE,
} from "../auth/emailVerificationToken.js";
import { findUserDocumentById } from "../auth/auth.repository.js";
import { revokeActiveRefreshSessionsForTenantUser } from "../auth/sessionRevocation.repository.js";
import { sendInvitationEmail } from "../auth/auth.mailer.js";
import { hashPassword } from "../auth/passwordHashing.js";
import {
  createUser,
  findTenantById,
  findUserByTenantAndId,
  findUserDocumentByTenantAndEmail,
  countUsersByTenant,
  findUsersByTenant,
} from "./users.repository.js";
import {
  requireAuthenticatedAuditActor,
  type AuthenticatedAuditActor,
} from "../../common/observability/auditActor.js";
import type {
  AuditAction,
  AuditOutcome,
} from "../../common/observability/auditEvents.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { authorizePermission } from "../permissions/permissions.authorization.js";
import { getPermissionEvaluator } from "../permissions/permissions.evaluator.js";
import {
  Permission,
  type PermissionValue,
} from "../permissions/permissions.catalog.js";
import {
  validateInviteUserInput,
  validateListUsersInput,
  validateUpdateUserInput,
  validateSetPasswordFromInviteInput,
} from "./users.validator.js";
import type {
  InviteUserResult,
  ListUsersResult,
  UpdateUserResult,
  SetPasswordFromInviteResult,
} from "./users.types.js";
import type { UserPublicView } from "../auth/auth.types.js";
import type { UserDocument } from "../../db/models/user.model.js";
import { config } from "../../config/index.js";
import type { BaseRole } from "../../common/auth/baseRoles.js";
import { isSystemPlatformTenant } from "../../common/auth/platformTenant.js";

export interface UserOperationContext {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorRole: BaseRole;
  traceId?: string;
  requestId?: string;
}

type ResolvedUserOperationContext =
  AuthenticatedAuditActor &
  Pick<UserOperationContext, "traceId" | "requestId">;

type CreatedUserRecord = {
  _id: { toString(): string };
  id?: string;
  tenantId: unknown;
  name: string;
  email: string;
  role: BaseRole;
  status: string;
  emailVerified: boolean;
  createdAt?: Date;
  customRoleId?:
    | { _id?: { toString(): string }; toString(): string; name?: string }
    | string
    | null;
};

function serializeUser(user: CreatedUserRecord): UserPublicView {
  const result: UserPublicView = {
    id: user.id ?? user._id.toString(),
    tenantId: user.tenantId?.toString() ?? "",
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
  };

  if (user.customRoleId) {
    if (typeof user.customRoleId === "object") {
      result.customRoleId =
        user.customRoleId._id?.toString() ?? user.customRoleId.toString();
      result.customRoleName = user.customRoleId.name;
    } else {
      result.customRoleId = user.customRoleId;
    }
  }

  return result;
}

function buildVerificationUrl(token: string) {
  const url = new URL("/set-password-from-invite", config.APP_FRONTEND_URL);

  url.searchParams.set("token", token);

  return url.toString();
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: number }).code === 11000,
  );
}

function assertCustomerTenantForUserManagement(tenant: {
  slug?: string;
  isSystemTenant?: boolean | null;
}) {
  if (isSystemPlatformTenant(tenant)) {
    throw new AppError(
      403,
      "PLATFORM_TENANT_FORBIDDEN",
      "Customer user management is not available for the platform tenant",
    );
  }
}

export async function inviteUser(
  input: unknown,
  inputContext: UserOperationContext,
): Promise<InviteUserResult> {
  const context = await resolveUserOperationContext(inputContext);
  await authorizeUserOperation(context, Permission.USERS_CREATE);
  const payload = validateInviteUserInput(input);
  if (payload.role === "COMPANY_ADMIN") {
    await authorizeUserOperation(context, Permission.USERS_ASSIGN_ROLE);
  }
  const tenantId = context.tenantId;

  const existingUser = await findUserDocumentByTenantAndEmail(
    tenantId,
    payload.email,
  );
  if (existingUser) {
    throw new AppError(
      409,
      EMAIL_ALREADY_EXISTS,
      "Email already exists in this tenant",
    );
  }

  const tenant = await findTenantById(tenantId);
  if (!tenant) {
    throw new AppError(404, NOT_FOUND, "Tenant not found");
  }
  assertCustomerTenantForUserManagement(tenant);

  const inviter = await findUserByTenantAndId(tenantId, context.actorId);
  const inviterName = inviter?.name ?? "Your administrator";

  const userPayload: import("../../modules/auth/auth.repository.js").UserCreateInput = {
    tenantId,
    name: payload.name.trim(),
    email: payload.email.toLowerCase().trim(),
    passwordHash: await hashPassword(randomUUID()),
    role: payload.role,
    status: "pending_email_verification",
    emailVerified: false,
    emailVerifiedAt: null,
  };

  let createdUser: UserDocument | null = null;

  try {
    createdUser = await createUser(userPayload);
    const token = await createEmailVerificationTokenForUser(createdUser, {
      purpose: USER_INVITATION_PURPOSE,
    });

    let emailDelivery: { sent: boolean; error?: string } = { sent: true };
    try {
      await sendInvitationEmail({
        to: createdUser.email,
        inviterName,
        inviterEmail: inviter?.email,
        companyName: tenant.name,
        role: createdUser.role,
        invitationUrl: buildVerificationUrl(token),
        expiryDate:
          createdUser.emailVerificationExpiresAt ??
          new Date(Date.now() + 24 * 60 * 60 * 1000),
        tenantId: tenantId.toString(),
      });
    } catch (emailError) {
      const errorMsg = emailError instanceof Error ? emailError.message : String(emailError);
      console.error("[users-invite] email enqueue failed for", createdUser.email, errorMsg);
      emailDelivery = { sent: false, error: errorMsg };
    }

    const result = {
      user: serializeUser(createdUser),
      emailDelivery,
    };
    await auditUserOperation(
      context,
      "USER_INVITED",
      createdUser._id.toString(),
      { role: createdUser.role, status: createdUser.status, emailDelivery },
    );
    return result;
  } catch (error) {
    if (createdUser) {
      await createdUser.deleteOne();
    }

    if (isDuplicateKeyError(error)) {
      throw new AppError(
        409,
        EMAIL_ALREADY_EXISTS,
        "Email already exists in this tenant",
      );
    }

    if (error instanceof AppError) {
      throw error;
    }

    console.error("[users-invite]", error);
    throw new AppError(500, REGISTRATION_FAILED, "Failed to invite user");
  }
}

export async function updateUser(
  input: unknown,
  inputContext: UserOperationContext,
  targetUserId: string,
): Promise<UpdateUserResult> {
  const context = await resolveUserOperationContext(inputContext);
  await authorizeUserOperation(context, Permission.USERS_UPDATE);
  const payload = validateUpdateUserInput(input);
  if (payload.role !== undefined) {
    await authorizeUserOperation(context, Permission.USERS_ASSIGN_ROLE);
  }
  const tenantId = context.tenantId;
  assertObjectId(targetUserId);

  const existingUser = await findUserByTenantAndId(tenantId, targetUserId);
  if (!existingUser) {
    await auditUserOperation(
      context,
      "USER_UPDATED",
      targetUserId,
      { reason: "USER_NOT_FOUND_OR_TENANT_MISMATCH" },
      "DENIED",
    );
    throw new AppError(404, NOT_FOUND, "User not found");
  }
  const tenant = await findTenantById(tenantId);
  if (!tenant) {
    throw new AppError(404, NOT_FOUND, "Tenant not found");
  }
  assertCustomerTenantForUserManagement(tenant);

  const changes: Record<string, unknown> = {};
  const update: Record<string, unknown> = {};

  if (payload.role !== undefined) {
    if (payload.role !== existingUser.role || existingUser.customRoleId) {
      update.role = payload.role;
      update.customRoleId = null;
      changes.role = {
        before: existingUser.role,
        after: payload.role,
      };
      if (existingUser.customRoleId) {
        changes.customRoleId = {
          before: existingUser.customRoleId.toString(),
          after: null,
        };
      }
    }
  }

  if (
    payload.status !== undefined &&
    payload.status !== existingUser.status
  ) {
    update.status = payload.status;
    changes.status = {
      before: existingUser.status,
      after: payload.status,
    };
  }

  const selfDestructive = context.actorId === targetUserId && existingUser.role === "COMPANY_ADMIN" &&
    ((update.role !== undefined && update.role !== "COMPANY_ADMIN") ||
      (update.status !== undefined && update.status !== "active"));
  if (selfDestructive) {
    throw new AppError(409, SELF_ACTION_FORBIDDEN, "Administrators cannot demote or disable their own account");
  }

  if (Object.keys(update).length === 0) {
    return { user: serializeUser(existingUser) };
  }

  try {
    const updatedUser = await updateUserSecurityStateTransaction(tenantId, targetUserId, update);

    if (!updatedUser) {
      throw new AppError(404, NOT_FOUND, "User not found");
    }

    if (
      update.customRoleId !== undefined ||
      update.role !== undefined
    ) {
      const evaluator = getPermissionEvaluator();
      evaluator.evict(targetUserId, tenantId);
    }

    const action =
      changes.role && changes.status
        ? "USER_UPDATED"
        : changes.role
          ? "USER_ROLE_CHANGED"
          : "USER_STATUS_CHANGED";
    await auditUserOperation(
      context,
      action,
      (updatedUser as UserDocument)._id.toString(),
      changes,
    );

    return {
      user: serializeUser(updatedUser),
    };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === LAST_ADMIN_PROTECTION) {
        await auditLastAdminProtection(context, targetUserId, "update");
      }
      throw error;
    }

    console.error("[users-update]", error);
    throw new AppError(500, USER_UPDATE_FAILED, "Failed to update user");
  }
}

export async function deleteUser(
  inputContext: UserOperationContext,
  targetUserId: string,
) {
  const context = await resolveUserOperationContext(inputContext);
  await authorizeUserOperation(context, Permission.USERS_DELETE);
  const tenantId = context.tenantId;
  assertObjectId(targetUserId);
  const existingUser = await findUserByTenantAndId(tenantId, targetUserId);
  if (!existingUser) {
    await auditUserOperation(
      context,
      "USER_DELETED",
      targetUserId,
      { reason: "USER_NOT_FOUND_OR_TENANT_MISMATCH" },
      "DENIED",
    );
    throw new AppError(404, NOT_FOUND, "User not found");
  }
  const tenant = await findTenantById(tenantId);
  if (!tenant) {
    throw new AppError(404, NOT_FOUND, "Tenant not found");
  }
  assertCustomerTenantForUserManagement(tenant);

  if (context.actorId === targetUserId) {
    throw new AppError(409, SELF_ACTION_FORBIDDEN, "Administrators cannot delete their own account");
  }

  if (existingUser.role === "COMPANY_ADMIN" && existingUser.status === "active") {
    try {
      await deleteWithLastAdminTransaction(tenantId, targetUserId);
    } catch (error) {
      if (error instanceof AppError && error.code === LAST_ADMIN_PROTECTION) {
        await auditLastAdminProtection(context, targetUserId, "delete");
      }
      throw error;
    }
  } else {
    await deleteUserWithSessionRevocation(tenantId, targetUserId);
  }

  await auditUserOperation(
    context,
    "USER_DELETED",
    existingUser._id.toString(),
    {
      deleted: true,
      previousRole: existingUser.role,
      previousStatus: existingUser.status,
    },
  );

  return {
    success: true,
    message: "User deleted successfully.",
  };
}

export async function resendInvitation(
  inputContext: UserOperationContext,
  targetUserId: string,
) {
  const context = await resolveUserOperationContext(inputContext);
  await authorizeUserOperation(context, Permission.USERS_CREATE);
  const tenantId = context.tenantId;
  assertObjectId(targetUserId);

  const [tenant, inviter, user] = await Promise.all([
    findTenantById(tenantId),
    findUserByTenantAndId(tenantId, context.actorId),
    UserModel.findOne({
      _id: targetUserId,
      tenantId,
      status: "pending_email_verification",
      emailVerified: false,
    })
      .select("+emailVerificationTokenHash +emailVerificationExpiresAt")
      .exec(),
  ]);

  if (!tenant || !user) {
    throw new AppError(404, NOT_FOUND, "Invitation not found");
  }
  assertCustomerTenantForUserManagement(tenant);

  const token = await createEmailVerificationTokenForUser(user, {
    purpose: USER_INVITATION_PURPOSE,
  });

  await sendInvitationEmail({
    to: user.email,
    inviterName: inviter?.name ?? "Your administrator",
    inviterEmail: inviter?.email,
    companyName: tenant.name,
    role: user.role,
    invitationUrl: buildVerificationUrl(token),
    expiryDate:
      user.emailVerificationExpiresAt ??
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    tenantId,
  });

  await auditUserOperation(
    context,
    "USER_INVITATION_RESENT",
    user._id.toString(),
    { invitationReissued: true },
  );

  return {
    user: serializeUser(user),
  };
}

async function resolveUserOperationContext(
  context: UserOperationContext,
): Promise<ResolvedUserOperationContext> {
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

async function authorizeUserOperation(
  context: ResolvedUserOperationContext,
  ...permissions: readonly PermissionValue[]
): Promise<void> {
  for (const permission of permissions) {
    try {
      await authorizePermission(context, permission);
    } catch (error) {
      await auditUserOperation(
        context,
        "PERMISSION_DENIED",
        permission,
        { required: permission, reason: PERMISSION_REQUIRED },
        "DENIED",
      );
      throw error;
    }
  }
}

async function auditUserOperation(
  context: ResolvedUserOperationContext,
  action: AuditAction,
  resourceId: string,
  changes: Record<string, unknown>,
  outcome: AuditOutcome = "SUCCESS",
): Promise<void> {
  await getAuditWriter().write({
    tenantId: context.tenantId,
    resourceType: "User",
    resourceId,
    action,
    outcome,
    actorId: context.actorId,
    actorEmail: context.actorEmail,
    actorRole: context.actorRole,
    actorKind: context.actorKind,
    changes,
    metadata: {
      traceId: context.traceId,
      requestId: context.requestId,
    },
  });
}

function assertObjectId(value: string) {
  if (!mongoose.isObjectIdOrHexString(value)) {
    throw new AppError(400, "MALFORMED_OBJECT_ID", "Malformed identifier");
  }
}

async function updateUserSecurityStateTransaction(
  tenantId: string,
  targetUserId: string,
  update: Record<string, unknown>,
) {
  const session = await mongoose.startSession();
  let updated: UserDocument | null = null;
  try {
    await session.withTransaction(async () => {
      await lockTenantSecurityGuards(tenantId, session);
      const current = await UserModel.findOne({ _id: targetUserId, tenantId }).session(session).exec();
      if (!current) throw new AppError(404, NOT_FOUND, "User not found");
      const removesActiveAdmin = current.role === "COMPANY_ADMIN" && current.status === "active" &&
        ((update.role ?? current.role) !== "COMPANY_ADMIN" || (update.status ?? current.status) !== "active");
      if (removesActiveAdmin && await UserModel.countDocuments({ tenantId, role: "COMPANY_ADMIN", status: "active" }).session(session) <= 1) {
        throw lastAdminError();
      }
      updated = await UserModel.findOneAndUpdate(
        { _id: targetUserId, tenantId },
        { $set: update },
        { returnDocument: "after", runValidators: true, session },
      ).exec();
      await revokeActiveRefreshSessionsForTenantUser(
        targetUserId,
        tenantId,
        new Date(),
        session,
      );
    });
    return updated;
  } finally {
    await session.endSession();
  }
}

async function deleteWithLastAdminTransaction(tenantId: string, targetUserId: string) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await lockTenantSecurityGuards(tenantId, session);
      const current = await UserModel.findOne({ _id: targetUserId, tenantId }).session(session).exec();
      if (!current) throw new AppError(404, NOT_FOUND, "User not found");
      if (current.role === "COMPANY_ADMIN" && current.status === "active" &&
          await UserModel.countDocuments({ tenantId, role: "COMPANY_ADMIN", status: "active" }).session(session) <= 1) {
        throw lastAdminError();
      }
      await UserModel.deleteOne({ _id: targetUserId, tenantId }).session(session).exec();
      await revokeActiveRefreshSessionsForTenantUser(
        targetUserId,
        tenantId,
        new Date(),
        session,
      );
    });
  } finally {
    await session.endSession();
  }
}

async function deleteUserWithSessionRevocation(
  tenantId: string,
  targetUserId: string,
) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const deleted = await UserModel.deleteOne({
        _id: targetUserId,
        tenantId,
      })
        .session(session)
        .exec();
      if (deleted.deletedCount !== 1) {
        throw new AppError(404, NOT_FOUND, "User not found");
      }
      await revokeActiveRefreshSessionsForTenantUser(
        targetUserId,
        tenantId,
        new Date(),
        session,
      );
    });
  } finally {
    await session.endSession();
  }
}

async function lockTenantSecurityGuards(tenantId: string, session: mongoose.ClientSession) {
  const result = await TenantModel.updateOne(
    { _id: tenantId },
    { $inc: { adminGuardVersion: 1, roleGuardVersion: 1 } },
    { session },
  ).exec();
  if (result.matchedCount !== 1) throw new AppError(404, NOT_FOUND, "Tenant not found");
}

function lastAdminError() {
  return new AppError(409, LAST_ADMIN_PROTECTION, "Cannot remove the last active Company Admin. Promote another user first.");
}

async function auditLastAdminProtection(
  context: ResolvedUserOperationContext,
  targetUserId: string,
  operation: "update" | "delete",
) {
  await auditUserOperation(
    context,
    "LAST_ADMIN_PROTECTION_TRIGGERED",
    targetUserId,
    { reason: "LAST_ACTIVE_COMPANY_ADMIN", operation },
    "DENIED",
  );
}

export async function listUsers(
  input: unknown,
  inputContext: UserOperationContext,
): Promise<ListUsersResult> {
  const context = await resolveUserOperationContext(inputContext);
  await authorizeUserOperation(context, Permission.USERS_READ);
  const tenantId = context.tenantId;
  const payload = validateListUsersInput(input);
  const tenant = await findTenantById(tenantId);
  if (!tenant) {
    throw new AppError(404, NOT_FOUND, "Tenant not found");
  }
  assertCustomerTenantForUserManagement(tenant);

  const [totalRecords, users] = await Promise.all([
    countUsersByTenant(tenantId),
    findUsersByTenant(tenantId, payload.page, payload.pageSize),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalRecords / payload.pageSize));

  return {
    users: users.map(serializeUser),
    pagination: {
      page: payload.page,
      pageSize: payload.pageSize,
      totalPages,
      totalRecords,
    },
  };
}

export async function setPasswordFromInvite(
  input: unknown,
): Promise<SetPasswordFromInviteResult> {
  const payload = validateSetPasswordFromInviteInput(input);
  const invalidTokenError = new AppError(
    400,
    INVALID_OR_EXPIRED_VERIFICATION_TOKEN,
    "Invalid or expired invite token",
  );

  try {
    const tokenPayload = verifyEmailVerificationToken(payload.token);

    if (tokenPayload.purpose === "email_verification") {
      throw new AppError(
        409,
        "INVITE_REISSUE_REQUIRED",
        "This invitation link must be reissued by your company administrator.",
      );
    }

    if (tokenPayload.purpose !== USER_INVITATION_PURPOSE) {
      throw invalidTokenError;
    }

    const tenant = await findTenantById(tokenPayload.tenantId);
    if (!tenant || isSystemPlatformTenant(tenant)) {
      throw invalidTokenError;
    }

    const tokenHash = hashVerificationJti(tokenPayload.jti);
    const user = await UserModel.findOneAndUpdate(
      {
        _id: tokenPayload.sub,
        tenantId: tokenPayload.tenantId,
        email: tokenPayload.email,
        status: "pending_email_verification",
        emailVerified: false,
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: {
          $gt: new Date(),
        },
      },
      {
        $set: {
          passwordHash: await hashPassword(payload.password),
          emailVerified: true,
          emailVerifiedAt: new Date(),
          status: "active",
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
        },
      },
      {
        returnDocument: "after",
      },
    ).exec();

    if (!user) {
      throw invalidTokenError;
    }

    await getAuditWriter().write({
      tenantId: user.tenantId.toString(),
      resourceType: "User",
      resourceId: user._id.toString(),
      action: "PASSWORD_SET_FROM_INVITE",
      actorId: user._id.toString(),
      actorEmail: user.email,
      actorRole: user.role,
      actorKind: "USER",
      changes: {
        status: {
          before: "pending_email_verification",
          after: "active",
        },
        passwordSet: true,
      },
    });

    return {
      user: serializeUser(user),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    console.error("[users-set-password-from-invite]", error);
    throw invalidTokenError;
  }
}

export async function getInviteDetails(input: unknown) {
  const token =
    typeof input === "object" && input && "token" in input
      ? String((input as { token: unknown }).token ?? "").trim()
      : "";
  if (!token)
    throw new AppError(400, "INVITE_INVALID", "Invite token is required");
  try {
    const tokenPayload = verifyEmailVerificationToken(token);
    if (tokenPayload.purpose === "email_verification") {
      throw new AppError(
        409,
        "INVITE_REISSUE_REQUIRED",
        "This invitation link must be reissued by your company administrator.",
      );
    }
    if (tokenPayload.purpose !== USER_INVITATION_PURPOSE) {
      throw new AppError(400, "INVITE_INVALID", "Invalid invitation");
    }
    const user = await findUserDocumentById(tokenPayload.sub);
    if (
      !user ||
      user.tenantId.toString() !== tokenPayload.tenantId ||
      user.email !== tokenPayload.email
    ) {
      throw new AppError(400, "INVITE_INVALID", "Invalid invitation");
    }
    if (user.emailVerified || user.status === "active") {
      throw new AppError(
        409,
        "INVITE_ALREADY_ACCEPTED",
        "This invitation has already been accepted",
      );
    }
    if (
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() <= Date.now()
    ) {
      throw new AppError(410, "INVITE_EXPIRED", "This invitation has expired");
    }
    if (
      !user.emailVerificationTokenHash ||
      user.emailVerificationTokenHash !== hashVerificationJti(tokenPayload.jti)
    ) {
      throw new AppError(400, "INVITE_INVALID", "Invalid invitation");
    }
    const tenant = await findTenantById(user.tenantId.toString());
    if (!tenant || isSystemPlatformTenant(tenant))
      throw new AppError(400, "INVITE_INVALID", "Invalid invitation");
    return {
      companyName: tenant.name,
      email: user.email,
      role: user.role,
      expiresAt: user.emailVerificationExpiresAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "INVITE_INVALID", "Invalid or expired invitation");
  }
}
