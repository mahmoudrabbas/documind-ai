import { AppError } from "../../common/errors/AppError.js";
import { BAD_REQUEST, NOT_FOUND } from "../../common/errors/errorCodes.js";
import { Supervisor } from "./supervisor.js";
import { ToolRegistry } from "./toolRegistry.js";
import { createFakeTools } from "./fakeTools.js";
import { createDefaultGuardrails } from "./guardrails.js";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";
import {
  createRun,
  startRun,
  completeRun,
  getRun,
  listRuns,
  createStep,
  completeStep,
  getSteps,
  createToolCall,
  completeToolCall,
  getToolCalls,
  createApproval,
  resolveApproval,
  getApproval,
  listApprovals,
  expirePendingApprovals,
} from "./agents.repository.js";
import AgentRunModel from "../../db/models/agentRun.model.js";
import type {
  ApprovalRecord,
  RunContext,
  SupervisorDecision,
} from "./agents.types.js";
import { assertRunStatusTransition } from "./agents.validator.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  authorizePlatformOperation,
  authorizeTenantOperation,
  type OperationAuthorizationContext,
} from "../permissions/permissions.operation.js";

const model = new FakeModelAdapter();
const supervisor = new Supervisor(model, createDefaultGuardrails());
const toolRegistry = new ToolRegistry();
for (const tool of createFakeTools()) {
  toolRegistry.register(tool);
}

async function requireAgentPermission(_permission?: string): Promise<boolean> {
  if (!_permission) return true;
  const allowed = new Set([
    "agents:tools:echo:use",
    "agents:tools:reverse:use",
    "agents:tools:fail:use",
    "agents:approval:request",
    "agents:handoff:request",
  ]);
  return allowed.has(_permission);
}

async function runGuardrails(
  context: RunContext,
  phase: "input" | "tool_invocation" | "output" | "sensitive_action",
  payload: Record<string, unknown>,
): Promise<{
  passed: boolean;
  action: "allow" | "block" | "approval_required";
  reason: string | null;
}> {
  return supervisor.evaluateGuardrails(context, phase, payload);
}

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

async function resumeApprovedAction(
  context: RunContext,
  approval: ApprovalRecord,
  runId: string,
): Promise<void> {
  const approvalContext = approval.context as
    Record<string, unknown> | undefined;
  const handoffTarget =
    approvalContext && typeof approvalContext.toAgent === "string"
      ? approvalContext.toAgent
      : null;

  if (handoffTarget && approval.stepId) {
    const handoffPayload: Record<string, unknown> = {
      fromAgent: approvalContext?.fromAgent ?? context.agentName,
      toAgent: handoffTarget,
      reason: approvalContext?.reason ?? "Approved handoff",
      input: approvalContext?.input ?? {},
    };
    await completeStep(context.tenantId, approval.stepId, {
      status: "completed",
      output: handoffPayload,
      handoffToAgent: handoffTarget,
    });
    await completeRun(context.tenantId, runId, {
      status: "completed",
      output: handoffPayload,
      handoffsCount: 1,
    });
    return;
  }

  if (
    approvalContext &&
    typeof approvalContext.toolName === "string" &&
    approval.toolCallId
  ) {
    const toolResult = await toolRegistry.execute(
      context,
      approvalContext.toolName,
      approvalContext.input ?? {},
      requireAgentPermission,
    );
    await completeToolCall(context.tenantId, approval.toolCallId, {
      status: toolResult.ok ? "completed" : "failed",
      output: nullToUndefined(
        toolResult.output as Record<string, unknown> | null,
      ),
      error: toolResult.error,
      latencyMs: toolResult.latencyMs,
      tokensUsed: toolResult.tokensUsed ?? 0,
      estimatedCost: toolResult.estimatedCost ?? 0,
    });
    if (approval.stepId) {
      await completeStep(context.tenantId, approval.stepId, {
        status: toolResult.ok ? "completed" : "failed",
        output: nullToUndefined(
          toolResult.output as Record<string, unknown> | null,
        ),
        toolCallsCount: 1,
      });
    }
    await completeRun(context.tenantId, runId, {
      status: toolResult.ok ? "completed" : "failed",
      output: nullToUndefined(
        toolResult.output as Record<string, unknown> | null,
      ),
      error: toolResult.error,
    });
    return;
  }

  if (approval.stepId) {
    await completeStep(context.tenantId, approval.stepId, {
      status: "completed",
      output: { approved: true, context: approvalContext ?? {} },
    });
  }
  await completeRun(context.tenantId, runId, {
    status: "completed",
    output: { approved: true, context: approvalContext ?? {} },
  });
}

