import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import {
  validateListTenantsInput,
  validateTenantId,
  validateUpdateTenantInput,
} from "./admin.validator.js";
import { getTenant, listTenants, updateTenant } from "./admin.service.js";

function handleAdminError(error: unknown, res: Response, next: NextFunction) {
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

export async function getTenantController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await getTenant(validateTenantId(req.params));
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleAdminError(error, res, next);
  }
}

export async function listTenantsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
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
  } catch (error) {
    handleAdminError(error, res, next);
  }
}

export async function updateTenantController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
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
  } catch (error) {
    handleAdminError(error, res, next);
  }
}
