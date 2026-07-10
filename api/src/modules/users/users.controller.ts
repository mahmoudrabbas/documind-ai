import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { inviteUser, listUsers } from "./users.service.js";

export async function inviteUserController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const result = await inviteUser(req.body, req.tenantId, req.auth.userId);

    res.status(201).json({
      success: true,
      message: "User invitation created successfully. An email has been sent to the invited user.",
      data: result,
    });
  } catch (error) {
    handleUserError(error, res, next);
  }
}

export async function listUsersController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const result = await listUsers(req.query, req.tenantId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleUserError(error, res, next);
  }
}

function handleUserError(error: unknown, res: Response, next: NextFunction) {
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
