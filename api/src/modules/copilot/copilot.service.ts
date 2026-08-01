import { CopilotPlanner } from "./planner/planner.service.js";
import { ActionExecutor } from "./executors/actionExecutor.js";
import { CopilotToolRegistry } from "./tools/toolRegistry.js";
import { planRepository } from "./db/planRepository.js";
import type { CopilotPlan, CopilotSuggestion, CopilotStep, PlannerInput, ToolContext, ToolResult } from "./copilot.types.js";
import type { PlanMode } from "./copilot.types.js";
import { detectIntentMode, type ModeInput } from "./intent/copilotIntent.js";
import { Permission } from "../permissions/permissions.catalog.js";
import type { PermissionValue } from "../permissions/permissions.catalog.js";
import { authorizeTenantOperation } from "../permissions/permissions.operation.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { copilotPlansGenerated } from "./metrics/copilotMetrics.js";
import { AppError } from "../../common/errors/AppError.js";
import { NOT_FOUND } from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { planEventBus, type PlanEventBus } from "./events/planEventBus.js";
import type { CopilotPlanEvent } from "./copilot.types.js";
import { buildGuideInstructions } from "./executors/guideExecutor.js";
import type { GuidePlan } from "./copilot.types.js";

function now(): string {
  return new Date().toISOString();
}

async function finalizePlanIfDone(
  plan: CopilotPlan,
  planId: string,
  tenantId: string,
  publish: (planId: string, tenantId: string, event: CopilotPlanEvent) => void,
): Promise<void> {
  const allDone = plan.steps.every((s) => s.status === "completed" || s.status === "failed");
  if (!allDone) return;
  const anyFailed = plan.steps.some((s) => s.status === "failed");
  if (anyFailed) {
    await planRepository.updateStatus(planId, "failed");
    publish(planId, tenantId, { type: "plan.failed", planId, at: now() });
  } else {
    await planRepository.updateStatus(planId, "completed");
    publish(planId, tenantId, { type: "plan.completed", planId, at: now() });
  }
}

function permissionForMode(mode: PlanMode): PermissionValue {
  return mode === "guide" ? Permission.COPILOT_GUIDED : Permission.COPILOT_ACTION;
}

function toOperationContext(ctx: ToolContext): OperationAuthorizationContext {
  return {
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    actorEmail: ctx.actorEmail,
    actorRole: ctx.actorRole as OperationAuthorizationContext["actorRole"],
    traceId: ctx.traceId,
    requestId: ctx.requestId,
  };
}

export class CopilotService {
  constructor(
    private readonly planner: CopilotPlanner,
    private readonly executor: ActionExecutor,
    private readonly toolRegistry: CopilotToolRegistry,
    private readonly eventBus: PlanEventBus = planEventBus,
  ) {}

  private publish(planId: string, tenantId: string, event: CopilotPlanEvent): void {
    this.eventBus.publish(planId, tenantId, event);
  }

  private async rollbackExecutedSteps(plan: CopilotPlan, ctx: OperationAuthorizationContext): Promise<void> {
    const toolCtx: ToolContext = {
      tenantId: ctx.tenantId,
      actorId: ctx.actorId,
      actorEmail: ctx.actorEmail,
      actorRole: ctx.actorRole as string,
      traceId: ctx.traceId ?? "",
      requestId: ctx.requestId ?? "",
    };

    const executedSteps = [...plan.steps]
      .filter((s) => s.status === "completed" && s.tool)
      .sort((a, b) => b.stepIndex - a.stepIndex);

    for (const step of executedSteps) {
      const tool = step.tool ? this.toolRegistry.get(step.tool) : undefined;
      if (!tool?.rollbackCapable || !tool.rollback) continue;

      this.publish(plan.id, ctx.tenantId, {
        type: "rollback.started",
        planId: plan.id,
        stepIndex: step.stepIndex,
        tool: step.tool as string,
        at: now(),
      });

      const resultData = (step.result as { data?: unknown } | null)?.data;
      let rollbackResult: ToolResult;
      try {
        rollbackResult = await tool.rollback(step.parameters ?? {}, toolCtx, resultData);
      } catch (err) {
        const error = err instanceof Error ? err.message : "Rollback failed";
        this.publish(plan.id, ctx.tenantId, {
          type: "rollback.failed",
          planId: plan.id,
          stepIndex: step.stepIndex,
          tool: step.tool as string,
          error,
          at: now(),
        });
        continue;
      }

      if (!rollbackResult.ok) {
        this.publish(plan.id, ctx.tenantId, {
          type: "rollback.failed",
          planId: plan.id,
          stepIndex: step.stepIndex,
          tool: step.tool as string,
          error: rollbackResult.error ?? "Rollback failed",
          at: now(),
        });
        continue;
      }

      this.publish(plan.id, ctx.tenantId, {
        type: "rollback.completed",
        planId: plan.id,
        stepIndex: step.stepIndex,
        tool: step.tool as string,
        at: now(),
      });

      try {
        await getAuditWriter().write({
          action: "COPILOT_STEP_ROLLED_BACK",
          resourceType: "CopilotPlan",
          resourceId: plan.id,
          outcome: "SUCCESS",
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          actorEmail: ctx.actorEmail,
          actorRole: ctx.actorRole,
          changes: { stepIndex: step.stepIndex, tool: step.tool },
          metadata: { source: "copilot", rollback: true },
        });
      } catch {
        // audit failure is non-blocking
      }
    }
  }

