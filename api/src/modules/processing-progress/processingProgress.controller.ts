import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { BAD_REQUEST } from "../../common/errors/errorCodes.js";
import {
  getProcessingStatus,
  getProcessingHistory,
  initiateProcessingRun,
  retryProcessingStage,
  reprocessDocument,
  cancelProcessing,
  getFailedProcessingDashboard,
  getAllFailedProcessingDashboard,
} from "./processingProgress.service.js";
import type { RetryStageInput, CancelProcessingInput } from "./processingProgress.types.js";

function requireAuth(req: Request): { tenantId: string; userId: string } {
  if (!req.auth || !req.tenantId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  return { tenantId: req.tenantId, userId: req.auth.userId };
}

function requireSuperAdminAuth(req: Request): { tenantId: string; userId: string } {
  if (!req.auth || !req.tenantId) {
    throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  }
  if (req.auth.role !== "SUPER_ADMIN" && req.auth.role !== "COMPANY_ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  return { tenantId: req.tenantId, userId: req.auth.userId };
}

function extractDocumentId(req: Request): string {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id) throw new AppError(400, BAD_REQUEST, "Missing document id parameter");
  return id;
}

function isSuperAdmin(req: Request): boolean {
  return req.auth?.role === "SUPER_ADMIN";
}

export async function getProcessingStatusController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenantId, userId } = requireAuth(req);
    const documentId = extractDocumentId(req);
    const result = await getProcessingStatus(tenantId, documentId, userId, isSuperAdmin(req));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getProcessingHistoryController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenantId, userId } = requireAuth(req);
    const documentId = extractDocumentId(req);
    const page = parseInt(String(req.query.page || "1"), 10);
    const pageSize = parseInt(String(req.query.pageSize || "10"), 10);
    const result = await getProcessingHistory(
      tenantId,
      documentId,
      { page, pageSize },
      userId,
      isSuperAdmin(req),
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function initiateProcessingController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenantId, userId } = requireAuth(req);
    const documentId = extractDocumentId(req);
    const version = req.body?.version ? parseInt(String(req.body.version), 10) : undefined;
    const result = await initiateProcessingRun(tenantId, documentId, version ?? 1, userId, isSuperAdmin(req));
    res.json({ success: true, data: { runId: result.id, status: result.status, message: "Processing initiated" } });
  } catch (error) {
    next(error);
  }
}

export async function retryProcessingStageController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenantId, userId } = requireAuth(req);
    const documentId = extractDocumentId(req);
    const input: RetryStageInput = {
      stageName: req.body?.stageName,
    };
    const result = await retryProcessingStage(tenantId, documentId, input, userId, isSuperAdmin(req));
    res.json({ success: true, message: "Processing retry queued", data: result });
  } catch (error) {
    next(error);
  }
}

export async function reprocessDocumentController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenantId, userId } = requireAuth(req);
    const documentId = extractDocumentId(req);
    const result = await reprocessDocument(tenantId, documentId, userId, isSuperAdmin(req));
    res.json({ success: true, message: "Document reprocessing initiated", data: result });
  } catch (error) {
    next(error);
  }
}

export async function cancelProcessingController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenantId, userId } = requireAuth(req);
    const documentId = extractDocumentId(req);
    const input: CancelProcessingInput = {
      reason: req.body?.reason,
    };
    const result = await cancelProcessing(tenantId, documentId, input, userId, isSuperAdmin(req));
    res.json({ success: true, message: "Processing canceled", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getFailedProcessingDashboardController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireSuperAdminAuth(req);
    const tenantId = req.tenantId!;
    const page = parseInt(String(req.query.page || "1"), 10);
    const pageSize = parseInt(String(req.query.pageSize || "20"), 10);
    const result = await getFailedProcessingDashboard(tenantId, page, pageSize);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getAllFailedProcessingDashboardController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireSuperAdminAuth(req);
    const page = parseInt(String(req.query.page || "1"), 10);
    const pageSize = parseInt(String(req.query.pageSize || "20"), 10);
    const result = await getAllFailedProcessingDashboard(page, pageSize);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
