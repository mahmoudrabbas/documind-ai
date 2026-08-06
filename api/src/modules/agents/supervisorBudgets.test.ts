import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
import {
  AgentBudgetTracker,
  HARD_MAX_BUDGET_MS,
  HARD_MAX_HANDOFFS,
  HARD_MAX_INPUT_TOKENS,
  HARD_MAX_OUTPUT_TOKENS,
  HARD_MAX_STEPS,
  HARD_MAX_TOOL_CALLS,
  HARD_MAX_TOTAL_TOKENS,
  budgetLimitsFromRunContext,
  budgetLimitsSchema,
  normalizeBudgetLimits,
  resolveAgentBudget,
} from "./supervisorBudgets.js";

describe("supervisor budgets", () => {
  it("resolves platform hard maximums when nothing else is provided", () => {
    const budget = resolveAgentBudget({});
    assert.equal(budget.maxSteps, HARD_MAX_STEPS);
    assert.equal(budget.maxHandoffs, HARD_MAX_HANDOFFS);
    assert.equal(budget.maxToolCalls, HARD_MAX_TOOL_CALLS);
    assert.equal(budget.maxInputTokens, HARD_MAX_INPUT_TOKENS);
    assert.equal(budget.maxOutputTokens, HARD_MAX_OUTPUT_TOKENS);
    assert.equal(budget.maxTotalTokens, HARD_MAX_TOTAL_TOKENS);
    assert.equal(budget.budgetMs, HARD_MAX_BUDGET_MS);
  });

  it("applies workflow defaults when run limits are absent", () => {
    const budget = resolveAgentBudget({
      workflow: { maxSteps: 5, maxToolCalls: 8 },
    });
    assert.equal(budget.maxSteps, 5);
    assert.equal(budget.maxToolCalls, 8);
    assert.equal(budget.maxTotalTokens, HARD_MAX_TOTAL_TOKENS);
  });

  it("strictest wins: run limits override workflow defaults", () => {
    const budget = resolveAgentBudget({
      workflow: { maxSteps: 20, maxToolCalls: 100 },
      run: { maxSteps: 4, maxToolCalls: 10 },
    });
    assert.equal(budget.maxSteps, 4);
    assert.equal(budget.maxToolCalls, 10);
  });

  it("strictest wins: a stricter workflow value beats a looser run value", () => {
    const budget = resolveAgentBudget({
      workflow: { maxSteps: 3 },
      run: { maxSteps: 10 },
    });
    assert.equal(budget.maxSteps, 3);
  });

  it("keeps the legacy maxTokens alias for total tokens", () => {
    const budget = resolveAgentBudget({
      run: { maxTokens: 5_000 },
    });
    assert.equal(budget.maxTotalTokens, 5_000);
  });

  it("rejects run limits above the platform hard maximum", () => {
    assert.throws(() =>
      normalizeBudgetLimits({ maxSteps: HARD_MAX_STEPS + 1 }),
    );
    assert.throws(() =>
      normalizeBudgetLimits({ budgetMs: HARD_MAX_BUDGET_MS + 1 }),
    );
  });

  it("rejects non-positive, zero, negative, and unknown budget keys", () => {
    assert.throws(() => normalizeBudgetLimits({ maxSteps: 0 }));
    assert.throws(() => normalizeBudgetLimits({ maxSteps: -1 }));
    assert.throws(() => normalizeBudgetLimits({ maxToolCalls: 0 }));
    assert.throws(() => normalizeBudgetLimits({ sneaky: 10 }));
    assert.equal(budgetLimitsSchema.safeParse({}).success, true);
  });

  it("maps legacy RunContext fields through budgetLimitsFromRunContext", () => {
    const limits = budgetLimitsFromRunContext({
      maxSteps: 10,
      maxToolCalls: 50,
      maxTokens: 40_000,
      budgetMs: 120_000,
    });
    assert.deepEqual(limits, {
      maxSteps: 10,
      maxToolCalls: 50,
      maxTokens: 40_000,
      budgetMs: 120_000,
    });
  });

  it("throws before exceeding the max steps", () => {
    const tracker = new AgentBudgetTracker(
      resolveAgentBudget({ run: { maxSteps: 2 } }),
      () => 1_000,
    );
    tracker.assertCanStartStep();
    tracker.recordStep();
    tracker.assertCanStartStep();
    tracker.recordStep();
    assert.throws(
      () => tracker.assertCanStartStep(),
      (error) =>
        error instanceof AppError && error.code === AGENT_MAX_STEPS_EXCEEDED,
    );
  });

  it("throws before exceeding the max handoffs", () => {
    const tracker = new AgentBudgetTracker(
      resolveAgentBudget({ run: { maxHandoffs: 1 } }),
      () => 1_000,
    );
    tracker.assertCanHandoff();
    tracker.recordHandoff();
    assert.throws(
      () => tracker.assertCanHandoff(),
      (error) =>
        error instanceof AppError &&
        error.code === AGENT_MAX_HANDOFFS_EXCEEDED,
    );
  });

  it("throws before exceeding the max tool calls", () => {
    const tracker = new AgentBudgetTracker(
      resolveAgentBudget({ run: { maxToolCalls: 1 } }),
      () => 1_000,
    );
    tracker.assertCanUseTool();
    tracker.recordToolCall();
    assert.throws(
      () => tracker.assertCanUseTool(),
      (error) =>
        error instanceof AppError &&
        error.code === AGENT_MAX_TOOL_CALLS_EXCEEDED,
    );
  });

  it("throws when the wall-clock deadline passes", () => {
    let now = 0;
    const tracker = new AgentBudgetTracker(
      resolveAgentBudget({ run: { budgetMs: 100 } }),
      () => now,
    );
    now = 101;
    assert.throws(
      () => tracker.assertWithinDeadline(),
      (error) =>
        error instanceof AppError && error.code === AGENT_TIME_BUDGET_EXCEEDED,
    );
  });

  it("enforces input, output, and total token budgets cumulatively", () => {
    const limits = {
      maxInputTokens: 10,
      maxOutputTokens: 10,
      maxTotalTokens: 20,
    };
    const usage = (promptTokens: number, completionTokens: number, totalTokens: number) => ({
      promptTokens,
      completionTokens,
      totalTokens,
    });

    const inputTracker = new AgentBudgetTracker(
      resolveAgentBudget({ run: limits }),
      () => 1_000,
    );
    inputTracker.recordUsage(usage(6, 4, 10));
    assert.throws(
      () => inputTracker.recordUsage(usage(5, 0, 5)),
      (error) =>
        error instanceof AppError &&
        error.code === AGENT_INPUT_TOKEN_BUDGET_EXCEEDED,
    );

    const outputTracker = new AgentBudgetTracker(
      resolveAgentBudget({ run: limits }),
      () => 1_000,
    );
    outputTracker.recordUsage(usage(2, 6, 8));
    assert.throws(
      () => outputTracker.recordUsage(usage(0, 5, 5)),
      (error) =>
        error instanceof AppError &&
        error.code === AGENT_OUTPUT_TOKEN_BUDGET_EXCEEDED,
    );

    const totalTracker = new AgentBudgetTracker(
      resolveAgentBudget({ run: limits }),
      () => 1_000,
    );
    totalTracker.recordUsage(usage(8, 8, 16));
    assert.throws(
      () => totalTracker.recordUsage(usage(1, 1, 5)),
      (error) =>
        error instanceof AppError &&
        error.code === AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED,
    );
  });

  it("counters accumulate across handoffs and never reset", () => {
    const now = 0;
    const tracker = new AgentBudgetTracker(
      resolveAgentBudget({ run: { maxHandoffs: 3, maxSteps: 10 } }),
      () => now,
    );
    tracker.recordStep();
    tracker.recordHandoff();
    tracker.recordStep();
    tracker.recordHandoff();
    assert.deepEqual(tracker.counters, {
      steps: 2,
      handoffs: 2,
      toolCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });
});
