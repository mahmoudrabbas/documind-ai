import type { NextFunction, Request, Response } from "express";
import TenantModel from "../../db/models/tenant.model.js";
import { PLATFORM_TENANT_SLUG } from "../auth/platformTenant.js";
import { AppError } from "../errors/AppError.js";
import { FORBIDDEN, UNAUTHORIZED } from "../errors/errorCodes.js";

export async function requirePlatformTenant(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) {
      throw new AppError(401, UNAUTHORIZED, "Authentication required");
    }

    if (req.auth.role !== "SUPER_ADMIN") {
      throw new AppError(403, FORBIDDEN, "Platform access requires Super Admin");
    }

    const tenant = await TenantModel.findById(req.auth.tenantId)
      .select("slug status")
      .lean()
      .exec();

    if (
      !tenant ||
      tenant.slug !== PLATFORM_TENANT_SLUG ||
      tenant.status !== "active"
    ) {
      throw new AppError(403, FORBIDDEN, "Platform tenant access required");
    }

    req.tenantId = tenant._id.toString();
    next();
  } catch (error) {
    next(error);
  }
}
