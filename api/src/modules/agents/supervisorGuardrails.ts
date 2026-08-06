import { z } from "zod";
import {
  AGENT_ACTOR_CONTEXT_MISMATCH,
  AGENT_DISABLED,
  AGENT_HANDOFF_INVALID,
  AGENT_HANDOFF_LOOP_DETECTED,
  AGENT_INPUT_TOO_LARGE,
  AGENT_MAX_HANDOFFS_EXCEEDED,
  AGENT_MAX_STEPS_EXCEEDED,
  AGENT_MAX_TOOL_CALLS_EXCEEDED,
  AGENT_NOT_FOUND,
  AGENT_OUTPUT_SCHEMA_INVALID,
  AGENT_TENANT_CONTEXT_MISMATCH,
  AGENT_TIME_BUDGET_EXCEEDED,
  AGENT_TOOL_PERMISSION_DENIED,
  AGENT_UNREGISTERED_TOOL,
  AGENT_WORKFLOW_NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import type { AgentExecutionContext } from "./agentExecutionContext.js";
import type { ChatAgentId } from "./chatAgents.js";
import type { ChatAgentRegistry } from "./chatAgents.js";
import type { ChatWorkflowDefinition } from "./chatWorkflow.js";
import type { AgentBudget, AgentBudgetCounters } from "./supervisorBudgets.js";
import type { ToolRegistry } from "./toolRegistry.js";

export const SUPERVISOR_GUARDRAIL_DECISIONS = [
  "allow",
  "deny",
  "require_approval",
] as const;
export type SupervisorGuardrailDecision =
  (typeof SUPERVISOR_GUARDRAIL_DECISIONS)[number];

export interface SupervisorGuardrailOutcome {
  guardrailName: string;
  decision: SupervisorGuardrailDecision;
  reasonCode: string;
  approvalRequired: boolean;
  evaluatedAt: string;
}

export const MAX_INPUT_PAYLOAD_CHARS = 50_000;
export const MAX_OUTPUT_PAYLOAD_CHARS = 100_000;

const SENSITIVE_TOOL_NAMES = new Set([
  "request_approval",
  "handoff",
  "fail",
]);

export interface SupervisorGuardrailContext {
  readonly context: AgentExecutionContext;
  readonly workflow: ChatWorkflowDefinition;
  readonly currentAgent: ChatAgentId;
  readonly previousAgent: ChatAgentId | null;
  readonly input: Record<string, unknown>;
  readonly visitedAgents: readonly ChatAgentId[];
  readonly transitionPairs: ReadonlySet<string>;
  readonly handoffCount: number;
  readonly budget: AgentBudget;
  readonly budgetCounters: AgentBudgetCounters;
  readonly deadlineExceeded: boolean;
  readonly nextAgent?: ChatAgentId;
  readonly payload?: Record<string, unknown>;
  readonly toolName?: string;
  readonly toolInput?: Record<string, unknown>;
  readonly toolPermission?: string;
  readonly toolApprovalRequired?: boolean;
  readonly executorOutput?: unknown;
  readonly outputSchema?: z.ZodType;
  readonly requestOutput?: unknown;
}

export interface SupervisorGuardrail {
  readonly name: string;
  readonly priority: number;
  evaluate(
    context: SupervisorGuardrailContext,
  ): Promise<SupervisorGuardrailOutcome> | SupervisorGuardrailOutcome;
}

function allow(name: string, reasonCode = "GUARDRAIL_ALLOWED"): SupervisorGuardrailOutcome {
  return {
    guardrailName: name,
    decision: "allow",
    reasonCode,
    approvalRequired: false,
    evaluatedAt: new Date().toISOString(),
  };
}

function deny(name: string, reasonCode: string): SupervisorGuardrailOutcome {
  return {
    guardrailName: name,
    decision: "deny",
    reasonCode,
    approvalRequired: false,
    evaluatedAt: new Date().toISOString(),
  };
}

function requireApproval(
  name: string,
  reasonCode: string,
): SupervisorGuardrailOutcome {
  return {
    guardrailName: name,
    decision: "require_approval",
    reasonCode,
    approvalRequired: true,
    evaluatedAt: new Date().toISOString(),
  };
}

export class InputPayloadSizeGuardrail implements SupervisorGuardrail {
  readonly name = "input_payload_size";
  readonly priority = 100;
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    const size = JSON.stringify(context.input ?? {}).length;
    if (size > MAX_INPUT_PAYLOAD_CHARS) {
      return deny(this.name, AGENT_INPUT_TOO_LARGE);
    }
    return allow(this.name);
  }
}

