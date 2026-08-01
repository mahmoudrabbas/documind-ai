import { z } from "zod";
import type { CopilotPlan, CopilotPlanEvent, CopilotStep, ToolContext, ToolResult } from "../copilot.types.js";
import { CopilotToolRegistry } from "../tools/toolRegistry.js";
import { verifyToolPermission } from "../guards/permissionGuard.js";
import { buildConfirmationRequest, requiresConfirmation } from "../guards/confirmationGuard.js";
import type { ConfirmationRequest } from "../guards/confirmationGuard.js";
import { getAuditWriter } from "../../../common/observability/index.js";
import { config } from "../../../config/index.js";
import { copilotExecutionDuration, copilotExecutionsTotal, copilotExecutionErrorsTotal, copilotConfirmationsRequested } from "../metrics/copilotMetrics.js";

type EventSink = (event: CopilotPlanEvent, tenantId: string) => void;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export interface StepExecutionResult {
  step: CopilotStep;
  result: ToolResult;
  confirmationRequired: boolean;
  confirmationRequest: ConfirmationRequest | null;
}

export interface PlanExecutionResult {
  planId: string;
  stepResults: StepExecutionResult[];
  allCompleted: boolean;
}

export class ActionExecutor {
  constructor(
    private readonly toolRegistry: CopilotToolRegistry,
    private readonly authorizeTenantOp: (context: Record<string, unknown>, permission: string) => Promise<unknown>,
    private readonly eventSink?: EventSink,
  ) {}

  async executeStep(
    step: CopilotStep,
    plan: CopilotPlan,
    context: ToolContext,
  ): Promise<StepExecutionResult> {
    const start = Date.now();

    if (!step.tool) {
      const result: ToolResult = {
        ok: true,
        data: { action: step.action, description: step.description },
        error: null,
        latencyMs: 0,
        auditEvent: null,
      };
      step.status = "completed";
      step.result = result;
      await this.writeStepAudit(plan.id, step, null, "SUCCESS", context, 0);
      return { step, result, confirmationRequired: false, confirmationRequest: null };
    }

    const tool = this.toolRegistry.get(step.tool);
    if (!tool) {
      const errResult: ToolResult = {
        ok: false,
        data: null,
        error: `Unknown tool: ${step.tool}`,
        latencyMs: 0,
        auditEvent: null,
      };
      step.status = "failed";
      step.result = errResult;
      step.errorMessage = errResult.error;
      copilotExecutionErrorsTotal.inc({ tool: step.tool, reason: "unknown_tool" });
      await this.writeStepAudit(plan.id, step, step.tool, "FAILURE", context, 0);
      return { step, result: errResult, confirmationRequired: false, confirmationRequest: null };
    }

    if (requiresConfirmation(tool.confirmationLevel)) {
      step.status = "awaiting_confirmation";
      copilotConfirmationsRequested.inc({ level: tool.confirmationLevel, outcome: "requested" });
      const confirmationRequest = buildConfirmationRequest(
        step.stepIndex,
        tool.name,
        step.parameters,
        tool.confirmationLevel,
        step.description,
      );
      return { step, result: { ok: false, data: null, error: null, latencyMs: 0, auditEvent: null }, confirmationRequired: true, confirmationRequest };
    }

    return this.runTool(tool.name, step, plan.id, context, start);
  }

  async confirmAndExecute(
    step: CopilotStep,
    plan: CopilotPlan,
    context: ToolContext,
  ): Promise<StepExecutionResult> {
    const start = Date.now();
    if (!step.tool) {
      return this.executeStep(step, plan, context);
    }
    return this.runTool(step.tool, step, plan.id, context, start);
  }