async function executeSupervisedRun(
  context: RunContext,
  input: Record<string, unknown>,
  runId: string,
  stepVersionSnapshot: string,
): Promise<void> {
  const start = Date.now();
  let stepIndex = 0;
  let totalToolCalls = 0;
  let totalTokensUsed = 0;
  let estimatedCost = 0;
  const approvalsCount = 0;
  let handoffsCount = 0;
  let output: Record<string, unknown> | undefined = undefined;
  let failed = false;
  let error: Record<string, unknown> | null | undefined = undefined;

  const decision: SupervisorDecision = await supervisor.decide(context, input, [
    "default-agent",
    "handoff-agent",
    "approval-agent",
  ]);

  for (
    stepIndex = 0;
    stepIndex < (decision.budget.maxSteps ?? 10);
    stepIndex++
  ) {
    const step = await createStep({
      runId,
      tenantId: context.tenantId,
      stepIndex,
      agentName: context.agentName,
      action: decision.plan.action,
      input,
      modelProvider: "fake",
      modelName: "fake-default",
      promptVersion: stepVersionSnapshot || null,
      traceId: context.traceId,
      requestId: context.requestId,
    });

    if (decision.plan.action === "plan") {
      await completeStep(context.tenantId, step.id, {
        status: "completed",
        output: { plan: decision.plan.reason },
      });
      output = { plan: decision.plan.reason };
      break;
    }

    if (decision.plan.action === "fail") {
      await completeStep(context.tenantId, step.id, {
        status: "failed",
        error: { message: decision.plan.reason },
      });
      failed = true;
      error = { message: decision.plan.reason };
      break;
    }

    if (decision.plan.action === "handoff") {
      const handoffPayload: Record<string, unknown> = {
        fromAgent: context.agentName,
        toAgent: decision.plan.handoffTo ?? "unknown",
        reason: decision.plan.reason,
        input,
      };
      const guardrailResult = await runGuardrails(context, "sensitive_action", {
        ...handoffPayload,
        action: "handoff",
      });
      if (guardrailResult.action === "approval_required") {
        await createApproval({
          tenantId: context.tenantId,
          actorId: context.actorId,
          runId,
          stepId: step.id,
          toolCallId: null,
          requestedBy: context.agentName,
          approverRole: "COMPANY_ADMIN",
          context: handoffPayload,
          ttlMs: 300_000,
          traceId: context.traceId,
        });
        await completeStep(context.tenantId, step.id, {
          status: "running",
          approvalsCount: 1,
        });
        await completeRun(context.tenantId, runId, {
          status: "awaiting_approval",
          approvalsCount: approvalsCount + 1,
        });
        return;
      }
      await completeStep(context.tenantId, step.id, {
        status: "completed",
        output: handoffPayload,
        handoffToAgent: decision.plan.handoffTo ?? "unknown",
      });
      output = handoffPayload;
      handoffsCount++;
      break;
    }

    if (decision.plan.action === "tool_call" && decision.plan.toolName) {
      const tc = await createToolCall({
        runId,
        stepId: step.id,
        tenantId: context.tenantId,
        toolName: decision.plan.toolName,
        toolVersion: stepVersionSnapshot || "1.0.0",
        input: decision.plan.toolInput ?? {},
        traceId: context.traceId,
        requestId: context.requestId,
      });

      const toolGuardrail = await runGuardrails(context, "tool_invocation", {
        toolName: decision.plan.toolName,
        input: decision.plan.toolInput,
      });
      if (toolGuardrail.action === "approval_required") {
        const approval = await createApproval({
          tenantId: context.tenantId,
          actorId: context.actorId,
          runId,
          stepId: step.id,
          toolCallId: tc.id,
          requestedBy: context.agentName,
          approverRole: "COMPANY_ADMIN",
          context: {
            toolName: decision.plan.toolName,
            input: decision.plan.toolInput,
          },
          ttlMs: 300_000,
          traceId: context.traceId,
        });
        await completeToolCall(context.tenantId, tc.id, {
          status: "running",
          approvalId: approval.id,
        });
        await completeStep(context.tenantId, step.id, {
          status: "running",
          approvalsCount: 1,
        });
        await completeRun(context.tenantId, runId, {
          status: "awaiting_approval",
          approvalsCount: approvalsCount + 1,
        });
        return;
      }

      const toolResult = await toolRegistry.execute(
        context,
        decision.plan.toolName,
        decision.plan.toolInput ?? {},
        requireAgentPermission,
      );
      await completeToolCall(context.tenantId, tc.id, {
        status: toolResult.ok ? "completed" : "failed",
        output: nullToUndefined(
          toolResult.output as Record<string, unknown> | null,
        ),
        error: toolResult.error,
        latencyMs: toolResult.latencyMs,
        tokensUsed: toolResult.tokensUsed ?? 0,
        estimatedCost: toolResult.estimatedCost ?? 0,
      });

      totalToolCalls++;
      totalTokensUsed += toolResult.tokensUsed ?? 0;
      estimatedCost += toolResult.estimatedCost ?? 0;
      await completeStep(context.tenantId, step.id, {
        status: toolResult.ok ? "completed" : "failed",
        output: nullToUndefined(
          toolResult.output as Record<string, unknown> | null,
        ),
        toolCallsCount: 1,
      });
      if (!toolResult.ok) {
        failed = true;
        error = toolResult.error;
        break;
      }
      output = nullToUndefined(
        toolResult.output as Record<string, unknown> | null,
      );
    }

    const outGuardrail = await runGuardrails(context, "output", {
      output: output ?? {},
    });
    if (!outGuardrail.passed) {
      failed = true;
      error = { message: outGuardrail.reason ?? "Output guardrail failed" };
      break;
    }
  }

  const latencyMs = Date.now() - start;
  const finalStatus: "completed" | "failed" | "cancelled" | "expired" = failed
    ? "failed"
    : "completed";
  await completeRun(context.tenantId, runId, {
    status: finalStatus,
    output: output ?? null,
    totalSteps: stepIndex,
    totalToolCalls,
    totalTokensUsed,
    estimatedCost,
    latencyMs,
    error: error ?? null,
    approvalsCount,
    handoffsCount,
  });
}