export class TenantIdentityGuardrail implements SupervisorGuardrail {
  readonly name = "tenant_identity";
  readonly priority = 1000;
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    if (!context.context?.tenantId) {
      return deny(this.name, AGENT_TENANT_CONTEXT_MISMATCH);
    }
    return allow(this.name);
  }
}

export class ActorIdentityGuardrail implements SupervisorGuardrail {
  readonly name = "actor_identity";
  readonly priority = 1000;
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    if (!context.context?.actorId) {
      return deny(this.name, AGENT_ACTOR_CONTEXT_MISMATCH);
    }
    return allow(this.name);
  }
}

export class WorkflowValidityGuardrail implements SupervisorGuardrail {
  readonly name = "workflow_valid";
  readonly priority = 90;
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    const workflow = context.workflow;
    if (!workflow) {
      return deny(this.name, AGENT_WORKFLOW_NOT_FOUND);
    }
    if (!workflow.agents.includes(context.currentAgent)) {
      return deny(this.name, AGENT_WORKFLOW_NOT_FOUND);
    }
    return allow(this.name);
  }
}

export class AgentValidityGuardrail implements SupervisorGuardrail {
  readonly name = "agent_valid";
  readonly priority = 80;
  private readonly registry: ChatAgentRegistry | null;
  constructor(registry?: ChatAgentRegistry) {
    this.registry = registry ?? null;
  }
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    if (!this.registry) return allow(this.name);
    for (const id of [context.currentAgent, context.nextAgent].filter(
      (value): value is ChatAgentId => value !== undefined,
    )) {
      const definition = this.registry.get(id);
      if (!definition) {
        return deny(this.name, AGENT_NOT_FOUND);
      }
      if (definition.status !== "active") {
        return deny(this.name, AGENT_DISABLED);
      }
    }
    return allow(this.name);
  }
}

export class ToolValidityGuardrail implements SupervisorGuardrail {
  readonly name = "tool_valid";
  readonly priority = 70;
  private readonly toolRegistry: ToolRegistry | null;
  constructor(toolRegistry?: ToolRegistry) {
    this.toolRegistry = toolRegistry ?? null;
  }
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    if (!context.toolName) return allow(this.name);
    if (this.toolRegistry && !this.toolRegistry.get(context.toolName)) {
      return deny(this.name, AGENT_UNREGISTERED_TOOL);
    }
    return allow(this.name);
  }
}

export class HandoffTargetGuardrail implements SupervisorGuardrail {
  readonly name = "handoff_target_valid";
  readonly priority = 75;
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    if (!context.nextAgent) return allow(this.name);
    const workflow = context.workflow;
    if (!workflow.agents.includes(context.nextAgent)) {
      return deny(this.name, AGENT_HANDOFF_INVALID);
    }
    const allowed = workflow.allowedHandoffs[context.currentAgent] ?? [];
    if (!allowed.includes(context.nextAgent)) {
      return deny(this.name, AGENT_HANDOFF_INVALID);
    }
    return allow(this.name);
  }
}

export class HandoffCycleGuardrail implements SupervisorGuardrail {
  readonly name = "handoff_cycle";
  readonly priority = 60;
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    if (!context.nextAgent) return allow(this.name);
    const pair = `${context.currentAgent}->${context.nextAgent}`;
    if (context.transitionPairs.has(pair)) {
      return deny(this.name, AGENT_HANDOFF_LOOP_DETECTED);
    }
    return allow(this.name);
  }
}

export class HandoffCountGuardrail implements SupervisorGuardrail {
  readonly name = "handoff_count";
  readonly priority = 65;
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    if (context.handoffCount >= context.budget.maxHandoffs) {
      return deny(this.name, AGENT_MAX_HANDOFFS_EXCEEDED);
    }
    return allow(this.name);
  }
}

export class BudgetGuardrail implements SupervisorGuardrail {
  readonly name = "budget";
  readonly priority = 50;
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    const counters = context.budgetCounters;
    if (counters.steps >= context.budget.maxSteps) {
      return deny(this.name, AGENT_MAX_STEPS_EXCEEDED);
    }
    if (counters.toolCalls >= context.budget.maxToolCalls) {
      return deny(this.name, AGENT_MAX_TOOL_CALLS_EXCEEDED);
    }
    return allow(this.name);
  }
}

