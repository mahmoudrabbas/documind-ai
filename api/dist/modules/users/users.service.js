import { randomUUID } from "node:crypto";
import { AppError } from "../../common/errors/AppError.js";
import { EMAIL_ALREADY_EXISTS, LAST_ADMIN_PROTECTION, NOT_FOUND, REGISTRATION_FAILED, USER_UPDATE_FAILED, INVALID_OR_EXPIRED_VERIFICATION_TOKEN, VALIDATION_ERROR, } from "../../common/errors/errorCodes.js";
import RoleModel from "../../db/models/role.model.js";
import { createEmailVerificationTokenForUser } from "../auth/auth.service.js";
import { verifyEmailVerificationToken, hashVerificationJti, } from "../auth/emailVerificationToken.js";
import { findUserDocumentById } from "../auth/auth.repository.js";
import { sendInvitationEmail } from "../auth/auth.mailer.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { countActiveCompanyAdminsByTenant, createUser, findTenantById, findUserByTenantAndId, findUserDocumentByTenantAndEmail, countUsersByTenant, findUsersByTenant, updateUserByTenantAndId, deleteUserByTenantAndId, } from "./users.repository.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { getPermissionEvaluator } from "../permissions/permissions.evaluator.js";
import { validateInviteUserInput, validateListUsersInput, validateUpdateUserInput, validateSetPasswordFromInviteInput, } from "./users.validator.js";
import { config } from "../../config/index.js";
function serializeUser(user) {
    const result = {
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
        }
        else {
            result.customRoleId = user.customRoleId;
        }
    }
    return result;
}
function buildVerificationUrl(token) {
    const url = new URL("/set-password-from-invite", config.APP_FRONTEND_URL);
    url.searchParams.set("token", token);
    return url.toString();
}
function isDuplicateKeyError(error) {
    return Boolean(error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 11000);
}
export async function inviteUser(input, tenantId, inviterId) {
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
    let resolvedRole;
    let resolvedCustomRoleId;
    if (payload.customRoleId) {
        const customRole = await RoleModel.findOne({
            _id: payload.customRoleId,
            tenantId,
        }).exec();
        if (!customRole) {
            throw new AppError(400, VALIDATION_ERROR, "Custom role not found in this tenant");
        }
        resolvedRole = customRole.baseRole;
        resolvedCustomRoleId = customRole._id.toString();
    }
    else {
        resolvedRole = payload.role ?? "EMPLOYEE";
    }
    const userPayload = {
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
    let createdUser = null;
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
            expiryDate: createdUser.emailVerificationExpiresAt ??
                new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        return {
            user: serializeUser(createdUser),
        };
    }
    catch (error) {
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
export async function updateUser(input, tenantId, targetUserId, updater) {
    const payload = validateUpdateUserInput(input);
    const existingUser = await findUserByTenantAndId(tenantId, targetUserId);
    if (!existingUser) {
        throw new AppError(404, NOT_FOUND, "User not found");
    }
    if (existingUser.role === "COMPANY_ADMIN" &&
        (payload.role !== undefined || payload.customRoleId !== undefined)) {
        const adminCount = await countActiveCompanyAdminsByTenant(tenantId);
        if (adminCount <= 1) {
            await getAuditWriter().write({
                tenantId,
                resourceType: "User",
                resourceId: existingUser._id.toString(),
                action: "LAST_ADMIN_PROTECTION_TRIGGERED",
                actorId: updater.userId,
                actorEmail: updater.email ?? "",
                actorRole: updater.role ?? "UNKNOWN",
                changes: {
                    reason: "Attempt to change role of last active Company Admin",
                    targetUserId,
                },
            });
            throw new AppError(409, LAST_ADMIN_PROTECTION, "Cannot change the role of the last active Company Admin. Promote another user first.");
        }
    }
    const changes = {};
    const update = {};
    if (payload.customRoleId) {
        const customRole = await RoleModel.findOne({
            _id: payload.customRoleId,
            tenantId,
        }).exec();
        if (!customRole) {
            throw new AppError(400, VALIDATION_ERROR, "Custom role not found in this tenant");
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
    }
    else if (payload.role !== undefined) {
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
        const updatedUser = await updateUserByTenantAndId(tenantId, targetUserId, update);
        if (!updatedUser) {
            throw new AppError(404, NOT_FOUND, "User not found");
        }
        if (update.customRoleId !== undefined ||
            update.role !== undefined) {
            const evaluator = getPermissionEvaluator();
            evaluator.evict(targetUserId, tenantId);
        }
        await getAuditWriter().write({
            tenantId,
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
    }
    catch (error) {
        if (error instanceof AppError) {
            throw error;
        }
        console.error("[users-update]", error);
        throw new AppError(500, USER_UPDATE_FAILED, "Failed to update user");
    }
}
export async function deleteUser(tenantId, targetUserId, deleter) {
    const existingUser = await findUserByTenantAndId(tenantId, targetUserId);
    if (!existingUser) {
        throw new AppError(404, NOT_FOUND, "User not found");
    }
    if (existingUser.role === "COMPANY_ADMIN") {
        const adminCount = await countActiveCompanyAdminsByTenant(tenantId);
        if (adminCount <= 1) {
            await getAuditWriter().write({
                tenantId,
                resourceType: "User",
                resourceId: existingUser._id.toString(),
                action: "LAST_ADMIN_PROTECTION_TRIGGERED",
                actorId: deleter.userId,
                actorEmail: deleter.email ?? "",
                actorRole: deleter.role ?? "UNKNOWN",
                changes: {
                    reason: "Attempt to delete last active Company Admin",
                    targetUserId,
                },
            });
            throw new AppError(409, LAST_ADMIN_PROTECTION, "Cannot delete the last active Company Admin. Promote another user first.");
        }
    }
    await deleteUserByTenantAndId(tenantId, targetUserId);
    await getAuditWriter().write({
        tenantId,
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
export async function listUsers(input, tenantId) {
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
export async function setPasswordFromInvite(input) {
    const payload = validateSetPasswordFromInviteInput(input);
    const invalidTokenError = new AppError(400, INVALID_OR_EXPIRED_VERIFICATION_TOKEN, "Invalid or expired invite token");
    try {
        const tokenPayload = verifyEmailVerificationToken(payload.token);
        if (tokenPayload.purpose !== "email_verification") {
            throw invalidTokenError;
        }
        const user = await findUserDocumentById(tokenPayload.sub);
        if (!user ||
            user.tenantId.toString() !== tokenPayload.tenantId ||
            user.email !== tokenPayload.email) {
            throw invalidTokenError;
        }
        if (user.emailVerified ||
            user.status !== "pending_email_verification" ||
            !user.emailVerificationTokenHash ||
            !user.emailVerificationExpiresAt ||
            user.emailVerificationExpiresAt.getTime() <= Date.now()) {
            throw invalidTokenError;
        }
        if (user.emailVerificationTokenHash !== hashVerificationJti(tokenPayload.jti)) {
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
        await getAuditWriter().write({
            tenantId: user.tenantId.toString(),
            resourceType: "User",
            resourceId: user._id.toString(),
            action: "PASSWORD_SET_FROM_INVITE",
            actorId: user._id.toString(),
            actorEmail: user.email,
            actorRole: user.role ?? "UNKNOWN",
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
    }
    catch (error) {
        if (error instanceof AppError) {
            throw error;
        }
        console.error("[users-set-password-from-invite]", error);
        throw invalidTokenError;
    }
}
export async function getInviteDetails(input) {
    const token = typeof input === "object" && input && "token" in input
        ? String(input.token ?? "").trim()
        : "";
    if (!token)
        throw new AppError(400, "INVITE_INVALID", "Invite token is required");
    try {
        const tokenPayload = verifyEmailVerificationToken(token);
        const user = await findUserDocumentById(tokenPayload.sub);
        if (!user ||
            user.tenantId.toString() !== tokenPayload.tenantId ||
            user.email !== tokenPayload.email) {
            throw new AppError(400, "INVITE_INVALID", "Invalid invitation");
        }
        if (user.emailVerified || user.status === "active") {
            throw new AppError(409, "INVITE_ALREADY_ACCEPTED", "This invitation has already been accepted");
        }
        if (!user.emailVerificationExpiresAt ||
            user.emailVerificationExpiresAt.getTime() <= Date.now()) {
            throw new AppError(410, "INVITE_EXPIRED", "This invitation has expired");
        }
        if (!user.emailVerificationTokenHash ||
            user.emailVerificationTokenHash !== hashVerificationJti(tokenPayload.jti)) {
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
    }
    catch (error) {
        if (error instanceof AppError)
            throw error;
        throw new AppError(400, "INVITE_INVALID", "Invalid or expired invitation");
    }
}
//# sourceMappingURL=users.service.js.map