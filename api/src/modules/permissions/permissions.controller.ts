import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { getPermissionEvaluator } from "./permissions.evaluator.js";
import {
  PERMISSION_CATALOG_GROUPS,
  PERMISSION_LABELS,
  PERMISSION_DESCRIPTIONS,
} from "./permissions.catalog.js";

export async function getPermissionCatalogController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const groups = PERMISSION_CATALOG_GROUPS.map((g) => ({
      group: g.group,
      label: g.label,
      permissions: g.permissions.map((p) => ({
        id: p,
        label: PERMISSION_LABELS[p] ?? p,
        description: PERMISSION_DESCRIPTIONS[p] ?? "",
      })),
    }));

    res.status(200).json({
      success: true,
      data: { groups },
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyPermissionsController(
  req: Request,
  res: Response,
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

    res.status(200).json({
      success: true,
      data: {
        permissions: Array.from(resolved.permissions),
        scopes: resolved.scopes,
        baseRole: resolved.baseRole,
      },
    });
  } catch (error) {
    next(error);
  }
}
