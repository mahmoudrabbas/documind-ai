import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import {
  registerTenantAndAdmin,
  resendVerificationEmail,
  verifyEmail,
} from "./auth.service.js";

export async function registerController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await registerTenantAndAdmin(req.body);

    res.status(201).json({
      success: true,
      message: "Tenant and company admin created successfully. Please verify your email to activate the account.",
      data: result,
    });
  } catch (error) {
    handleAuthError(error, res, next);
  }
}

export async function verifyEmailController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await verifyEmail(req.body);

    res.status(200).json({
      success: true,
      message: "Email verified successfully. You can now sign in.",
      data: result,
    });
  } catch (error) {
    handleAuthError(error, res, next);
  }
}

export async function resendVerificationEmailController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await resendVerificationEmail(req.body);

    res.status(200).json(result);
  } catch (error) {
    handleAuthError(error, res, next);
  }
}

function handleAuthError(error: unknown, res: Response, next: NextFunction) {
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
