import { AppError } from "../../common/errors/AppError.js";
import { createRole, listRoles, updateRole, deleteRole, } from "./roles.service.js";
function handleRoleError(error, res, next) {
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
export async function createRoleController(req, res, next) {
    try {
        if (!req.auth || !req.tenantId) {
            throw new AppError(401, "UNAUTHORIZED", "Authentication required");
        }
        const result = await createRole(req.body, req.tenantId);
        res.status(201).json({
            success: true,
            message: "Role created successfully",
            data: result,
        });
    }
    catch (error) {
        handleRoleError(error, res, next);
    }
}
export async function listRolesController(req, res, next) {
    try {
        if (!req.auth || !req.tenantId) {
            throw new AppError(401, "UNAUTHORIZED", "Authentication required");
        }
        const result = await listRoles(req.tenantId);
        res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        handleRoleError(error, res, next);
    }
}
export async function updateRoleController(req, res, next) {
    try {
        if (!req.auth || !req.tenantId) {
            throw new AppError(401, "UNAUTHORIZED", "Authentication required");
        }
        const roleId = Array.isArray(req.params.id)
            ? req.params.id[0]
            : req.params.id;
        if (!roleId) {
            throw new AppError(400, "BAD_REQUEST", "Missing role id parameter");
        }
        const result = await updateRole(req.body, req.tenantId, roleId);
        res.status(200).json({
            success: true,
            message: "Role updated successfully",
            data: result,
        });
    }
    catch (error) {
        handleRoleError(error, res, next);
    }
}
export async function deleteRoleController(req, res, next) {
    try {
        if (!req.auth || !req.tenantId) {
            throw new AppError(401, "UNAUTHORIZED", "Authentication required");
        }
        const roleId = Array.isArray(req.params.id)
            ? req.params.id[0]
            : req.params.id;
        if (!roleId) {
            throw new AppError(400, "BAD_REQUEST", "Missing role id parameter");
        }
        const result = await deleteRole(req.tenantId, roleId);
        res.status(200).json({
            success: true,
            message: "Role deleted successfully",
            data: result,
        });
    }
    catch (error) {
        handleRoleError(error, res, next);
    }
}
//# sourceMappingURL=roles.controller.js.map