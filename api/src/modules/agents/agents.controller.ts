import { z } from "zod";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import {
  UNAUTHORIZED,
  VALIDATION_ERROR,
} from "../../common/errors/errorCodes.js";
import {
  startAgentRun,
  resumeAgentRun,
  getRunDetails,
  searchRuns,
  expireStaleApprovals,
} from "./agents.service.js";
import { listApprovals } from "./agents.repository.js";
import {
  validateStartRun,
  validateResumeApproval,
  validateListRuns,
  validateListApprovals,
  assertValidObjectId,
} from "./agents.validator.js";

function handleAgentError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof AppError) {
    res
      .status(error.statusCode)
      .json({
        success: false,
        message: error.message,
        error: error.code,
        details: error.details ?? null,
      });
    return;
  }
  if (error instanceof z.ZodError) {
    res
      .status(400)
      .json({
        success: false,
        message: "Validation failed",
        error: VALIDATION_ERROR,
        details: error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          message: issue.message,
        })),
      });
    return;
  }
  next(error);
}

export async function startRunController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, UNAUTHORIZED, "Authentication required");
    }
    const payload = validateStartRun(req.body);
    const traceId = req.traceId ?? String(Math.random()).slice(2);
    const requestId = req.requestId ?? String(Math.random()).slice(2);
    const result = await startAgentRun({
      tenantId: req.tenantId,
      actorId: req.auth.userId,
      workflowName: payload.workflowName,
      agentName: payload.agentName,
      input: payload.input,
      modelProvider: payload.modelProvider,
      modelName: payload.modelName,
      promptVersion: payload.promptVersion ?? null,
      promptVersionId: payload.promptVersionId ?? null,
      toolVersionSnapshot: payload.toolVersionSnapshot ?? null,
      traceId,
      requestId,
      maxSteps: payload.maxSteps,
      maxToolCalls: payload.maxToolCalls,
      maxTokens: payload.maxTokens,
      budgetMs: payload.budgetMs,
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    handleAgentError(error, res, next);
  }
}

export async function getRunController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId)
      throw new AppError(401, UNAUTHORIZED, "Authentication required");
    const runId = Array.isArray(req.params.runId)
      ? req.params.runId[0]
      : req.params.runId;
    assertValidObjectId(runId, "runId");
    const result = await getRunDetails(req.tenantId, runId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleAgentError(error, res, next);
  }
}

export async function listRunsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId)
      throw new AppError(401, UNAUTHORIZED, "Authentication required");
    const filter = validateListRuns(req.query as Record<string, unknown>);
    const result = await searchRuns(
      req.tenantId,
      {
        page: filter.page,
        pageSize: filter.pageSize,
        status: filter.status,
        agentName: filter.agentName,
        traceId: filter.traceId,
      },
      false,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleAgentError(error, res, next);
  }
}

export async function listRunsAdminController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth)
      throw new AppError(401, UNAUTHORIZED, "Authentication required");
    const filter = validateListRuns(req.query as Record<string, unknown>);
    const result = await searchRuns(
      req.tenantId ?? "",
      {
        page: filter.page,
        pageSize: filter.pageSize,
        status: filter.status,
        agentName: filter.agentName,
        traceId: filter.traceId,
      },
      true,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleAgentError(error, res, next);
  }
}

export async function resumeApprovalController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId)
      throw new AppError(401, UNAUTHORIZED, "Authentication required");
    const runId = Array.isArray(req.params.runId)
      ? req.params.runId[0]
      : req.params.runId;
    const approvalId = Array.isArray(req.params.approvalId)
      ? req.params.approvalId[0]
      : req.params.approvalId;
    assertValidObjectId(runId, "runId");
    assertValidObjectId(approvalId, "approvalId");
    const payload = validateResumeApproval(req.body);
    const result = await resumeAgentRun(
      req.tenantId,
      req.auth.userId,
      runId,
      approvalId,
      payload.decision,
      payload.decisionNote,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleAgentError(error, res, next);
  }
}

export async function listApprovalsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId)
      throw new AppError(401, UNAUTHORIZED, "Authentication required");
    const filter = validateListApprovals(req.query as Record<string, unknown>);
    const result = await listApprovals(req.tenantId, {
      page: filter.page,
      pageSize: filter.pageSize,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    handleAgentError(error, res, next);
  }
}

export async function expireApprovalsController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const count = await expireStaleApprovals();
    res.status(200).json({ success: true, data: { expired: count } });
  } catch (error) {
    handleAgentError(error, res, next);
  }
}
