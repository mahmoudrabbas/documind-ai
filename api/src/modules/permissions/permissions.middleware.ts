import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { PERMISSION_REQUIRED } from "../../common/errors/errorCodes.js";
import { getPermissionEvaluator } from "./permissions.evaluator.js";
import { createAuditLog } from "../audit/audit.repository.js";

export function requirePermission(
  permission: string,
  options?: { allowScoped?: boolean },
) {
  return async function permissionMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(
          401,
          "UNAUTHORIZED",
          "Authentication required",
        );
      }

      const evaluator = getPermissionEvaluator();
      const resolved = await evaluator.resolve(
        req.auth.userId,
        req.tenantId,
      );

      if (resolved.permissions.has(permission)) {
        req.permissionScope = "full";
        next();
        return;
      }

      if (
        options?.allowScoped &&
        resolved.permissions.has(`${permission}:own`)
      ) {
        req.permissionScope = "own";
        next();
        return;
      }

      void createAuditLog({
        tenantId: req.tenantId,
        userId: req.auth.userId,
        resourceType: "permission",
        resourceId: permission,
        action: "denied",
        actorId: req.auth.userId,
        actorEmail: req.auth.email ?? "",
        actorRole: resolved.baseRole,
        changes: {
          required: permission,
          reason: "PERMISSION_REQUIRED",
        },
      }).catch((err) => {
        if (process.env.NODE_ENV !== "production") {
          console.error("[permissions] audit log failed", err);
        }
      });

      throw new AppError(
        403,
        PERMISSION_REQUIRED,
        `Permission denied: requires "${permission}"`,
      );
    } catch (error) {
      next(error);
    }
  };
}
