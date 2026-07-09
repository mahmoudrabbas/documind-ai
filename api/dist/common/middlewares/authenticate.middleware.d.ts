import type { NextFunction, Request, Response } from "express";
/**
 * Express middleware that authenticates a request using a JWT access token
 * sent in the `Authorization: Bearer <token>` header.
 *
 * On success it populates `req.auth` with the decoded claims
 * (`userId`, `tenantId`, `role`, `email`) and calls `next()`.
 *
 * On failure it throws an `AppError` (401) which is handled by the
 * centralized error handler.
 */
export declare function authenticate(req: Request, _res: Response, next: NextFunction): void;
//# sourceMappingURL=authenticate.middleware.d.ts.map