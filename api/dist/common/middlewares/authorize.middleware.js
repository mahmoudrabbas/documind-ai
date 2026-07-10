import { AppError } from "../errors/AppError.js";
import { FORBIDDEN, UNAUTHORIZED } from "../errors/errorCodes.js";
/**
 * Creates an Express middleware that enforces role-based authorization.
 *
 * Use this after `authenticate` and optionally after `tenantScoping`.
 *
 * @example
 * router.get("/admin", authenticate, tenantScoping, authorize("COMPANY_ADMIN"), controller);
 */
export function authorize(...allowedRoles) {
    if (allowedRoles.length === 0) {
        throw new Error("authorize middleware requires at least one role");
    }
    const allowedRolesSet = new Set(allowedRoles);
    return function authorizeMiddleware(req, _res, next) {
        try {
            if (!req.auth) {
                throw new AppError(401, UNAUTHORIZED, "Authentication required");
            }
            const role = req.auth.role;
            if (!role || !allowedRolesSet.has(role)) {
                throw new AppError(403, FORBIDDEN, `Forbidden: requires one of the following roles: ${allowedRoles.join(", ")}`);
            }
            next();
        }
        catch (error) {
            next(error);
        }
    };
}
//# sourceMappingURL=authorize.middleware.js.map