import { createHash } from "node:crypto";
import { Types as MongooseTypes } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import { BAD_REQUEST, NOT_FOUND } from "../../common/errors/errorCodes.js";
import type { AgentExecutionContext } from "../agents/agentExecutionContext.js";
import type { SupervisorRunInput, SupervisorRuntime } from "../agents/supervisorRuntime.js";
import { listApprovals } from "../agents/agents.repository.js";
import type { RunRecord } from "../agents/agents.types.js";
import type { ResolvedPermissions } from "../permissions/permissions.types.js";
import type { AgentRunContext } from "../agents/agentRunContext.js";
import type { SupervisorPersistence } from "../agents/supervisorPersistence.js";
import { humanizeToolFailure } from "./action/resolveActionTarget.js";
import type { ToolRegistry } from "../agents/toolRegistry.js";
import { authorizeTenantOperation, type OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { expandGuideFlow, listAvailableGuideFlows } from "./guide/guide.service.js";
import { localizeGuideKey } from "./guide/guide.i18n.js";
import type { GuideSession } from "./guide/guide.contracts.js";
import type { ActionPlan } from "./action/action.contracts.js";
import { initializeCopilotRuntime, getCopilotSupervisorRuntime, getCopilotSupervisorPersistence } from "./copilotComposition.js";
import { evaluatorReauthorize } from "./action/reauthorize.js";
import { writeCopilotActionAudit } from "./copilot.audit.js";
import type { StorageProvider, SecurityScanner, ProcessingDispatcher } from "../../providers/storage/types.js";
import CopilotActionIdempotencyModel from "./idempotency/actionIdempotency.model.js";

interface CopilotMessageInput {
  utterance: string;
  locale?: "en" | "ar";
  routeContext?: string;
}

interface CopilotMessageOutput {
  mode: "guide" | "action" | "clarify";
  guideSession?: GuideSession;
  actionPlan?: ActionPlan;
  approvalId?: string;
  clarify?: {
    message: string;
    suggestedFlows: string[];
    suggestedActions: string[];
  };
}

interface CopilotGuideResolveInput {
  flowId: string;
  locale?: "en" | "ar";
}

interface CopilotActionInput {
  utterance?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  locale?: "en" | "ar";
}

export interface ConfirmActionInput {
  decision: "approve" | "reject";
  approvalId: string;
  note?: string;
}

export interface ResumeCopilotDeps {
  persistence: SupervisorPersistence;
  toolRegistry: ToolRegistry;
}

export async function initializeCopilotService(deps: {
  storageProvider: StorageProvider;
  securityScanner: SecurityScanner;
  processingDispatcher: ProcessingDispatcher;
}): Promise<void> {
  await initializeCopilotRuntime(deps);
}

export async function processCopilotMessage(
  input: CopilotMessageInput,
  context: AgentExecutionContext,
): Promise<CopilotMessageOutput> {
  const runtime = getCopilotSupervisorRuntime();

  // The Mongo-backed supervisor persistence keys AgentRun/steps/approvals by an
  // ObjectId `_id`, so the run id must be an ObjectId string (not a UUID).
  const runId = new MongooseTypes.ObjectId().toString();
  const runInput: SupervisorRunInput = {
    runId,
    workflowId: "guider-v1",
    context: toRuntimeContext(context),
    input: {
      utterance: input.utterance,
      locale: input.locale ?? "en",
      ...(input.routeContext ? { routeContext: input.routeContext } : {}),
    },
  };

  const result = await runtime.execute(runInput, {
    onToolResult: ({ toolName, currentInput }) => {
      const plan = currentInput.actionPlan as
        | { toolInput?: Record<string, unknown> }
        | undefined;
      void writeCopilotActionAudit({
        outcome: "EXECUTED",
        context: runInput.context,
        runId,
        toolName,
        toolInput: plan?.toolInput,
      });
    },
  });

  if (result.status === "completed" && result.output) {
    const output = result.output as { mode: string; guideSession?: GuideSession; actionPlan?: ActionPlan };
    if (output.mode === "clarify") {
      // The supervisor's clarify completion carries only the mode; the panel
      // needs the full payload (message + suggestions) to render anything,
      // so enrich it here for every clarify outcome.
      return await buildClarifyPayload(context, input.locale ?? "en");
    }
    return {
      mode: output.mode as "guide" | "action" | "clarify",
      guideSession: output.guideSession,
      actionPlan: output.actionPlan,
    };
  }

  if (result.status === "awaiting_approval") {
    const { approvals } = await listApprovals(context.tenantId, {
      page: 1,
      pageSize: 5,
    });
    const approval = approvals.find(
      (candidate) => candidate.runId === runId && candidate.status === "pending",
    );
    const approvalContext = approval?.context as
      | Record<string, unknown>
      | undefined;
    const plan = (approvalContext?.input as Record<string, unknown> | undefined)
      ?.actionPlan as ActionPlan | undefined;

    return {
      mode: "action",
      actionPlan: plan ?? {
        runId,
        intent: input.utterance,
        toolName: "",
        risk: "destructive",
        requiresConfirmation: true,
        summary: "Action requires confirmation",
        target: null,
      },
      approvalId: approval?.id,
    };
  }

  if (result.status === "failed" && result.error) {
    const code =
      typeof result.error.code === "string" ? result.error.code : "RUN_FAILED";

    // A guide request that matches nothing (no flow, no section, no usable
    // classifier hint) should not hard-fail the panel: offer clarification
    // with the available flows so the user can pick one instead.
    if (code === "NO_MATCHING_FLOW") {
      return buildClarifyPayload(context, input.locale ?? "en");
    }

    const message =
      typeof result.error.message === "string" &&
      result.error.message !== result.error.code
        ? result.error.message
        : "The assistant could not complete that request";
    throw new AppError(
      code === "TARGET_NOT_FOUND" ? 404 : 400,
      code,
      message,
    );
  }

  return buildClarifyPayload(context, input.locale ?? "en");
}

/**
 * The controller enriches the execution context with `resolved` permissions
 * for guide/flow resolution helpers, but the supervisor runtime validates its
 * input against a strict schema and only consumes the derived `permissions`
 * array. Strip the controller-only keys so runs never 500 on unknown fields.
 */
function toRuntimeContext(
  context: AgentExecutionContext,
): AgentExecutionContext {
  const copy = { ...context } as Record<string, unknown>;
  delete copy.resolved;
  return copy as unknown as AgentExecutionContext;
}

/**
 * The clarify payload shown in the assistant panel: a localized prompt plus
 * permission-filtered guide flows and default action chips the user can tap.
 */
async function buildClarifyPayload(
  context: AgentExecutionContext,
  locale: "en" | "ar",
): Promise<CopilotMessageOutput> {
  return {
    mode: "clarify",
    clarify: {
      message: localizeGuideKey("copilot.clarify.defaultMessage", locale),
      suggestedFlows: await listAvailableGuideFlows({
        tenantId: context.tenantId,
        actorId: context.actorId,
        actorRole: context.actorRole as "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE",
        locale,
      }),
      suggestedActions: ["document.search", "document.get", "user.invite", "settings.update"],
    },
  };
}

export async function resolveGuideFlow(
  input: CopilotGuideResolveInput,
  context: AgentExecutionContext,
  resolved?: ResolvedPermissions,
): Promise<GuideSession | null> {
  return expandGuideFlow(
    input.flowId,
    {
      tenantId: context.tenantId,
      actorId: context.actorId,
      actorRole: context.actorRole as "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE",
      locale: input.locale ?? "en",
    },
    resolved,
  );
}

export interface CreateActionPlanDeps {
  runtime: SupervisorRuntime;
  persistence: SupervisorPersistence;
}

export async function createActionPlan(
  input: CopilotActionInput,
  context: AgentExecutionContext,
  options: { idempotencyKey?: string; deps?: CreateActionPlanDeps } = {},
): Promise<ActionPlan & { approvalId?: string }> {
  const persistence = options.deps?.persistence ?? getCopilotSupervisorPersistence();

  if (options.idempotencyKey) {
    const replayed = await tryReplayActionPlan(context, options.idempotencyKey, persistence);
    if (replayed) {
      return replayed;
    }
  }

  const runtime = options.deps?.runtime ?? getCopilotSupervisorRuntime();

  // Must be an ObjectId string so Mongo persistence (AgentRun `_id`, steps,
  // approvals) can index this run consistently.
  const runId = new MongooseTypes.ObjectId().toString();
  const runInput: SupervisorRunInput = {
    runId,
    workflowId: "guider-v1",
    context: toRuntimeContext(context),
    input: {
      utterance: input.utterance ?? "",
      locale: input.locale ?? "en",
      toolName: input.toolName,
      toolInput: input.toolInput,
    },
  };

  const result = await runtime.execute(runInput, {
    onToolResult: ({ toolName, currentInput }) => {
      const plan = currentInput.actionPlan as
        | { toolInput?: Record<string, unknown> }
        | undefined;
      void writeCopilotActionAudit({
        outcome: "EXECUTED",
        context: runInput.context,
        runId,
        toolName,
        toolInput: plan?.toolInput,
      });
    },
  });

  let plan: (ActionPlan & { approvalId?: string }) | null = null;

  if (result.status === "completed" && result.output) {
    const output = result.output as { mode: string; actionPlan?: ActionPlan };
    if (output.actionPlan) {
      plan = output.actionPlan;
    }
  }

  if (result.status === "awaiting_approval") {
    const approvals = await persistence.listApprovals(context.tenantId, runId);
    const approval = approvals.find(
      (candidate) => candidate.status === "pending",
    );
    const approvalPlan = extractPlanFromApproval(approval);
    if (approvalPlan) {
      plan = { ...approvalPlan, approvalId: approval?.id };
    }
  }

  if (!plan) {
    throw new Error("Failed to create action plan");
  }

  if (options.idempotencyKey) {
    try {
      await recordIdempotencyMapping(context, options.idempotencyKey, plan.runId);
    } catch (error) {
      const winner = await tryReplayActionPlan(context, options.idempotencyKey, persistence);
      if (winner) {
        return winner;
      }
      throw error;
    }
  }

  return plan;
}

function extractPlanFromApproval(
  approval: { context?: unknown } | undefined,
): ActionPlan | null {
  if (!approval) return null;
  const approvalContext = approval.context as Record<string, unknown> | undefined;
  const plan = (approvalContext?.input as Record<string, unknown> | undefined)
    ?.actionPlan as ActionPlan | undefined;
  return plan ?? null;
}

function hashIdempotencyKey(tenantId: string, actorId: string, rawKey: string): string {
  return createHash("sha256")
    .update(`${tenantId}:${actorId}:${rawKey}`)
    .digest("hex");
}

async function recordIdempotencyMapping(
  context: AgentExecutionContext,
  rawKey: string,
  runId: string,
): Promise<void> {
  await CopilotActionIdempotencyModel.create({
    tenantId: new MongooseTypes.ObjectId(context.tenantId),
    actorId: new MongooseTypes.ObjectId(context.actorId),
    idempotencyKey: hashIdempotencyKey(context.tenantId, context.actorId, rawKey),
    runId,
  });
}

async function tryReplayActionPlan(
  context: AgentExecutionContext,
  rawKey: string,
  persistence: SupervisorPersistence,
): Promise<(ActionPlan & { approvalId?: string }) | null> {
  const mapping = await CopilotActionIdempotencyModel.findOne({
    tenantId: new MongooseTypes.ObjectId(context.tenantId),
    actorId: new MongooseTypes.ObjectId(context.actorId),
    idempotencyKey: hashIdempotencyKey(context.tenantId, context.actorId, rawKey),
  })
    .lean()
    .exec();
  if (!mapping) return null;

  return replayActionPlan(context.tenantId, mapping.runId, persistence);
}

async function replayActionPlan(
  tenantId: string,
  runId: string,
  persistence: SupervisorPersistence,
): Promise<ActionPlan & { approvalId?: string }> {
  const run = await persistence.getRun(tenantId, runId);
  if (!run) throw new Error("Failed to create action plan");

  if (run.status === "awaiting_approval") {
    const approvals = await persistence.listApprovals(tenantId, runId);
    const approval = approvals.find(
      (candidate) => candidate.status === "pending",
    );
    const plan = extractPlanFromApproval(approval);
    if (plan) {
      return { ...plan, approvalId: approval?.id };
    }
    throw new Error("Failed to create action plan");
  }

  if (run.status === "completed") {
    const output = run.output as { actionPlan?: ActionPlan } | null;
    if (output?.actionPlan) {
      return output.actionPlan;
    }
    const approvals = await persistence.listApprovals(tenantId, runId);
    const plan = extractPlanFromApproval(approvals[0]);
    if (plan) {
      return plan;
    }
  }

  throw new Error("Failed to create action plan");
}

export async function resumeCopilotAction(
  runId: string,
  input: ConfirmActionInput,
  approverContext: OperationAuthorizationContext,
  deps: ResumeCopilotDeps,
): Promise<RunRecord> {
  const actor = await authorizeTenantOperation(
    approverContext,
    Permission.CHAT_CREATE,
  );
  await authorizeTenantOperation(approverContext, Permission.CHAT_READ);

  const tenantId = actor.tenantId;
  const { persistence, toolRegistry } = deps;

  const approval = await persistence.getApproval(tenantId, input.approvalId);
  if (!approval) throw new AppError(404, NOT_FOUND, "Approval not found");
  if (approval.runId !== runId)
    throw new AppError(400, BAD_REQUEST, "Approval does not belong to this run");
  if (approval.status !== "pending")
    throw new AppError(
      409,
      "STATE_TRANSITION_INVALID",
      "Approval is not pending",
    );
  if (approval.expiresAt < new Date().toISOString()) {
    await persistence.resolveApproval(
      tenantId,
      input.approvalId,
      "rejected",
      actor.actorId,
      null,
    );
    await persistence.completeRun(tenantId, runId, {
      status: "failed",
      error: { message: "Approval expired", approvalId: input.approvalId },
    });
    throw new AppError(409, "STATE_TRANSITION_INVALID", "Approval expired");
  }

  const resolved = await persistence.resolveApproval(
    tenantId,
    input.approvalId,
    input.decision === "approve" ? "approved" : "rejected",
    actor.actorId,
    input.note ?? null,
  );
  if (!resolved)
    throw new AppError(
      409,
      "STATE_TRANSITION_INVALID",
      "Approval could not be resolved",
    );

  const approvalContext = approval.context as Record<string, unknown> | undefined;
  const plan = (approvalContext?.input as Record<string, unknown> | undefined)
    ?.actionPlan as Record<string, unknown> | undefined;
  let toolName: string | undefined;
  let planToolInput: Record<string, unknown> | undefined;
  if (plan && typeof plan.toolName === "string") {
    toolName = plan.toolName;
    if (plan.toolInput && typeof plan.toolInput === "object") {
      planToolInput = plan.toolInput as Record<string, unknown>;
    }
  }

  if (input.decision === "reject") {
    await writeCopilotActionAudit({
      outcome: "REJECTED",
      context: actor,
      runId,
      toolName: toolName ?? "unknown",
      toolInput: planToolInput,
      approvalId: input.approvalId,
    });
    await persistence.completeRun(tenantId, runId, {
      status: "failed",
      error: { message: "Approval rejected by user", approvalId: input.approvalId },
    });
    const rejectedRun = await persistence.getRun(tenantId, runId);
    if (!rejectedRun) throw new AppError(404, NOT_FOUND, "Run not found");
    return rejectedRun;
  }

  const run = await persistence.getRun(tenantId, runId);
  if (!run) throw new AppError(404, NOT_FOUND, "Run not found");

  if (!toolName) {
    await persistence.completeRun(tenantId, runId, {
      status: "failed",
      error: {
        code: "APPROVAL_CONTEXT_INVALID",
        message: "Approval context has no tool to execute",
      },
    });
    const invalidRun = await persistence.getRun(tenantId, runId);
    if (!invalidRun) throw new AppError(404, NOT_FOUND, "Run not found");
    return invalidRun;
  }
  const toolInput = planToolInput ?? {};

  const runContext: AgentRunContext = {
    tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    traceId: run.traceId,
    requestId: run.requestId,
    workflowName: run.workflowName,
    agentName: approval.requestedBy,
    runId: run.id,
    maxSteps: 10,
    maxToolCalls: 50,
    maxTokens: 50_000,
    budgetMs: 120_000,
  };

  const toolResult = await toolRegistry.execute(
    runContext,
    toolName,
    toolInput,
    (permission) =>
      evaluatorReauthorize(
        {
          tenantId,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          permissions: [],
          traceId: run.traceId,
          requestId: run.requestId,
        },
        permission,
      ),
  );

  const output = (toolResult.output as Record<string, unknown> | null) ?? null;
  const status = toolResult.ok ? "completed" : "failed";
  const error = toolResult.ok
    ? null
    : humanizeToolFailure(toolResult.error, toolName);

  await writeCopilotActionAudit({
    outcome: toolResult.ok ? "EXECUTED" : "FAILED",
    context: actor,
    runId,
    toolName,
    toolInput,
    error,
    approvalId: input.approvalId,
  });

  if (approval.stepId) {
    await persistence.completeStep(tenantId, approval.stepId, {
      status,
      output,
      error,
    });
  }

  await persistence.completeRun(tenantId, runId, {
    status,
    output,
    error,
    totalToolCalls: toolResult.ok ? 1 : 0,
  });

  const resolvedRun = await persistence.getRun(tenantId, runId);
  if (!resolvedRun) throw new AppError(404, NOT_FOUND, "Run not found");
  return resolvedRun;
}
