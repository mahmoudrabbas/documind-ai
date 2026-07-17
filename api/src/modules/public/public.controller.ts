import type { NextFunction, Request, Response } from "express";
import { listPublicPackages } from "./public.service.js";

export async function activePackagesController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const packages = await listPublicPackages();
    res.status(200).json({ success: true, data: packages });
  } catch (error) {
    next(error);
  }
}
