import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import {
  createRole,
  listRoles,
  updateRole,
  deleteRole,
} from "./roles.service.js";
import { validateDeleteRoleInput } from "./roles.validator.js";
import mongoose from "mongoose";
import { MALFORMED_OBJECT_ID } from "../../common/errors/errorCodes.js";

export async function createRoleController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const result = await createRole(req.body, req.tenantId, req.auth.userId);

    res.status(201).json({
      success: true,
      message: "Role created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function listRolesController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const result = await listRoles(req.tenantId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateRoleController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
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

    const result = await updateRole(req.body, req.tenantId, roleId, req.auth.userId);

    res.status(200).json({
      success: true,
      message: "Role updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteRoleController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
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
    if (!mongoose.isObjectIdOrHexString(roleId)) {
      throw new AppError(400, MALFORMED_OBJECT_ID, "Malformed identifier");
    }

    const { version } = validateDeleteRoleInput(req.body);
    const result = await deleteRole(req.tenantId, roleId, version);

    res.status(200).json({
      success: true,
      message: "Role deleted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
