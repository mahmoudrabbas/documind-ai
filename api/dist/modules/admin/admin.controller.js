import { AppError } from "../../common/errors/AppError.js";
import { validateListTenantsInput, validateUpdateTenantInput } from "./admin.validator.js";
import { listTenants, updateTenant } from "./admin.service.js";
function handleAdminError(error, res, next) {
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
export async function listTenantsController(req, res, next) {
    try {
        if (!req.auth) {
            throw new AppError(401, "UNAUTHORIZED", "Authentication required");
        }
        const input = validateListTenantsInput(req.query);
        const result = await listTenants(input);
        res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        handleAdminError(error, res, next);
    }
}
export async function updateTenantController(req, res, next) {
    try {
        if (!req.auth) {
            throw new AppError(401, "UNAUTHORIZED", "Authentication required");
        }
        const input = validateUpdateTenantInput(req.params, req.body);
        const result = await updateTenant(input);
        res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        handleAdminError(error, res, next);
    }
}
//# sourceMappingURL=admin.controller.js.map