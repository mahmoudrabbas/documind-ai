import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_INPUT_TOKEN_BUDGET_EXCEEDED,
  AGENT_MAX_HANDOFFS_EXCEEDED,
  AGENT_MAX_STEPS_EXCEEDED,
  AGENT_MAX_TOOL_CALLS_EXCEEDED,
  AGENT_OUTPUT_TOKEN_BUDGET_EXCEEDED,
  AGENT_TIME_BUDGET_EXCEEDED,
  AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED,
} from "../../common/errors/errorCodes.js";
import type { ModelCompletionUsage } from "./agents.types.js";

/**
 * Platform hard maximums. Every dimension of a run budget is bounded; an
 * "unlimited" or Infinity value is never accepted at any layer.
 */
export const HARD_MAX_STEPS = 100;
export const HARD_MAX_HANDOFFS = 20;
export const HARD_MAX_TOOL_CALLS = 200;
export const HARD_MAX_INPUT_TOKENS = 1_000_000;
export const HARD_MAX_OUTPUT_TOKENS = 1_000_000;
export const HARD_MAX_TOTAL_TOKENS = 1_000_000;
export const HARD_MAX_BUDGET_MS = 3_600_000;

export const MAX_STEP_TOKENS = 4_096;

export interface AgentBudget {
  readonly maxSteps: number;
  readonly maxHandoffs: number;
  readonly maxToolCalls: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxTotalTokens: number;
  readonly budgetMs: number;
}

/**
 * Partial limit set that may come from a workflow definition (defaults) or
 * from a run-specific override. `maxTokens` is the legacy alias for
 * `maxTotalTokens` and is kept for backward compatibility.
 */
export interface BudgetLimits {
  maxSteps?: number;
  maxHandoffs?: number;
  maxToolCalls?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxTotalTokens?: number;
  maxTokens?: number;
  budgetMs?: number;
}

export const budgetLimitsSchema = z
  .object({
    maxSteps: z.number().int().positive().max(HARD_MAX_STEPS).optional(),
    maxHandoffs: z.number().int().positive().max(HARD_MAX_HANDOFFS).optional(),
    maxToolCalls: z
      .number()
      .int()
      .positive()
      .max(HARD_MAX_TOOL_CALLS)
      .optional(),
    maxInputTokens: z
      .number()
      .int()
      .positive()
      .max(HARD_MAX_INPUT_TOKENS)
      .optional(),
    maxOutputTokens: z
      .number()
      .int()
      .positive()
      .max(HARD_MAX_OUTPUT_TOKENS)
      .optional(),
    maxTotalTokens: z
      .number()
      .int()
      .positive()
      .max(HARD_MAX_TOTAL_TOKENS)
      .optional(),
    maxTokens: z
      .number()
      .int()
      .positive()
      .max(HARD_MAX_TOTAL_TOKENS)
      .optional(),
    budgetMs: z.number().int().positive().max(HARD_MAX_BUDGET_MS).optional(),
  })
  .strict();

export type BudgetLimitsInput = z.infer<typeof budgetLimitsSchema>;

export function normalizeBudgetLimits(input: unknown): BudgetLimits {
  return budgetLimitsSchema.parse(input);
}

function strictest(values: Array<number | undefined>): number {
  const defined = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  if (defined.length === 0) {
    throw new Error("No finite budget limit source available");
  }
  return Math.min(...defined);
}

/**
 * Resolves the effective budget for a run. Precedence (strictest wins):
 * platform hard maximums < workflow defaults < run-specific limits. Every
 * dimension is bounded by the platform hard maximum.
 */
export function resolveAgentBudget(input: {
  workflow?: BudgetLimits;
  run?: BudgetLimits;
}): AgentBudget {
  const workflow = input.workflow ?? {};
  const run = input.run ?? {};

  const workflowTotal = workflow.maxTotalTokens ?? workflow.maxTokens;
  const runTotal = run.maxTotalTokens ?? run.maxTokens;

  return {
    maxSteps: strictest([HARD_MAX_STEPS, workflow.maxSteps, run.maxSteps]),
    maxHandoffs: strictest([
      HARD_MAX_HANDOFFS,
      workflow.maxHandoffs,
      run.maxHandoffs,
    ]),
    maxToolCalls: strictest([
      HARD_MAX_TOOL_CALLS,
      workflow.maxToolCalls,
      run.maxToolCalls,
    ]),
    maxInputTokens: strictest([
      HARD_MAX_INPUT_TOKENS,
      workflow.maxInputTokens,
      run.maxInputTokens,
    ]),
    maxOutputTokens: strictest([
      HARD_MAX_OUTPUT_TOKENS,
      workflow.maxOutputTokens,
      run.maxOutputTokens,
    ]),
    maxTotalTokens: strictest([
      HARD_MAX_TOTAL_TOKENS,
      workflowTotal,
      runTotal,
    ]),
    budgetMs: strictest([HARD_MAX_BUDGET_MS, workflow.budgetMs, run.budgetMs]),
  };
}