  private async runTool(
    toolName: string,
    step: CopilotStep,
    planId: string,
    context: ToolContext,
    start: number,
  ): Promise<StepExecutionResult> {
    const tool = this.toolRegistry.get(toolName);
    if (!tool) {
      const errResult: ToolResult = {
        ok: false,
        data: null,
        error: `Unknown tool: ${toolName}`,
        latencyMs: Date.now() - start,
        auditEvent: null,
      };
      step.status = "failed";
      step.result = errResult;
      step.errorMessage = errResult.error;
      copilotExecutionErrorsTotal.inc({ tool: toolName, reason: "unknown_tool" });
      await this.writeStepAudit(planId, step, toolName, "FAILURE", context, Date.now() - start);
      return { step, result: errResult, confirmationRequired: false, confirmationRequest: null };
    }

    const permissionCheck = await verifyToolPermission(tool.requiredPermission, context, this.authorizeTenantOp as (ctx: Record<string, unknown>, perm: string) => Promise<{ tenantId: string; actorId: string }>);
    if (!permissionCheck.allowed) {
      const errResult: ToolResult = {
        ok: false,
        data: null,
        error: permissionCheck.reason ?? "Permission denied",
        latencyMs: Date.now() - start,
        auditEvent: null,
      };
      step.status = "failed";
      step.result = errResult;
      step.errorMessage = errResult.error;
      copilotExecutionErrorsTotal.inc({ tool: toolName, reason: "permission_denied" });
      await this.writeStepAudit(planId, step, toolName, "DENIED", context, Date.now() - start);
      return { step, result: errResult, confirmationRequired: false, confirmationRequest: null };
    }

    step.status = "running";

    try {
      const parsed = tool.inputSchema.parse(step.parameters ?? {});
      const maxAttempts = Math.max(1, (tool.retries ?? config.COPILOT_TOOL_RETRIES ?? 0) + 1);
      let toolResult: ToolResult | null = null;
      let lastError: unknown = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          step.retryCount = (step.retryCount ?? 0) + 1;
          this.eventSink?.({ type: "step.retrying", planId, stepIndex: step.stepIndex, tool: toolName, attempt, at: new Date().toISOString() }, context.tenantId);
        }
        try {
          const attemptResult = await withTimeout(
            tool.handler(parsed, context),
            config.COPILOT_TOOL_TIMEOUT_MS,
            `Tool ${toolName}`,
          );
          attemptResult.latencyMs = Date.now() - start;
          if (attemptResult.ok || attempt >= maxAttempts - 1) {
            toolResult = attemptResult;
            break;
          }
          lastError = attemptResult.error ?? "Tool returned failure result";
        } catch (err) {
          lastError = err;
          if (attempt >= maxAttempts - 1) {
            throw err;
          }
        }
      }

      if (!toolResult) {
        throw lastError instanceof Error ? lastError : new Error("Tool execution failed");
      }

      step.status = toolResult.ok ? "completed" : "failed";
      step.result = toolResult;
      if (!toolResult.ok) {
        step.errorMessage = toolResult.error;
        copilotExecutionErrorsTotal.inc({ tool: toolName, reason: "execution_failed" });
      }

      if (toolResult.auditEvent) {
        try {
          await getAuditWriter().write({
            action: toolResult.auditEvent.action as never,
            resourceType: toolResult.auditEvent.resourceType as never,
            resourceId: toolResult.auditEvent.resourceId,
            tenantId: context.tenantId,
            actorId: context.actorId,
            actorEmail: context.actorEmail,
            actorRole: context.actorRole as never,
            metadata: {
              copilot: true,
              planStep: step.stepIndex,
              tool: toolName,
              outcome: toolResult.ok ? "SUCCESS" : "FAILURE",
            },
          });
        } catch {
          // audit failure is non-blocking
        }
      }

      copilotExecutionsTotal.inc({ tool: toolName, status: toolResult.ok ? "success" : "failure" });
      copilotExecutionDuration.observe({ tool: toolName }, toolResult.latencyMs / 1000);

      await this.writeStepAudit(
        planId,
        step,
        toolName,
        toolResult.ok ? "SUCCESS" : "FAILURE",
        context,
        toolResult.latencyMs,
      );

      return { step, result: toolResult, confirmationRequired: false, confirmationRequest: null };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Tool execution failed";
      const errResult: ToolResult = {
        ok: false,
        data: null,
        error: errorMsg,
        latencyMs: Date.now() - start,
        auditEvent: null,
      };
      step.status = "failed";
      step.result = errResult;
      step.errorMessage = errorMsg;
      copilotExecutionErrorsTotal.inc({ tool: toolName, reason: err instanceof z.ZodError ? "invalid_params" : "execution_failed" });
      await this.writeStepAudit(planId, step, toolName, "FAILURE", context, Date.now() - start);
      return { step, result: errResult, confirmationRequired: false, confirmationRequest: null };
    }
  }

  private async writeStepAudit(
    planId: string,
    step: CopilotStep,
    toolName: string | null,
    outcome: "SUCCESS" | "FAILURE" | "DENIED",
    context: ToolContext,
    latencyMs: number,
  ): Promise<void> {
    try {
      await getAuditWriter().write({
        action: "COPILOT_STEP_EXECUTED",
        resourceType: "CopilotPlan",
        resourceId: planId,
        outcome,
        tenantId: context.tenantId,
        actorId: context.actorId,
        actorEmail: context.actorEmail,
        actorRole: context.actorRole as never,
        changes: {
          stepIndex: step.stepIndex,
          action: step.action,
          tool: toolName,
        },
        metadata: {
          source: "copilot",
          outcome,
          tool: toolName,
          latencyMs,
        },
      });
    } catch {
      // audit failure is non-blocking
    }
  }
}
