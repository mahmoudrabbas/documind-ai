import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { UNAUTHORIZED } from "../../common/errors/errorCodes.js";
import { requireAuthenticatedAuditActor } from "../../common/observability/auditActor.js";
import type { CopilotService } from "./copilot.service.js";
import { planQuerySchema, executeStepSchema, confirmStepSchema, cancelPlanSchema } from "./copilot.validator.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { enrichToolContext, type ToolContextBase } from "./context/copilotContext.js";
import type { ToolContext } from "./copilot.types.js";
import { planEventBus } from "./events/planEventBus.js";

const SSE_HEARTBEAT_MS = 15_000;

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

function requestLanguage(req: Request): string | undefined {
  const header = req.headers["accept-language"];
  if (typeof header === "string" && header.trim().length > 0) {
    return header.trim().startsWith("ar") ? "ar" : "en";
  }
  return undefined;
}

async function toolContext(req: Request): Promise<ToolContext> {
  const actor = operationContext(req);
  const base: ToolContextBase = {
    tenantId: actor.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    traceId: actor.traceId ?? "",
    requestId: actor.requestId ?? "",
  };
  const body = (req.body ?? {}) as {
    currentDocumentId?: string;
    selectedEntityId?: string;
  };
  return enrichToolContext(base, {
    language: requestLanguage(req),
    currentDocumentId: body.currentDocumentId,
    selectedEntityId: body.selectedEntityId,
  });
}

export function createCopilotController(service: CopilotService) {
  async function generatePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }
      const query = planQuerySchema.parse(req.body);
      const ctx = await toolContext(req);
      const result = await service.generatePlan(query, ctx);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function executeStep(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }
      const input = executeStepSchema.parse(req.body);
      const ctx = await toolContext(req);
      const result = await service.executeStep(input.planId, input.stepIndex, input.parameters ?? null, ctx);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function confirmStep(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }
      const input = confirmStepSchema.parse(req.body);
      const ctx = await toolContext(req);
      const result = await service.confirmStep(input.planId, input.stepIndex, input.decision, ctx);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async function getPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }
      const planId = req.params.planId as string;
      const plan = await service.getPlan(planId, req.tenantId);
      if (!plan) throw new AppError(404, "NOT_FOUND", "Plan not found");
      res.status(200).json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  }

  async function cancelPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }
      const { planId } = cancelPlanSchema.parse(req.params);
      const ctx = operationContext(req);
      const result = await service.cancelPlan(planId, ctx);
      res.status(200).json({ success: true, data: { cancelled: result } });
    } catch (err) {
      next(err);
    }
  }

  async function getSuggestions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }
      const ctx = operationContext(req);
      const suggestions = await service.getSuggestions(req.tenantId, ctx.actorRole);
      res.status(200).json({ success: true, data: suggestions });
    } catch (err) {
      next(err);
    }
  }

  async function getGuidePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }
      const planId = req.params.planId as string;
      const guide = await service.getGuidePlan(planId, req.tenantId);
      if (!guide) throw new AppError(404, "NOT_FOUND", "Plan not found");
      res.status(200).json({ success: true, data: guide });
    } catch (err) {
      next(err);
    }
  }

  async function streamPlanEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.auth || !req.tenantId) {
        throw new AppError(401, UNAUTHORIZED, "Authentication required");
      }
      const planId = req.params.planId as string;
      const plan = await service.getPlan(planId, req.tenantId);
      if (!plan) throw new AppError(404, "NOT_FOUND", "Plan not found");

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const writeEvent = (event: unknown): void => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      for (const event of planEventBus.replay(planId, req.tenantId)) {
        writeEvent(event);
      }

      const unsubscribe = planEventBus.subscribe(planId, (event) => {
        writeEvent(event);
      });

      const heartbeat = setInterval(() => {
        res.write(": ping\n\n");
      }, SSE_HEARTBEAT_MS);

      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    } catch (err) {
      next(err);
    }
  }

  return {
    generatePlan,
    executeStep,
    confirmStep,
    getPlan,
    getGuidePlan,
    cancelPlan,
    getSuggestions,
    streamPlanEvents,
  };
}
