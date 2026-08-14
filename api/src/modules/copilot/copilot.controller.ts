import { AppError } from "../../common/errors/AppError.js";
import { BAD_REQUEST, NOT_FOUND } from "../../common/errors/errorCodes.js";
import type { Request, Response, NextFunction } from "express";
import { copilotMessageSchema, copilotGuideResolveSchema, copilotActionSchema, copilotActionConfirmSchema } from "./copilot.validator.js";
import { processCopilotMessage, resolveGuideFlow, createActionPlan, resumeCopilotAction } from "./copilot.service.js";
import { getRunDetails } from "../agents/agents.service.js";
import { authorizeTenantOperation } from "../permissions/permissions.operation.js";
import { Permission } from "../permissions/permissions.catalog.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { listAvailableGuideFlows } from "./guide/guide.service.js";
import {
  deriveGuideFlowAudience,
  getFlowCategory,
  getFlowKeywords,
} from "./guide/guideIntent.js";
import { getGuideFlow } from "./guide/guideFlows.js";
import { localizeGuideKey } from "./guide/guide.i18n.js";
import type { ChatWorkflowId } from "../agents/chatWorkflow.js";
import { getPermissionEvaluator } from "../permissions/permissions.evaluator.js";
import { decidePermission } from "../permissions/permissions.decision.js";
import type { ResolvedPermissions } from "../permissions/permissions.types.js";
import { getCopilotToolRegistry, getCopilotSupervisorPersistence } from "./copilotComposition.js";
import { ObjectId } from "mongodb";
import { emitCopilotEvent } from "./socket/copilotSocketEmitter.js";

interface AuthenticatedRequest extends Request {
  auth: {
    userId: string;
    email: string;
    role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE";
    tenantId: string;
  };
  tenantId: string;
  traceId: string;
  requestId: string;
}

async function buildExecutionContext(
  authReq: AuthenticatedRequest,
  locale: "en" | "ar",
): Promise<{
  requestId: string;
  traceId: string;
  tenantId: string;
  actorId: string;
  actorRole: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE";
  actorEmail: string;
  conversationId: string;
  workflowId: ChatWorkflowId;
  permissions: readonly string[];
  resolved: ResolvedPermissions;
  locale: "en" | "ar";
}> {
  const conversationId = new ObjectId().toString();
  const evaluator = getPermissionEvaluator();

  // F-006: the execution context must carry every permission the registered
  // action tools (and CHAT_CREATE) require, evaluated against the actor, so
  // the runtime's ToolPermissionGuardrail allows the planned tool.
  //
  // Resolve the actor's full permission set exactly once, then derive each
  // candidate permission synchronously from the resolved grants. Evaluating
  // per-permission re-runs the whole DB-backed resolution graph for every
  // candidate, which is what made /copilot/guide/resolve ~5s.
  const candidatePermissions = new Set<string>([Permission.CHAT_CREATE]);
  for (const tool of getCopilotToolRegistry().list()) {
    if (tool.schema.requiredPermission) {
      candidatePermissions.add(tool.schema.requiredPermission);
    }
  }
  const resolved = await evaluator.resolve({
    tenantId: authReq.tenantId,
    actorId: authReq.auth.userId,
    baseRole: authReq.auth.role,
  });
  const permissions: string[] = [];
  for (const permission of candidatePermissions) {
    const result = decidePermission(
      {
        tenantId: authReq.tenantId,
        actorId: authReq.auth.userId,
        baseRole: authReq.auth.role,
        permission,
      },
      resolved,
    );
    if (result.allowed) permissions.push(permission);
  }

  return {
    requestId: authReq.requestId,
    traceId: authReq.traceId,
    tenantId: authReq.tenantId,
    actorId: authReq.auth.userId,
    actorRole: authReq.auth.role,
    actorEmail: authReq.auth.email,
    conversationId,
    workflowId: "guider-v1",
    permissions,
    resolved,
    locale,
  };
}