  async generatePlan(
    input: { query: string; mode?: ModeInput; currentRoute?: string },
    ctx: ToolContext,
  ): Promise<CopilotPlan> {
    const opCtx = toOperationContext(ctx);
    const intent = detectIntentMode({ query: input.query, mode: input.mode });
    await authorizeTenantOperation(opCtx, Permission.COPILOT_USE);
    await authorizeTenantOperation(opCtx, permissionForMode(intent.mode));

    const plannerInput: PlannerInput = {
      query: input.query,
      mode: intent.mode,
      currentRoute: input.currentRoute,
      tenantId: ctx.tenantId,
      actorRole: ctx.actorRole,
      traceId: ctx.traceId ?? "unknown",
      requestId: ctx.requestId ?? "unknown",
      language: ctx.language,
      customRoleId: ctx.customRoleId,
      departmentIds: ctx.departmentIds,
      currentDocumentId: ctx.currentDocumentId,
      selectedEntityId: ctx.selectedEntityId,
      effectivePermissions: ctx.effectivePermissions,
    };

    const plan = await this.planner.generatePlan(plannerInput);
    const storedPlan = await planRepository.create(plan, ctx.tenantId);

    copilotPlansGenerated.inc({ mode: intent.mode, status: storedPlan.status });
    this.publish(storedPlan.id, ctx.tenantId, { type: "intent.detected", mode: intent.mode, source: intent.source, at: now() });
    this.publish(storedPlan.id, ctx.tenantId, { type: "plan.ready", planId: storedPlan.id, at: now() });

    try {
      await getAuditWriter().write({
        action: "COPILOT_PLAN_CREATED",
        resourceType: "CopilotPlan",
        resourceId: storedPlan.id,
        outcome: "SUCCESS",
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        actorEmail: ctx.actorEmail,
        actorRole: opCtx.actorRole,
        changes: {
          mode: intent.mode,
          intentSource: intent.source,
          summary: storedPlan.summary,
          stepCount: storedPlan.steps.length,
        },
        metadata: { source: "copilot" },
      });
    } catch {
      // audit failure is non-blocking
    }

    return storedPlan;
  }

  async executeStep(
    planId: string,
    stepIndex: number,
    _parameters: Record<string, unknown> | null,
    ctx: ToolContext,
  ) {
    const plan = await planRepository.findByIdInTenant(planId, ctx.tenantId);
    if (!plan) throw new AppError(404, NOT_FOUND, "Plan not found");
    await authorizeTenantOperation(toOperationContext(ctx), permissionForMode(plan.mode));

    const step = plan.steps[stepIndex];
    if (!step) throw new AppError(404, NOT_FOUND, "Step not found");

    if (step.status === "completed" || step.status === "failed") {
      return { step, result: step.result, confirmationRequired: false, confirmationRequest: null };
    }

    this.publish(planId, ctx.tenantId, { type: "step.started", planId, stepIndex, tool: step.tool, at: now() });

    const result = await this.executor.executeStep(step, plan, ctx);
    await planRepository.updateStep(planId, stepIndex, {
      status: step.status,
      result: step.result,
      errorMessage: step.errorMessage,
      retryCount: step.retryCount ?? 0,
    });
    await planRepository.updatePlanTimestamp(planId);

    const stepStatus = step.status as CopilotStep["status"];
    if (result.confirmationRequired) {
      this.publish(planId, ctx.tenantId, {
        type: "step.confirmation_required",
        planId,
        stepIndex,
        tool: step.tool ?? "",
        level: step.confirmationLevel ?? "medium",
        at: now(),
      });
    } else if (stepStatus === "completed") {
      this.publish(planId, ctx.tenantId, { type: "step.completed", planId, stepIndex, tool: step.tool, ok: true, at: now() });
    } else {
      this.publish(planId, ctx.tenantId, { type: "step.failed", planId, stepIndex, tool: step.tool, error: step.errorMessage, at: now() });
    }

    await finalizePlanIfDone(plan, planId, ctx.tenantId, (id, tenant, event) => this.publish(id, tenant, event));

    return result;
  }

