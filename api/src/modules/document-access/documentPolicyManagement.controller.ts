import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { getDocumentPolicyManagementService, type PolicyManagementContext } from "./documentPolicyManagement.service.js";

const service = getDocumentPolicyManagementService();
function context(request: Request): PolicyManagementContext {
  if (!request.tenantId || !request.auth?.userId) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  return { tenantId: request.tenantId, actorId: request.auth.userId };
}
function id(request: Request) { const value = request.params.id; if (typeof value !== "string") throw new AppError(400, "VALIDATION_ERROR", "Document ID is required"); return value; }
function key(request: Request) { const value = request.header("Idempotency-Key"); if (!value) throw new AppError(400, "VALIDATION_ERROR", "Idempotency-Key is required"); return value; }
function send(error: unknown, response: Response, next: NextFunction) { if (error instanceof AppError) response.status(error.statusCode).json({ success: false, message: error.message, error: error.code, details: null }); else next(error); }

export async function getActivePolicyController(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await service.getActive(id(req), context(req)) }); } catch (e) { send(e, res, next); } }
export async function getPolicyHistoryController(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await service.history(id(req), req.query, context(req)) }); } catch (e) { send(e, res, next); } }
export async function getPolicyAssignmentsController(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await service.assignments(id(req), context(req)) }); } catch (e) { send(e, res, next); } }
export async function getPolicyPropagationStatusController(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await service.propagationStatus(id(req), context(req)) }); } catch (e) { send(e, res, next); } }
export async function effectivePolicyAccessController(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await service.effectiveAccess(id(req), req.body, context(req)) }); } catch (e) { send(e, res, next); } }
export async function previewPolicyController(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await service.preview(id(req), req.body, context(req)) }); } catch (e) { send(e, res, next); } }
export async function applyPolicyController(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await service.apply(id(req), req.body, key(req), context(req)) }); } catch (e) { send(e, res, next); } }
export async function batchPreviewPolicyController(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await service.batchPreview(req.body, context(req)) }); } catch (e) { send(e, res, next); } }
export async function batchApplyPolicyController(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await service.batchApply(req.body, key(req), context(req)) }); } catch (e) { send(e, res, next); } }
export async function policyEditorOptionsController(req: Request, res: Response, next: NextFunction) { try { res.json({ success: true, data: await service.policyEditorOptions(id(req), context(req)) }); } catch (e) { send(e, res, next); } }