/**
 * Builds run-specific budget limits from the legacy RunContext fields, so
 * existing maxSteps/maxToolCalls/maxTokens/budgetMs settings keep working.
 */
export function budgetLimitsFromRunContext(limits: {
  maxSteps?: number;
  maxToolCalls?: number;
  maxTokens?: number;
  budgetMs?: number;
}): BudgetLimits {
  return normalizeBudgetLimits({
    ...(limits.maxSteps !== undefined ? { maxSteps: limits.maxSteps } : {}),
    ...(limits.maxToolCalls !== undefined
      ? { maxToolCalls: limits.maxToolCalls }
      : {}),
    ...(limits.maxTokens !== undefined
      ? { maxTokens: limits.maxTokens }
      : {}),
    ...(limits.budgetMs !== undefined ? { budgetMs: limits.budgetMs } : {}),
  });
}

export interface AgentBudgetCounters {
  steps: number;
  handoffs: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Central, per-run budget tracker. Counters never reset across handoffs. All
 * enforcement fails closed: the tracker throws a typed AppError before an
 * action that would exceed a limit may run.
 */
export class AgentBudgetTracker {
  private readonly budget: AgentBudget;
  private readonly clock: () => number;
  private readonly startedAt: number;
  private readonly deadline: number;
  private steps = 0;
  private handoffs = 0;
  private toolCalls = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private totalTokens = 0;
  private lastTouchAt: number;

  constructor(budget: AgentBudget, clock: () => number = Date.now) {
    this.budget = budget;
    this.clock = clock;
    this.startedAt = this.clock();
    this.deadline = this.startedAt + budget.budgetMs;
    this.lastTouchAt = this.startedAt;
  }

  get counters(): AgentBudgetCounters {
    return {
      steps: this.steps,
      handoffs: this.handoffs,
      toolCalls: this.toolCalls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      totalTokens: this.totalTokens,
    };
  }

  get elapsedMs(): number {
    return this.clock() - this.startedAt;
  }

  get remainingMs(): number {
    return Math.max(0, this.deadline - this.clock());
  }

  /** Checks the wall-clock deadline. Call before and after async operations. */
  assertWithinDeadline(): void {
    if (this.clock() > this.deadline) {
      throw budgetExceeded(AGENT_TIME_BUDGET_EXCEEDED);
    }
  }

  /** Checks a new step may start. Throws before exceeding maxSteps. */
  assertCanStartStep(): void {
    if (this.steps >= this.budget.maxSteps) {
      throw budgetExceeded(AGENT_MAX_STEPS_EXCEEDED);
    }
    this.assertWithinDeadline();
  }

  assertCanHandoff(): void {
    if (this.handoffs >= this.budget.maxHandoffs) {
      throw budgetExceeded(AGENT_MAX_HANDOFFS_EXCEEDED);
    }
    this.assertWithinDeadline();
  }

  assertCanUseTool(): void {
    if (this.toolCalls >= this.budget.maxToolCalls) {
      throw budgetExceeded(AGENT_MAX_TOOL_CALLS_EXCEEDED);
    }
    this.assertWithinDeadline();
  }

  recordStep(): void {
    this.steps++;
    this.lastTouchAt = this.clock();
  }

  recordHandoff(): void {
    this.handoffs++;
    this.lastTouchAt = this.clock();
  }

  recordToolCall(): void {
    this.toolCalls++;
    this.lastTouchAt = this.clock();
  }

  /**
   * Records token usage from a ModelCompletionResponse.usage and fails closed
   * immediately if any token budget is exceeded.
   */
  recordUsage(usage: ModelCompletionUsage): void {
    const input = Number.isFinite(usage.promptTokens) ? usage.promptTokens : 0;
    const output = Number.isFinite(usage.completionTokens)
      ? usage.completionTokens
      : 0;
    const total = Number.isFinite(usage.totalTokens) ? usage.totalTokens : 0;
    this.inputTokens += input;
    this.outputTokens += output;
    this.totalTokens += total;
    this.lastTouchAt = this.clock();

    if (this.inputTokens > this.budget.maxInputTokens) {
      throw budgetExceeded(AGENT_INPUT_TOKEN_BUDGET_EXCEEDED);
    }
    if (this.outputTokens > this.budget.maxOutputTokens) {
      throw budgetExceeded(AGENT_OUTPUT_TOKEN_BUDGET_EXCEEDED);
    }
    if (this.totalTokens > this.budget.maxTotalTokens) {
      throw budgetExceeded(AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED);
    }
  }

  recordLatency(ms: number): void {
    this.lastTouchAt = this.clock() + ms;
  }
}

function budgetExceeded(code: string): AppError {
  return new AppError(409, code, `Budget limit exceeded: ${code}`);
}
