import { AppError } from "../errors/AppError.js";
import { UNAUTHORIZED } from "../errors/errorCodes.js";
/**
 * Express middleware that extracts and validates tenantId from a verified JWT.
 *
 * This middleware MUST run after the `authenticate` middleware, which verifies
 * the JWT signature and populates `req.auth` with the decoded claims.
 *
 * On success it:
 * - Extracts `tenantId` from `req.auth.tenantId` (already verified by JWT)
 * - Stores it in `req.tenantId` for downstream use
 * - Enhances request logging with tenant context
 * - Calls `next()`
 *
 * On failure (missing tenantId) it throws a 401 AppError which is handled by
 * the centralized error handler.
 *
 * Usage:
 * ```typescript
 * router.get("/protected", authenticate, tenantScoping, controller);
 * ```
 */
export function tenantScoping(req, _res, next) {
    try {
        // Validate that authenticate middleware ran first and set req.auth
        if (!req.auth) {
            throw new AppError(401, UNAUTHORIZED, "Authentication required before tenant scoping");
        }
        // Extract and validate tenantId from the verified JWT
        const tenantId = req.auth.tenantId;
        if (!tenantId) {
            throw new AppError(401, UNAUTHORIZED, "Tenant context required (tenantId missing from token)");
        }
        // Store tenantId in request for downstream middleware/controllers
        req.tenantId = tenantId;
        // Enhance request logging with tenant context for better traceability
        if (req.log) {
            req.log = req.log.child({ tenantId });
        }
        next();
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=tenantScoping.middleware.js.map