export async function handleCopilotMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const parseResult = copilotMessageSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new AppError(400, BAD_REQUEST, "Invalid request body", parseResult.error.issues);
    }

    const inputContext: OperationAuthorizationContext = {
      tenantId: authReq.tenantId,
      actorId: authReq.auth.userId,
      actorEmail: authReq.auth.email,
      actorRole: authReq.auth.role,
      traceId: authReq.traceId,
      requestId: authReq.requestId,
    };

    await authorizeTenantOperation(inputContext, Permission.CHAT_CREATE);

    const executionContext = await buildExecutionContext(authReq, parseResult.data.locale);

    const result = await processCopilotMessage(parseResult.data, executionContext);

    // Best-effort lifecycle events (§15). Guide sessions are ephemeral REST
    // payloads; only action runs carry a room key (`copilot:<runId>`).
    if (result.actionPlan) {
      emitCopilotEvent(result.actionPlan.runId, "action.plan.created", result.actionPlan);
      if (result.actionPlan.requiresConfirmation) {
        emitCopilotEvent(result.actionPlan.runId, "action.awaiting_confirmation", {
          runId: result.actionPlan.runId,
          approvalId: result.approvalId,
          risk: result.actionPlan.risk,
        });
      }
    } else if (result.guideSession) {
      emitCopilotEvent(result.guideSession.sessionId, "guide.session.created", {
        flowId: result.guideSession.flowId,
        steps: result.guideSession.steps.length,
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function handleGetGuideFlows(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const inputContext: OperationAuthorizationContext = {
      tenantId: authReq.tenantId,
      actorId: authReq.auth.userId,
      actorEmail: authReq.auth.email,
      actorRole: authReq.auth.role,
      traceId: authReq.traceId,
      requestId: authReq.requestId,
    };

    await authorizeTenantOperation(inputContext, Permission.CHAT_READ);

    const rawLocale =
      typeof req.query.locale === "string" ? req.query.locale : "en";
    const locale = rawLocale === "ar" ? "ar" : "en";

    const flows = await listAvailableGuideFlows({
      tenantId: authReq.tenantId,
      actorId: authReq.auth.userId,
      actorRole: authReq.auth.role,
      locale,
    });

    const flowDetails = flows.map((flowId) => {
      const flow = getGuideFlow(flowId);
      return {
        flowId: flow?.flowId ?? flowId,
        title: flow ? localizeGuideKey(flow.titleKey, locale) : flowId,
        category: getFlowCategory(flowId),
        audience: flow ? deriveGuideFlowAudience(flow) : "all",
        keywords: getFlowKeywords(flowId),
        available: true,
      };
    });

    res.json({ success: true, data: { flows: flowDetails } });
  } catch (error) {
    next(error);
  }
}

export async function handleResolveGuideFlow(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const parseResult = copilotGuideResolveSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new AppError(400, BAD_REQUEST, "Invalid request body", parseResult.error.issues);
    }

    const inputContext: OperationAuthorizationContext = {
      tenantId: authReq.tenantId,
      actorId: authReq.auth.userId,
      actorEmail: authReq.auth.email,
      actorRole: authReq.auth.role,
      traceId: authReq.traceId,
      requestId: authReq.requestId,
    };

    await authorizeTenantOperation(inputContext, Permission.CHAT_READ);

    const executionContext = await buildExecutionContext(authReq, parseResult.data.locale);

    const session = await resolveGuideFlow(
      { flowId: parseResult.data.flowId, locale: parseResult.data.locale },
      executionContext,
      executionContext.resolved,
    );

    if (!session) {
      throw new AppError(404, NOT_FOUND, "Guide flow not available or permission denied");
    }

    res.json({ success: true, data: { guideSession: session } });
  } catch (error) {
    next(error);
  }
}

export async function handleCreateActionPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const parseResult = copilotActionSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new AppError(400, BAD_REQUEST, "Invalid request body", parseResult.error.issues);
    }

    const inputContext: OperationAuthorizationContext = {
      tenantId: authReq.tenantId,
      actorId: authReq.auth.userId,
      actorEmail: authReq.auth.email,
      actorRole: authReq.auth.role,
      traceId: authReq.traceId,
      requestId: authReq.requestId,
    };

    await authorizeTenantOperation(inputContext, Permission.CHAT_CREATE);

    const executionContext = await buildExecutionContext(authReq, parseResult.data.locale);

    const idempotencyKey = req.header("Idempotency-Key")?.trim();

    const actionPlan = await createActionPlan(parseResult.data, executionContext, {
      idempotencyKey: idempotencyKey || undefined,
    });
    res.json({ success: true, data: { actionPlan } });
  } catch (error) {
    next(error);
  }
}

export async function handleConfirmAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const parseResult = copilotActionConfirmSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new AppError(400, BAD_REQUEST, "Invalid request body", parseResult.error.issues);
    }

    const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;
    const { decision, note } = parseResult.data;

    const inputContext: OperationAuthorizationContext = {
      tenantId: authReq.tenantId,
      actorId: authReq.auth.userId,
      actorEmail: authReq.auth.email,
      actorRole: authReq.auth.role,
      traceId: authReq.traceId,
      requestId: authReq.requestId,
    }

    const result = await resumeCopilotAction(
      runId,
      { decision, approvalId: parseResult.data.approvalId, note },
      inputContext,
      {
        persistence: getCopilotSupervisorPersistence(),
        toolRegistry: getCopilotToolRegistry(),
      },
    );

    // Live confirmation result (§15): executed/failed is derived from the
    // persisted run state, so the socket event and REST status never diverge.
    emitCopilotEvent(
      runId,
      result.status === "completed" ? "action.executed" : "action.failed",
      { runId, status: result.status, run: result },
    );
    emitCopilotEvent(runId, "copilot.completed", { runId, status: result.status });

    res.json({ success: true, data: { run: result } });
  } catch (error) {
    next(error);
  }
}

export async function handleGetActionStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;

    const inputContext: OperationAuthorizationContext = {
      tenantId: authReq.tenantId,
      actorId: authReq.auth.userId,
      actorEmail: authReq.auth.email,
      actorRole: authReq.auth.role,
      traceId: authReq.traceId,
      requestId: authReq.requestId,
    }

    await authorizeTenantOperation(inputContext, Permission.CHAT_READ);

    const result = await getRunDetails(authReq.tenantId, runId, inputContext);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}