export async function startAgentRun(input: {
  tenantId: string;
  actorId: string;
  workflowName: string;
  agentName: string;
  input: Record<string, unknown>;
  modelProvider: string;
  modelName: string;
  promptVersion?: string | null;
  promptVersionId?: string | null;
  toolVersionSnapshot?: string | null;
  traceId: string;
  requestId: string;
  maxSteps?: number;
  maxToolCalls?: number;
  maxTokens?: number;
  budgetMs?: number;
}, inputContext: OperationAuthorizationContext) {
  const actor = await authorizeTenantOperation(
    inputContext,
    Permission.CHAT_CREATE,
  );
  if (input.tenantId !== actor.tenantId || input.actorId !== actor.actorId) {
    throw new AppError(404, NOT_FOUND, "Agent run not found");
  }
  const run = await createRun({
    tenantId: input.tenantId,
    actorId: input.actorId,
    workflowName: input.workflowName,
    agentName: input.agentName,
    input: input.input,
    modelProvider: input.modelProvider,
    modelName: input.modelName,
    promptVersion: input.promptVersion ?? null,
    promptVersionId: input.promptVersionId ?? null,
    toolVersionSnapshot: input.toolVersionSnapshot ?? null,
    traceId: input.traceId,
    requestId: input.requestId,
  });

  const started = await startRun(input.tenantId, run.id);
  if (!started)
    throw new AppError(
      409,
      "STATE_TRANSITION_INVALID",
      "Run could not be started",
    );

  const context: RunContext = {
    tenantId: input.tenantId,
    actorId: input.actorId,
    traceId: input.traceId,
    requestId: input.requestId,
    workflowName: input.workflowName,
    agentName: input.agentName,
    runId: run.id,
    maxSteps: input.maxSteps,
    maxToolCalls: input.maxToolCalls,
    maxTokens: input.maxTokens,
    budgetMs: input.budgetMs,
  };

  await executeSupervisedRun(
    context,
    input.input,
    run.id,
    input.toolVersionSnapshot ?? "1.0.0",
  );
  return getRun(input.tenantId, run.id);
}

