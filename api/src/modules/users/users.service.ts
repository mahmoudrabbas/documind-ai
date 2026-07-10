import { randomUUID } from "node:crypto";
import { AppError } from "../../common/errors/AppError.js";
import {
  EMAIL_ALREADY_EXISTS,
  NOT_FOUND,
  REGISTRATION_FAILED,
  USER_UPDATE_FAILED,
} from "../../common/errors/errorCodes.js";
import { createEmailVerificationTokenForUser } from "../auth/auth.service.js";
import { sendVerificationEmail } from "../auth/auth.mailer.js";
import { hashPassword } from "../auth/passwordHashing.js";
import {
  createUser,
  findTenantById,
  findUserByTenantAndId,
  findUserDocumentByTenantAndEmail,
  countUsersByTenant,
  findUsersByTenant,
  updateUserByTenantAndId,
} from "./users.repository.js";
import { createAuditLog } from "../audit/audit.repository.js";
import {
  validateInviteUserInput,
  validateListUsersInput,
  validateUpdateUserInput,
} from "./users.validator.js";
import type {
  InviteUserResult,
  ListUsersResult,
  UpdateUserResult,
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
};

function serializeUser(user: CreatedUserRecord) {
  return {
    id: user.id ?? user._id.toString(),
    tenantId: user.tenantId?.toString() ?? "",
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

function buildVerificationUrl(token: string) {
  const url = new URL("/verify-email", config.APP_FRONTEND_URL);

  url.searchParams.set("token", token);

  return url.toString();
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

export async function inviteUser(
  input: unknown,
  tenantId: string,
  inviterId: string,
): Promise<InviteUserResult> {
  const payload = validateInviteUserInput(input);

  const existingUser = await findUserDocumentByTenantAndEmail(tenantId, payload.email);
  if (existingUser) {
    throw new AppError(409, EMAIL_ALREADY_EXISTS, "Email already exists in this tenant");
  }

  const tenant = await findTenantById(tenantId);
  if (!tenant) {
    throw new AppError(404, NOT_FOUND, "Tenant not found");
  }

  const inviter = await findUserByTenantAndId(tenantId, inviterId);
  const inviterName = inviter?.name ?? "Your administrator";

  const userPayload = {
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
    const token = await createEmailVerificationTokenForUser(createdUser);

    await sendVerificationEmail({
      to: createdUser.email,
      adminName: inviterName,
      companyName: tenant.name,
      verificationUrl: buildVerificationUrl(token),
    });

    return {
      user: serializeUser(createdUser),
    };
  } catch (error) {
    if (createdUser) {
      await createdUser.deleteOne();
    }

    if (isDuplicateKeyError(error)) {
      throw new AppError(409, EMAIL_ALREADY_EXISTS, "Email already exists in this tenant");
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
  const update: Partial<Pick<UserDocument, "role" | "status">> = {};

  if (payload.role !== undefined) {
    update.role = payload.role;
    changes.role = {
      before: existingUser.role,
      after: payload.role,
    };
  }

  if (payload.status !== undefined) {
    update.status = payload.status;
    changes.status = {
      before: existingUser.status,
      after: payload.status,
    };
  }

  try {
    const updatedUser = await updateUserByTenantAndId(tenantId, targetUserId, update);

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
