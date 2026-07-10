import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { validateListTenantsInput } from "./admin.validator.js";
import { listTenants } from "./admin.service.js";

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
