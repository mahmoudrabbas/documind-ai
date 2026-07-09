import type { NextFunction, Request, Response } from "express";
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
export declare function tenantScoping(req: Request, _res: Response, next: NextFunction): void;
//# sourceMappingURL=tenantScoping.middleware.d.ts.map