  async confirmStep(
    planId: string,
    stepIndex: number,
    decision: "approve" | "reject",
    ctx: ToolContext,
  ) {
    const plan = await planRepository.findByIdInTenant(planId, ctx.tenantId);
    if (!plan) throw new AppError(404, NOT_FOUND, "Plan not found");
    await authorizeTenantOperation(toOperationContext(ctx), permissionForMode(plan.mode));

    const step = plan.steps[stepIndex];
    if (!step) throw new AppError(404, NOT_FOUND, "Step not found");

    if (decision === "reject") {
      await planRepository.updateStep(planId, stepIndex, { status: "cancelled" });
      this.publish(planId, ctx.tenantId, { type: "step.confirmed", planId, stepIndex, decision: "reject", at: now() });
      this.publish(planId, ctx.tenantId, { type: "step.cancelled", planId, stepIndex, at: now() });
      return { step: { ...step, status: "cancelled" }, cancelled: true };
    }

    if (step.status === "completed" || step.status === "failed") {
      return { step, result: step.result, confirmationRequired: false, confirmationRequest: null };
    }

    this.publish(planId, ctx.tenantId, { type: "step.confirmed", planId, stepIndex, decision: "approve", at: now() });

    const result = await this.executor.confirmAndExecute(step, plan, ctx);
    await planRepository.updateStep(planId, stepIndex, {
      status: step.status,
      result: step.result,
      errorMessage: step.errorMessage,
      retryCount: step.retryCount ?? 0,
    });
    await planRepository.updatePlanTimestamp(planId);

    const confirmedStatus = step.status as CopilotStep["status"];
    if (confirmedStatus === "completed") {
      this.publish(planId, ctx.tenantId, { type: "step.completed", planId, stepIndex, tool: step.tool, ok: true, at: now() });
    } else {
      this.publish(planId, ctx.tenantId, { type: "step.failed", planId, stepIndex, tool: step.tool, error: step.errorMessage, at: now() });
    }

    await finalizePlanIfDone(plan, planId, ctx.tenantId, (id, tenant, event) => this.publish(id, tenant, event));

    return result;
  }

  async getPlan(planId: string, tenantId: string): Promise<CopilotPlan | undefined> {
    const plan = await planRepository.findByIdInTenant(planId, tenantId);
    return plan ?? undefined;
  }

  async getGuidePlan(planId: string, tenantId: string): Promise<GuidePlan | undefined> {
    const plan = await planRepository.findByIdInTenant(planId, tenantId);
    if (!plan) return undefined;
    if (plan.mode !== "guide") {
      throw new AppError(400, "BAD_REQUEST", "Plan is not in guide mode");
    }
    return buildGuideInstructions(plan);
  }

  async cancelPlan(planId: string, ctx: OperationAuthorizationContext): Promise<boolean> {
    const plan = await planRepository.findByIdInTenant(planId, ctx.tenantId);
    if (!plan) return false;
    await authorizeTenantOperation(ctx, permissionForMode(plan.mode));

    await this.rollbackExecutedSteps(plan, ctx);

    const cancelled = await planRepository.cancelPlanSteps(planId);
    if (!cancelled) return false;

    this.publish(planId, ctx.tenantId, { type: "plan.cancelled", planId, at: now() });

    try {
      await getAuditWriter().write({
        action: "COPILOT_PLAN_CANCELLED",
        resourceType: "CopilotPlan",
        resourceId: planId,
        outcome: "SUCCESS",
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        actorEmail: ctx.actorEmail,
        actorRole: ctx.actorRole,
        changes: { summary: plan.summary, mode: plan.mode },
        metadata: { source: "copilot" },
      });
    } catch {
      // audit failure is non-blocking
    }
    return true;
  }

  async getSuggestions(tenantId: string, actorRole: string): Promise<CopilotSuggestion[]> {
    const baseSuggestions: CopilotSuggestion[] = [
      { label: "Search documents", description: "Search your knowledge base", icon: "search", query: "Search for documents about" },
      { label: "Upload document", description: "Upload a new document", icon: "upload", query: "Upload a document" },
      { label: "Ask a question", description: "Ask about your knowledge base", icon: "help-circle", query: "Answer: " },
    ];

    if (actorRole !== "EMPLOYEE") {
      baseSuggestions.push(
        { label: "Invite user", description: "Invite a new team member", icon: "user-plus", query: "Invite a new user" },
        { label: "Run OCR", description: "Start OCR processing on documents", icon: "scan", query: "Start OCR processing" },
        { label: "System health", description: "Check system health", icon: "activity", query: "Check system health" },
      );
    }

    return baseSuggestions;
  }
}
