import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { VALIDATION_ERROR } from "../../common/errors/errorCodes.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import {
  getTenantSettings,
  updateTenantSettings,
  uploadTenantLogo,
} from "./settings.service.js";
import type { SettingsOperationContext } from "./settings.types.js";

function context(req: Request): SettingsOperationContext {
  if (!req.auth || !req.tenantId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }

  const actor = requireAuthenticatedAuditActor({
    tenantId: req.tenantId,
    actorId: req.auth.userId,
    actorEmail: req.auth.email,
    actorRole: req.auth.role,
  });

  return {
    tenantId: actor.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    actorKind: actor.actorKind,
    traceId: req.traceId,
    requestId: req.requestId,
  };
}

export async function getSettingsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    res.status(200).json({
      success: true,
      data: await getTenantSettings(req.tenantId),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSettingsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const operationContext = context(req);
    res.status(200).json({
      success: true,
      message: "Tenant settings updated successfully.",
      data: await updateTenantSettings(
        operationContext.tenantId,
        req.body,
        operationContext,
      ),
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadLogoController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const operationContext = context(req);
    if (!req.file) {
      throw new AppError(400, VALIDATION_ERROR, "A logo image file is required");
    }

    res.status(200).json({
      success: true,
      message: "Logo uploaded successfully.",
      data: await uploadTenantLogo(
        operationContext.tenantId,
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
        operationContext,
      ),
    });
  } catch (error) {
    next(error);
  }
}
