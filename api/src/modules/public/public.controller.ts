import type { NextFunction, Request, Response } from "express";
import { getTenantLogo, listPublicPackages } from "./public.service.js";

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

export async function getLogoController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { tenantId, file } = req.params as {
      tenantId: string;
      file: string;
    };
    const asset = await getTenantLogo(tenantId, file);

    res
      .status(200)
      .set("Content-Type", asset.contentType)
      .set("Cache-Control", "public, max-age=31536000, immutable")
      .set("Content-Disposition", "inline")
      .set("X-Content-Type-Options", "nosniff")
      .send(asset.buffer);
  } catch (error) {
    next(error);
  }
}