export class TimeoutGuardrail implements SupervisorGuardrail {
  readonly name = "timeout";
  readonly priority = 50;
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    if (context.deadlineExceeded) {
      return deny(this.name, AGENT_TIME_BUDGET_EXCEEDED);
    }
    return allow(this.name);
  }
}

export class ToolPermissionGuardrail implements SupervisorGuardrail {
  readonly name = "tool_permission";
  readonly priority = 55;
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    if (!context.toolPermission) return allow(this.name);
    const permissions = context.context.permissions ?? [];
    if (!permissions.includes(context.toolPermission)) {
      return deny(this.name, AGENT_TOOL_PERMISSION_DENIED);
    }
    return allow(this.name);
  }
}

export class SensitiveActionGuardrail implements SupervisorGuardrail {
  readonly name = "sensitive_action";
  readonly priority = 45;
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    const toolName = context.toolName;
    if (!toolName) return allow(this.name);
    if (
      context.toolApprovalRequired === true ||
      SENSITIVE_TOOL_NAMES.has(toolName)
    ) {
      return requireApproval(this.name, "SENSITIVE_ACTION_REQUIRES_APPROVAL");
    }
    return allow(this.name);
  }
}

export class OutputSchemaGuardrail implements SupervisorGuardrail {
  readonly name = "output_schema";
  readonly priority = 30;
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    if (context.outputSchema === undefined || context.executorOutput === undefined) {
      return allow(this.name);
    }
    if (!context.outputSchema.safeParse(context.executorOutput).success) {
      return deny(this.name, AGENT_OUTPUT_SCHEMA_INVALID);
    }
    return allow(this.name);
  }
}

export class OutputPayloadSizeGuardrail implements SupervisorGuardrail {
  readonly name = "output_payload_size";
  readonly priority = 35;
  evaluate(context: SupervisorGuardrailContext): SupervisorGuardrailOutcome {
    if (context.requestOutput === undefined) return allow(this.name);
    const size = JSON.stringify(context.requestOutput ?? {}).length;
    if (size > MAX_OUTPUT_PAYLOAD_CHARS) {
      return deny(this.name, AGENT_OUTPUT_SCHEMA_INVALID);
    }
    return allow(this.name);
  }
}

export interface SupervisorGuardrailEvaluatorDeps {
  agentRegistry?: ChatAgentRegistry;
  toolRegistry?: ToolRegistry;
}

export function createDefaultSupervisorGuardrails(
  deps: SupervisorGuardrailEvaluatorDeps = {},
): SupervisorGuardrail[] {
  return [
    new TenantIdentityGuardrail(),
    new ActorIdentityGuardrail(),
    new InputPayloadSizeGuardrail(),
    new WorkflowValidityGuardrail(),
    new AgentValidityGuardrail(deps.agentRegistry),
    new ToolValidityGuardrail(deps.toolRegistry),
    new HandoffTargetGuardrail(),
    new HandoffCountGuardrail(),
    new HandoffCycleGuardrail(),
    new ToolPermissionGuardrail(),
    new SensitiveActionGuardrail(),
    new OutputPayloadSizeGuardrail(),
    new OutputSchemaGuardrail(),
    new BudgetGuardrail(),
    new TimeoutGuardrail(),
  ];
}

export class SupervisorGuardrailEvaluator {
  private readonly guardrails: SupervisorGuardrail[];

  constructor(guardrails: SupervisorGuardrail[]) {
    this.guardrails = [...guardrails].sort(
      (a, b) => b.priority - a.priority,
    );
  }

  async evaluate(
    context: SupervisorGuardrailContext,
  ): Promise<SupervisorGuardrailOutcome[]> {
    const outcomes: SupervisorGuardrailOutcome[] = [];
    for (const guardrail of this.guardrails) {
      const outcome = await guardrail.evaluate(context);
      outcomes.push(outcome);
      if (outcome.decision !== "allow") {
        break;
      }
    }
    return outcomes;
  }

  findDenial(outcomes: SupervisorGuardrailOutcome[]): SupervisorGuardrailOutcome | null {
    return outcomes.find((outcome) => outcome.decision === "deny") ?? null;
  }

  findApprovalRequired(
    outcomes: SupervisorGuardrailOutcome[],
  ): SupervisorGuardrailOutcome | null {
    return outcomes.find(
      (outcome) => outcome.decision === "require_approval",
    ) ?? null;
  }
}
