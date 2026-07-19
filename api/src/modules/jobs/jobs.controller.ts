import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { BAD_REQUEST } from "../../common/errors/errorCodes.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import {
  enqueueCustomerJob,
  getPlatformJobMetrics,
  getPlatformJobStatus,
  replayPlatformJob,
} from "./jobs.service.js";

function operationContext(req: Request): OperationAuthorizationContext {
  const actor = requireAuthenticatedAuditActor({
    tenantId: req.tenantId,
    actorId: req.auth?.userId,
    actorEmail: req.auth?.email,
    actorRole: req.auth?.role,
  });
  return {
    tenantId: actor.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    traceId: req.traceId,
    requestId: req.requestId,
  };
}

function handleJobError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      error: error.code,
    });
    return;
  }
  next(error);
}

/**
 * GET /platform/jobs/metrics
 * Queue depth/active/delayed/retry/failed metrics. Super Admin only.
 */
export async function getJobMetricsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const metrics = await getPlatformJobMetrics(operationContext(req));
    res.status(200).json({ success: true, data: metrics });
  } catch (error) {
    handleJobError(error, res, next);
  }
}

/**
 * GET /platform/jobs/:jobId
 * Inspect a single job's status. Super Admin only.
 */
export async function getJobStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const jobId = String(req.params.jobId);
    if (!jobId) {
      throw new AppError(400, BAD_REQUEST, "jobId is required");
    }
    const status = await getPlatformJobStatus(jobId, operationContext(req));
    if (!status) {
      res.status(404).json({ success: false, message: "job not found" });
      return;
    }
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    handleJobError(error, res, next);
  }
}

/**
 * POST /platform/jobs/:jobId/replay
 * Replay a dead-lettered job. Super Admin only.
 */
export async function replayJobController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const jobId = String(req.params.jobId);
    const ok = await replayPlatformJob(jobId, operationContext(req));
    if (!ok) {
      res.status(409).json({
        success: false,
        message: "job not replayable (not found or not failed)",
      });
      return;
    }
    res.status(202).json({ success: true, data: { replayed: jobId } });
  } catch (error) {
    handleJobError(error, res, next);
  }
}

/**
 * POST /jobs/enqueue
 * Authenticated enqueue. Tenant + actor are DERIVED from the auth context,
 * never from the request body, so callers cannot spoof another tenant.
 */
export async function enqueueJobController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const result = await enqueueCustomerJob(
      req.body as Record<string, unknown>,
      operationContext(req),
    );
    if (!result.ok) {
      throw new AppError(
        422,
        "JOB_ENVELOPE_INVALID",
        result.error ?? "invalid job envelope",
      );
    }

    res.status(202).json({ success: true, data: result });
  } catch (error) {
    handleJobError(error, res, next);
  }
}
