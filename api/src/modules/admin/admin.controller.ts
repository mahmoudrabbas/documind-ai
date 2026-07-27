import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import {
  validateListTenantsInput,
  validateTenantId,
  validateUpdateTenantInput,
  validateLifecycleInput,
  validatePreviewInput,
} from "./admin.validator.js";
import {
  getTenant,
  getTenantDetail,
  listTenants,
  updateTenant,
  suspendTenant,
  reinstateTenant,
  previewTenantLifecycle,
} from "./admin.service.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";

function operationContext(req: Request): OperationAuthorizationContext {
  const resolved = requireAuthenticatedAuditActor({
    tenantId: req.tenantId,
    actorId: req.auth?.userId,
    actorEmail: req.auth?.email,
    actorRole: req.auth?.role,
  });
  return {
    tenantId: resolved.tenantId,
    actorId: resolved.actorId,
    actorEmail: resolved.actorEmail,
    actorRole: resolved.actorRole,
    traceId: req.traceId,
    requestId: req.requestId,
  };
}

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
    const result = await getTenant(
      validateTenantId(req.params),
      operationContext(req),
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleAdminError(error, res, next);
  }
}

export async function getTenantDetailController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await getTenantDetail(
      validateTenantId(req.params),
      operationContext(req),
    );
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
    const result = await listTenants(input, operationContext(req));

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
    const result = await updateTenant(input, operationContext(req));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleAdminError(error, res, next);
  }
}

export async function suspendTenantController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const input = validateLifecycleInput(req.params, req.body);
    const result = await suspendTenant(input, operationContext(req));

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleAdminError(error, res, next);
  }
}

export async function reinstateTenantController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const input = validateLifecycleInput(req.params, req.body);
    const result = await reinstateTenant(input, operationContext(req));

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleAdminError(error, res, next);
  }
}

export async function previewSuspendController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const input = validatePreviewInput(req.params);
    const result = await previewTenantLifecycle(
      input,
      "suspended",
      operationContext(req),
    );

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleAdminError(error, res, next);
  }
}

export async function previewReinstateController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const input = validatePreviewInput(req.params);
    const result = await previewTenantLifecycle(
      input,
      "active",
      operationContext(req),
    );

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleAdminError(error, res, next);
  }
}
