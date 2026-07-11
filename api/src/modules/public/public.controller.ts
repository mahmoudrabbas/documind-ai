import type { NextFunction, Request, Response } from "express";
import { listActivePackages } from "./public.service.js";

export async function activePackagesController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const packages = await listActivePackages();
    res.status(200).json({ success: true, data: packages });
  } catch (error) {
    next(error);
  }
}
