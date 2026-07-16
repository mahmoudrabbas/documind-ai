import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { BAD_REQUEST } from "../../common/errors/errorCodes.js";
import { getApiJobDispatcher } from "./jobDispatcher.js";

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
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const metrics = await getApiJobDispatcher().getMetrics();
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
    const status = await getApiJobDispatcher().getJobStatus(jobId);
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
    const ok = await getApiJobDispatcher().replayJob(jobId);
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

    const body = req.body as Record<string, unknown>;
    const envelope = {
      jobType: body.jobType,
      tenantId: req.auth.tenantId,
      actorId: req.auth.userId,
      traceId: body.traceId,
      idempotencyKey: body.idempotencyKey,
      payload: body.payload,
      createdAt: new Date().toISOString(),
      priority: body.priority,
      scheduledFor: body.scheduledFor,
      displayName: body.displayName,
    };

    const result = await getApiJobDispatcher().enqueue(envelope);
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