export async function resumeAgentRun(
  tenantId: string,
  runId: string,
  approvalId: string,
  decision: "approve" | "reject",
  note: string | undefined,
  inputContext: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(
    inputContext,
    Permission.CHAT_CREATE,
  );
  await authorizeTenantOperation(inputContext, Permission.CHAT_READ);
  if (tenantId !== actor.tenantId) {
    throw new AppError(404, NOT_FOUND, "Approval not found");
  }
  const actorId = actor.actorId;
  const approval = await getApproval(tenantId, approvalId);
  if (!approval) throw new AppError(404, NOT_FOUND, "Approval not found");
  if (approval.runId !== runId)
    throw new AppError(
      400,
      BAD_REQUEST,
      "Approval does not belong to this run",
    );
  if (approval.status !== "pending")
    throw new AppError(
      409,
      "STATE_TRANSITION_INVALID",
      "Approval is not pending",
    );
  if (approval.expiresAt < new Date().toISOString()) {
    await resolveApproval(tenantId, approvalId, "rejected", actorId, null);
    throw new AppError(409, "STATE_TRANSITION_INVALID", "Approval expired");
  }

  const resolved = await resolveApproval(
    tenantId,
    approvalId,
    decision === "approve" ? "approved" : "rejected",
    actorId,
    note ?? null,
  );
  if (!resolved)
    throw new AppError(
      409,
      "STATE_TRANSITION_INVALID",
      "Approval could not be resolved",
    );

  if (decision === "reject") {
    await completeRun(tenantId, runId, {
      status: "failed",
      error: { message: "Approval rejected by user", approvalId },
    });
    return getRun(tenantId, runId);
  }

  const run = await getRun(tenantId, runId);
  if (!run) throw new AppError(404, NOT_FOUND, "Run not found");
  assertRunStatusTransition(run.status, "running");
  await completeRun(tenantId, runId, { status: "running" });
  const context: RunContext = {
    tenantId,
    actorId,
    traceId: run.traceId,
    requestId: run.requestId,
    workflowName: run.workflowName,
    agentName: run.agentName,
    runId: run.id,
    maxSteps: 10,
    maxToolCalls: 50,
    maxTokens: 50_000,
    budgetMs: 120_000,
  };
  await resumeApprovedAction(context, approval, run.id);
  return getRun(tenantId, runId);
}

