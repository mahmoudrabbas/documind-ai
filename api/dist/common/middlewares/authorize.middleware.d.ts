import type { NextFunction, Request, Response } from "express";
/**
 * Creates an Express middleware that enforces role-based authorization.
 *
 * Use this after `authenticate` and optionally after `tenantScoping`.
 *
 * @example
 * router.get("/admin", authenticate, tenantScoping, authorize("COMPANY_ADMIN"), controller);
 */
export declare function authorize(...allowedRoles: string[]): (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=authorize.middleware.d.ts.map