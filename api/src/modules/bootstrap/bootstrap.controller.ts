import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { bootstrapSuperAdmin } from "./bootstrap.service.js";

export async function bootstrapSuperAdminController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await bootstrapSuperAdmin(req.body, req.get("X-Super-Admin-Bootstrap-Key"));
    res.status(201).json({ success: true, message: "Initial Super Admin created successfully.", data: { user } });
  } catch (error) {
    if (error instanceof AppError) { res.status(error.statusCode).json({ success: false, message: error.message, error: error.code, details: error.details ?? null }); return; }
    next(error);
  }
}