export async function getRunDetails(
  tenantId: string,
  runId: string,
  inputContext: OperationAuthorizationContext,
  isPlatform = false,
) {
  let resolvedTenantId = tenantId;
  if (isPlatform) {
    await authorizePlatformOperation(inputContext, Permission.CHAT_READ);
    const platformRun = await AgentRunModel.findById(runId)
      .select("tenantId")
      .lean()
      .exec();
    if (!platformRun) throw new AppError(404, NOT_FOUND, "Run not found");
    resolvedTenantId = platformRun.tenantId.toString();
  } else {
    const actor = await authorizeTenantOperation(
      inputContext,
      Permission.CHAT_READ,
    );
    if (tenantId !== actor.tenantId) {
      throw new AppError(404, NOT_FOUND, "Run not found");
    }
  }
  const run = await getRun(resolvedTenantId, runId);
  if (!run) throw new AppError(404, NOT_FOUND, "Run not found");
  const [stepsRes, toolCallsRes, approvalsRes] = await Promise.all([
    getSteps(resolvedTenantId, runId, { page: 1, pageSize: 50 }),
    getToolCalls(resolvedTenantId, runId, { page: 1, pageSize: 100 }),
    listApprovals(resolvedTenantId, { page: 1, pageSize: 50 }),
  ]);
  const runApprovals = approvalsRes.approvals.filter((a) => a.runId === runId);
  return {
    run,
    steps: stepsRes.steps,
    toolCalls: toolCallsRes.toolCalls,
    approvals: runApprovals,
  };
}

export async function searchRuns(
  tenantId: string,
  filter: {
    page: number;
    pageSize: number;
    status?: string;
    agentName?: string;
    traceId?: string;
  },
  inputContext: OperationAuthorizationContext,
  isSuperAdmin = false,
) {
  if (!isSuperAdmin) {
    const actor = await authorizeTenantOperation(
      inputContext,
      Permission.CHAT_READ,
    );
    if (tenantId !== actor.tenantId) {
      throw new AppError(404, NOT_FOUND, "Agent runs not found");
    }
    return listRuns(tenantId, filter as Parameters<typeof listRuns>[1]);
  }
  await authorizePlatformOperation(inputContext, Permission.CHAT_READ);
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = filter.status;
  if (filter.agentName) query.agentName = filter.agentName;
  if (filter.traceId) query.traceId = filter.traceId;
  const [runs, totalRecords] = await Promise.all([
    AgentRunModel.find(query)
      .sort({ createdAt: -1 })
      .skip((filter.page - 1) * filter.pageSize)
      .limit(filter.pageSize)
      .lean()
      .exec(),
    AgentRunModel.countDocuments(query),
  ]);
  return {
    runs: runs.map((r) => ({
      ...(r as unknown as Record<string, unknown>),
      id: String((r as unknown as Record<string, unknown>)._id),
      tenantId: String((r as unknown as Record<string, unknown>).tenantId),
      actorId: String((r as unknown as Record<string, unknown>).actorId),
      createdAt: new Date(
        (r as unknown as Record<string, unknown>).createdAt as string,
      ).toISOString(),
      updatedAt: new Date(
        (r as unknown as Record<string, unknown>).updatedAt as string,
      ).toISOString(),
      startedAt: (r as unknown as Record<string, unknown>).startedAt
        ? new Date(
            (r as unknown as Record<string, unknown>).startedAt as string,
          ).toISOString()
        : null,
      finishedAt: (r as unknown as Record<string, unknown>).finishedAt
        ? new Date(
            (r as unknown as Record<string, unknown>).finishedAt as string,
          ).toISOString()
        : null,
      estimatedCost: (r as unknown as Record<string, unknown>).estimatedCost
        ? Number((r as unknown as Record<string, unknown>).estimatedCost)
        : null,
    })),
    totalRecords,
  };
}

export async function searchApprovals(
  tenantId: string,
  filter: { page: number; pageSize: number },
  inputContext: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(
    inputContext,
    Permission.CHAT_READ,
  );
  if (tenantId !== actor.tenantId) {
    throw new AppError(404, NOT_FOUND, "Approvals not found");
  }
  return listApprovals(tenantId, filter);
}

export async function expireStaleApprovals(
  inputContext: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(
    inputContext,
    Permission.CHAT_DELETE,
  );
  return expirePendingApprovals(actor.tenantId);
}
