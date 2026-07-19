import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { isBaseRole, TENANT_ROLE_BASES } from "../../common/auth/baseRoles.js";
import { getPermissionEvaluator } from "./permissions.evaluator.js";
import {
  TENANT_PERMISSION_CATALOG_GROUPS,
  PERMISSION_BY_ID,
  PERMISSION_CONTRACT_VERSION,
  BASE_ROLE_DEFAULTS,
} from "./permissions.catalog.js";

export async function getPermissionCatalogController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const groups = TENANT_PERMISSION_CATALOG_GROUPS.map((g) => ({
      group: g.group,
      label: g.label,
      permissions: g.permissions.map((permission) => {
        const definition = PERMISSION_BY_ID.get(permission);
        if (!definition) throw new Error("Permission catalog is internally inconsistent");
        return {
          id: definition.id,
          label: definition.label,
          description: definition.description,
          compatibleScopes: definition.compatibleScopes,
          defaultBaseRoles: definition.defaultBaseRoles,
          allowedCustomRoleBases: definition.allowedCustomRoleBases,
          active: definition.active,
          deprecated: definition.deprecated,
          platformOnly: definition.platformOnly,
          tenantGrantable: definition.tenantGrantable,
          delegableByTenantAdmin: definition.delegableByTenantAdmin,
          contractVersion: definition.contractVersion,
        };
      }),
    }));

    const baseRoleDefaults = Object.fromEntries(
      TENANT_ROLE_BASES.map((role) => [role, [...BASE_ROLE_DEFAULTS[role]]]),
    );

    res.status(200).json({
      success: true,
      data: { contractVersion: PERMISSION_CONTRACT_VERSION, groups, baseRoleDefaults },
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

    if (!isBaseRole(req.auth.role)) {
      throw new AppError(403, "PERMISSION_REQUIRED", "Invalid base role");
    }
    const evaluator = getPermissionEvaluator();
    const resolved = await evaluator.resolve({
      actorId: req.auth.userId,
      tenantId: req.tenantId,
      baseRole: req.auth.role,
    });

    res.status(200).json({
      success: true,
      data: {
        permissions: Array.from(resolved.permissions),
        grants: Object.fromEntries(resolved.grants),
        baseRole: resolved.baseRole,
        customRoleId: resolved.customRoleId,
        customRoleState: resolved.customRoleState,
        roleVersion: resolved.roleVersion,
      },
    });
  } catch (error) {
    next(error);
  }
}
