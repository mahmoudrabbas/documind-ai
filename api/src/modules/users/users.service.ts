import { randomUUID } from "node:crypto";
import { AppError } from "../../common/errors/AppError.js";
import {
  EMAIL_ALREADY_EXISTS,
  NOT_FOUND,
  REGISTRATION_FAILED,
  USER_UPDATE_FAILED,
  INVALID_OR_EXPIRED_VERIFICATION_TOKEN,
  VALIDATION_ERROR,
} from "../../common/errors/errorCodes.js";
import RoleModel from "../../db/models/role.model.js";
import { createEmailVerificationTokenForUser } from "../auth/auth.service.js";
import {
  verifyEmailVerificationToken,
  hashVerificationJti,
} from "../auth/emailVerificationToken.js";
import { findUserDocumentById } from "../auth/auth.repository.js";
import { sendInvitationEmail } from "../auth/auth.mailer.js";
import { hashPassword } from "../auth/passwordHashing.js";
import {
  createUser,
  findTenantById,
  findUserByTenantAndId,
  findUserDocumentByTenantAndEmail,
  countUsersByTenant,
  findUsersByTenant,
  updateUserByTenantAndId,
  deleteUserByTenantAndId,
} from "./users.repository.js";
import { createAuditLog } from "../audit/audit.repository.js";
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
import type { UserDocument } from "../../db/models/user.model.js";
import { config } from "../../config/index.js";

type CreatedUserRecord = {
  _id: { toString(): string };
  id?: string;
  tenantId: unknown;
  name: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt?: Date;
  customRoleId?:
    | { _id?: { toString(): string }; toString(): string; name?: string }
    | string
    | null;
};

function serializeUser(user: CreatedUserRecord) {
  const result: Record<string, unknown> = {
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

  return result as unknown as import("../../modules/auth/auth.types.js").UserPublicView;
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

export async function inviteUser(
  input: unknown,
  tenantId: string,
  inviterId: string,
): Promise<InviteUserResult> {
  const payload = validateInviteUserInput(input);

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

  const inviter = await findUserByTenantAndId(tenantId, inviterId);
  const inviterName = inviter?.name ?? "Your administrator";

  let resolvedRole: string;
  let resolvedCustomRoleId: string | undefined;

  if (payload.customRoleId) {
    const customRole = await RoleModel.findOne({
      _id: payload.customRoleId,
      tenantId,
    }).exec();

    if (!customRole) {
      throw new AppError(
        400,
        VALIDATION_ERROR,
        "Custom role not found in this tenant",
      );
    }

    resolvedRole = customRole.baseRole;
    resolvedCustomRoleId = customRole._id.toString();
  } else {
    resolvedRole = payload.role ?? "EMPLOYEE";
  }

  const userPayload: import("../../modules/auth/auth.repository.js").UserCreateInput = {
    tenantId,
    name: payload.name.trim(),
    email: payload.email.toLowerCase().trim(),
    passwordHash: await hashPassword(randomUUID()),
    role: resolvedRole,
    status: "pending_email_verification",
    emailVerified: false,
    emailVerifiedAt: null,
    customRoleId: resolvedCustomRoleId,
  };

  let createdUser: UserDocument | null = null;

  try {
    createdUser = await createUser(userPayload);
    const token = await createEmailVerificationTokenForUser(createdUser);

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
    });

    return {
      user: serializeUser(createdUser),
    };
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
  tenantId: string,
  targetUserId: string,
  updater: { userId: string; email?: string; role?: string },
): Promise<UpdateUserResult> {
  const payload = validateUpdateUserInput(input);

  const existingUser = await findUserByTenantAndId(tenantId, targetUserId);
  if (!existingUser) {
    throw new AppError(404, NOT_FOUND, "User not found");
  }

  const changes: Record<string, unknown> = {};
  const update: Record<string, unknown> = {};

  if (payload.customRoleId) {
    const customRole = await RoleModel.findOne({
      _id: payload.customRoleId,
      tenantId,
    }).exec();

    if (!customRole) {
      throw new AppError(
        400,
        VALIDATION_ERROR,
        "Custom role not found in this tenant",
      );
    }

    update.role = customRole.baseRole;
    update.customRoleId = customRole._id.toString();
    changes.role = {
      before: existingUser.role,
      after: customRole.baseRole,
    };
    changes.customRoleId = {
      before: existingUser.customRoleId?.toString() ?? null,
      after: customRole._id.toString(),
    };
  } else if (payload.role !== undefined) {
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

  if (payload.status !== undefined) {
    update.status = payload.status;
    changes.status = {
      before: existingUser.status,
      after: payload.status,
    };
  }

  try {
    const updatedUser = await updateUserByTenantAndId(
      tenantId,
      targetUserId,
      update,
    );

    if (!updatedUser) {
      throw new AppError(404, NOT_FOUND, "User not found");
    }

    await createAuditLog({
      tenantId,
      userId: updatedUser._id.toString(),
      resourceType: "User",
      resourceId: updatedUser._id.toString(),
      action: "USER_UPDATED",
      actorId: updater.userId,
      actorEmail: updater.email ?? "",
      actorRole: updater.role ?? "UNKNOWN",
      changes,
    });

    return {
      user: serializeUser(updatedUser),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    console.error("[users-update]", error);
    throw new AppError(500, USER_UPDATE_FAILED, "Failed to update user");
  }
}

export async function deleteUser(
  tenantId: string,
  targetUserId: string,
  deleter: { userId: string; email?: string; role?: string },
) {
  const existingUser = await findUserByTenantAndId(tenantId, targetUserId);
  if (!existingUser) {
    throw new AppError(404, NOT_FOUND, "User not found");
  }

  await deleteUserByTenantAndId(tenantId, targetUserId);

  await createAuditLog({
    tenantId,
    userId: existingUser._id.toString(),
    resourceType: "User",
    resourceId: existingUser._id.toString(),
    action: "USER_DELETED",
    actorId: deleter.userId,
    actorEmail: deleter.email ?? "",
    actorRole: deleter.role ?? "UNKNOWN",
    changes: {
      before: serializeUser(existingUser),
      after: null,
    },
  });

  return {
    success: true,
    message: "User deleted successfully.",
  };
}

export async function listUsers(
  input: unknown,
  tenantId: string,
): Promise<ListUsersResult> {
  const payload = validateListUsersInput(input);

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

    if (tokenPayload.purpose !== "email_verification") {
      throw invalidTokenError;
    }

    const user = await findUserDocumentById(tokenPayload.sub);

    if (
      !user ||
      user.tenantId.toString() !== tokenPayload.tenantId ||
      user.email !== tokenPayload.email
    ) {
      throw invalidTokenError;
    }

    if (
      user.emailVerified ||
      user.status !== "pending_email_verification" ||
      !user.emailVerificationTokenHash ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() <= Date.now()
    ) {
      throw invalidTokenError;
    }

    if (
      user.emailVerificationTokenHash !== hashVerificationJti(tokenPayload.jti)
    ) {
      throw invalidTokenError;
    }

    const newPasswordHash = await hashPassword(payload.password);

    user.passwordHash = newPasswordHash;
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.status = "active";
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpiresAt = null;

    await user.save();

    await createAuditLog({
      tenantId: user.tenantId.toString(),
      userId: user._id.toString(),
      resourceType: "User",
      resourceId: user._id.toString(),
      action: "PASSWORD_SET_FROM_INVITE",
      actorId: user._id.toString(),
      actorEmail: user.email,
      actorRole: user.role,
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
    if (!tenant)
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
