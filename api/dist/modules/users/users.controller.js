import { AppError } from "../../common/errors/AppError.js";
import { inviteUser, listUsers, updateUser, setPasswordFromInvite } from "./users.service.js";
export async function inviteUserController(req, res, next) {
    try {
        if (!req.auth || !req.tenantId) {
            throw new AppError(401, "UNAUTHORIZED", "Authentication required");
        }
        const result = await inviteUser(req.body, req.tenantId, req.auth.userId);
        res.status(201).json({
            success: true,
            message: "User invitation created successfully. An email has been sent to the invited user.",
            data: result,
        });
    }
    catch (error) {
        handleUserError(error, res, next);
    }
}
export async function setPasswordFromInviteController(req, res, next) {
    try {
        const result = await setPasswordFromInvite(req.body);
        res.status(200).json({
            success: true,
            message: "Password set successfully. You can now log in.",
            data: result,
        });
    }
    catch (error) {
        handleUserError(error, res, next);
    }
}
export async function listUsersController(req, res, next) {
    try {
        if (!req.auth || !req.tenantId) {
            throw new AppError(401, "UNAUTHORIZED", "Authentication required");
        }
        const result = await listUsers(req.query, req.tenantId);
        res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        handleUserError(error, res, next);
    }
}
export async function updateUserController(req, res, next) {
    try {
        if (!req.auth || !req.tenantId) {
            throw new AppError(401, "UNAUTHORIZED", "Authentication required");
        }
        const targetUserId = Array.isArray(req.params.id)
            ? req.params.id[0]
            : req.params.id;
        if (!targetUserId) {
            throw new AppError(400, "BAD_REQUEST", "Missing user id parameter");
        }
        const result = await updateUser(req.body, req.tenantId, targetUserId, {
            userId: req.auth.userId,
            email: req.auth.email,
            role: req.auth.role,
        });
        res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        handleUserError(error, res, next);
    }
}
function handleUserError(error, res, next) {
    if (error instanceof AppError) {
        res.status(error.statusCode).json({
            success: false,
            message: error.message,
            error: error.code,
            details: error.details ?? null,
        });
        return;
    }
    next(error);
}
//# sourceMappingURL=users.controller.js.map