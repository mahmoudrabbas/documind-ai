import { AppError } from "../../common/errors/AppError.js";
import { AGENT_EXECUTOR_NOT_FOUND, AGENT_HANDOFF_INVALID, AGENT_OUTPUT_SCHEMA_INVALID, AGENT_PROVIDER_ERROR, AGENT_STATE_TRANSITION_INVALID, AGENT_UNREGISTERED_TOOL, SUPERVISOR_DECISION_INVALID } from "../../common/errors/errorCodes.js";
import type { AgentResultMetadata } from "./agentContract.js";
import { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import { normalizeAgentExecutionContext, type AgentExecutionContext, type AgentExecutionContextInput } from "./agentExecutionContext.js";
import type { AgentRunContext } from "./agentRunContext.js";
import type { ModelAdapter, ModelCompletionMessage, ModelCompletionUsage, RunStatus } from "./agents.types.js";
import type { ChatAgentId } from "./chatAgents.js";
import type { ChatWorkflowDefinition, ChatWorkflowId, WorkflowRegistry } from "./chatWorkflow.js";
import { validateAgentHandoff } from "./handoff.js";
import { parseSupervisorDecision, supervisorDecisionCurrentAgent, type SupervisorDecision, type SupervisorDecisionAction } from "./supervisorDecision.js";
import { AgentBudgetTracker, MAX_STEP_TOKENS, normalizeBudgetLimits, resolveAgentBudget, type AgentBudget, type BudgetLimits } from "./supervisorBudgets.js";
import { createDefaultSupervisorGuardrails, OutputSchemaGuardrail, SupervisorGuardrailEvaluator, type SupervisorGuardrail, type SupervisorGuardrailContext, type SupervisorGuardrailOutcome } from "./supervisorGuardrails.js";
import type { SupervisorPersistence, SupervisorStepPatch } from "./supervisorPersistence.js";
import { ToolRegistry } from "./toolRegistry.js";

/**
 * Supervisor decision provider. The runtime only ever consumes a strict JSON
 * decision plus its token usage; it never falls back to prose planning.
 */
export interface SupervisorDecisionRequest {
  context: AgentExecutionContext;
  workflow: ChatWorkflowDefinition;
  currentAgent: ChatAgentId;
  previousAgent: ChatAgentId | null;
  input: Record<string, unknown>;
  history: readonly SupervisorHistoryEntry[];
  availableTools: readonly SupervisorToolDescriptor[];
}

export interface SupervisorToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputFields: readonly string[];
  readonly requiredPermission: string | null;
  readonly approvalRequired: boolean;
}

export interface SupervisorDecisionContent {
  content: string;
  usage: ModelCompletionUsage;
}

export interface SupervisorDecisionModel {
  readonly providerKey: string;
  readonly modelName: string;
  decide(request: SupervisorDecisionRequest): Promise<SupervisorDecisionContent>;
}

export interface SupervisorHistoryEntry {
  agent: ChatAgentId;
  action: SupervisorDecisionAction;
  reasonCode: string;
}

export interface SupervisorRunInput {
  runId: string;
  workflowId: ChatWorkflowId;
  context: AgentExecutionContextInput | AgentExecutionContext;
  input: Record<string, unknown>;
  budgetLimits?: unknown;
}

export interface SupervisorRuntimeHooks {
  /**
   * Optional trusted, request-scoped stage resolver. When present, the
   * runtime obtains the next controlled transition from this hook without
   * consulting the probabilistic supervisor model. Specialized agents and
   * tools still execute normally. This prevents provider nondeterminism or
   * availability from changing deterministic workflow orchestration.
   */
  resolveDecisionBeforeModel?(args: {
    workflowId: string;
    currentAgent: string;
    currentInput: Record<string, unknown>;
  }): SupervisorDecision;
  resolveDecision?(args: {
    workflowId: string;
    currentAgent: string;
    currentInput: Record<string, unknown>;
    proposedDecision: SupervisorDecision;
  }): SupervisorDecision;
  resolveHandoffPayload?(args: {
    workflowId: string;
    fromAgent: string;
    toAgent: string;
    currentInput: Record<string, unknown>;
    proposedPayload: Record<string, unknown>;
  }): Record<string, unknown>;
  resolveToolInput?(args: {
    workflowId: string;
    currentAgent: string;
    toolName: string;
    currentInput: Record<string, unknown>;
    proposedInput: Record<string, unknown>;
  }): Record<string, unknown>;
  resolveCompleteResult?(args: {
    workflowId: string;
    currentAgent: string;
    currentInput: Record<string, unknown>;
    proposedResult: Record<string, unknown>;
  }): Record<string, unknown>;
  onToolResult?(args: {
    workflowId: string;
    currentAgent: string;
    toolName: string;
    validatedOutput: Record<string, unknown>;
    currentInput: Record<string, unknown>;
  }): void;
}

export interface SupervisorRunResult {
  runId: string;
  workflowId: ChatWorkflowId;
  status: RunStatus;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  totalSteps: number;
  totalToolCalls: number;
  totalTokensUsed: number | null;
  estimatedCost: number | null;
  latencyMs: number;
  handoffsCount: number;
  approvalsCount: number;
  guardrailResult: Record<string, unknown> | null;
}

export interface SupervisorRuntimeConfig {
  model: SupervisorDecisionModel;
  workflowRegistry: WorkflowRegistry;
  executorRegistry: AgentExecutorRegistry;
  toolRegistry: ToolRegistry;
  persistence: SupervisorPersistence;
  guardrails?: SupervisorGuardrail[];
  clock?: () => number;
}

const BUDGET_EXCEEDED_CODES = new Set([
  "AGENT_BUDGET_EXHAUSTED",
  "AGENT_MAX_STEPS_EXCEEDED",
  "AGENT_MAX_HANDOFFS_EXCEEDED",
  "AGENT_MAX_TOOL_CALLS_EXCEEDED",
  "AGENT_INPUT_TOKEN_BUDGET_EXCEEDED",
  "AGENT_OUTPUT_TOKEN_BUDGET_EXCEEDED",
  "AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED",
  "AGENT_TIME_BUDGET_EXCEEDED",
]);

const SYSTEM_PROMPT = [
  "You are the chat-rag-v1 supervisor orchestrating the approved chat agents.",
  "Respond with exactly one JSON object and nothing else: no prose, no markdown, no code fences.",
  "Actions:",
  "- {\"action\":\"handoff\",\"currentAgent\":\"<current>\",\"nextAgent\":\"<agent>\",\"reasonCode\":\"<short-code>\",\"payload\":{...}} to delegate to an agent",
  "- {\"action\":\"tool_call\",\"currentAgent\":\"<current>\",\"toolName\":\"<name>\",\"toolInput\":{...},\"reasonCode\":\"<short-code>\"} to invoke a tool",
  "- {\"action\":\"complete\",\"currentAgent\":\"<current>\",\"result\":{...},\"reasonCode\":\"<short-code>\"} to finish the run with a result",
  "- {\"action\":\"fail\",\"currentAgent\":\"<current>\",\"error\":{\"code\":\"<CODE>\",\"message\":\"<message>\"},\"reasonCode\":\"<short-code>\"} to fail the run",
  "- {\"action\":\"await_approval\",\"currentAgent\":\"<current>\",\"approval\":{\"action\":\"<human-action>\",\"requiredRole\":\"EMPLOYEE\"},\"reasonCode\":\"<short-code>\"} to request human approval",
  "The currentAgent must exactly match the agent whose turn it is.",
  "Use only exact nextAgent values from allowedHandoffs.",
  "Use only exact toolName values from availableTools. Never invent, rename, or alias a tool.",
  "If availableTools is empty, tool_call is not allowed.",
].join("\n");

function buildSupervisorMessages(
  request: SupervisorDecisionRequest,
): ModelCompletionMessage[] {
  const user: ModelCompletionMessage = {
    role: "user",
    content: JSON.stringify({
      workflowId: request.workflow.id,
      currentAgent: request.currentAgent,
      previousAgent: request.previousAgent,
      entryAgent: request.workflow.entryAgent,
      allowedHandoffs: request.workflow.allowedHandoffs[request.currentAgent] ?? [],
      availableTools: request.availableTools,
      input: request.input,
      history: request.history,
    }),
  };
  return [
    { role: "system", content: SYSTEM_PROMPT },
    user,
  ];
}

/**
 * Production decision provider backed by the existing ModelAdapter. It is the
 * only place the runtime touches a completion adapter: messages are built here
 * and the returned text is parsed strictly by parseSupervisorDecision.
 */
export class ModelAdapterSupervisorDecisionModel
  implements SupervisorDecisionModel
{
  readonly providerKey: string;
  readonly modelName: string;
  private readonly adapter: ModelAdapter;

  constructor(adapter: ModelAdapter) {
    this.adapter = adapter;
    this.providerKey = adapter.providerKey;
    this.modelName =
      (adapter as ModelAdapter & { model?: string }).model ?? adapter.providerKey;
  }

  async decide(
    request: SupervisorDecisionRequest,
  ): Promise<SupervisorDecisionContent> {
    const response = await this.adapter.complete({
      messages: buildSupervisorMessages(request),
      temperature: 0,
      maxTokens: MAX_STEP_TOKENS,
    });
    const content = response.choices[0]?.message?.content ?? "";
    return { content, usage: response.usage };
  }
}

interface LoopState {
  runId: string;
  workflow: ChatWorkflowDefinition;
  context: AgentExecutionContext;
  budget: AgentBudget;
  tracker: AgentBudgetTracker;
  currentAgent: ChatAgentId;
  previousAgent: ChatAgentId | null;
  visitedAgents: ChatAgentId[];
  transitionPairs: Set<string>;
  history: SupervisorHistoryEntry[];
  currentInput: Record<string, unknown>;
  stepCount: number;
  totalToolCalls: number;
  totalTokensUsed: number;
  estimatedCost: number;
  handoffsCount: number;
  approvalsCount: number;
  allOutcomes: SupervisorGuardrailOutcome[];
  hooks: SupervisorRuntimeHooks;
}

/**
 * Deterministic, fail-closed supervisor runtime.
 *
 * Guarantees:
 * - the model is never trusted to pick a tenant, actor, workflow, or payload;
 * - every decision is validated against the strict contract before any action;
 * - guardrails run before the model call (invariants) and after it (action);
 * - budgets are enforced before/after async operations, per run, per handoff,
 *   per tool call, and per token dimension;
 * - handoff cycles are detected from the transition-pair history;
 * - the run terminates exactly once with a safe terminal status;
 * - no prompt, raw provider output, document, or secret is ever persisted.
 */
export class SupervisorRuntime {
  private readonly model: SupervisorDecisionModel;
  private readonly workflowRegistry: WorkflowRegistry;
  private readonly executorRegistry: AgentExecutorRegistry;
  private readonly toolRegistry: ToolRegistry;
  private readonly persistence: SupervisorPersistence;
  private readonly guardrails: SupervisorGuardrailEvaluator;
  private readonly clock: () => number;

  constructor(config: SupervisorRuntimeConfig) {
    this.model = config.model;
    this.workflowRegistry = config.workflowRegistry;
    this.executorRegistry = config.executorRegistry;
    this.toolRegistry = config.toolRegistry;
    this.persistence = config.persistence;
    this.guardrails = new SupervisorGuardrailEvaluator(
      config.guardrails ?? createDefaultSupervisorGuardrails({
        agentRegistry: config.executorRegistry.definitionsRegistry(),
        toolRegistry: config.toolRegistry,
      }),
    );
    this.clock = config.clock ?? Date.now;
  }

  async execute(
    input: SupervisorRunInput,
    hooks: SupervisorRuntimeHooks = {},
  ): Promise<SupervisorRunResult> {
    const startedAt = this.clock();
    const context = normalizeAgentExecutionContext(input.context);
    const workflow = this.workflowRegistry.require(input.workflowId);
    const budget = resolveAgentBudget({
      workflow: this.workflowBudget(workflow),
      run: input.budgetLimits
        ? normalizeBudgetLimits(input.budgetLimits)
        : undefined,
    });
    const tracker = new AgentBudgetTracker(budget, this.clock);

    const state: LoopState = {
      runId: input.runId,
      workflow,
      context,
      budget,
      tracker,
      currentAgent: workflow.entryAgent,
      previousAgent: null,
      visitedAgents: [workflow.entryAgent],
      transitionPairs: new Set(),
      history: [],
      currentInput: input.input,
      stepCount: 0,
      totalToolCalls: 0,
      totalTokensUsed: 0,
      estimatedCost: 0,
      handoffsCount: 0,
      approvalsCount: 0,
      allOutcomes: [],
      hooks,
    };

    let status: RunStatus = "running";
    let output: Record<string, unknown> | null = null;
    let error: Record<string, unknown> | null = null;

    const startedRun = await this.persistence.startRun(
      context.tenantId,
      input.runId,
    );
    if (!startedRun || startedRun.status !== "running") {
      throw new AppError(
        409,
        AGENT_STATE_TRANSITION_INVALID,
        `AgentRun ${input.runId} must exist in pending state before execution`,
      );
    }

    while (status === "running") {
      try {
        const result = await this.runStep(state);
        status = result.status;
        output = result.output;
        error = result.error;
      } catch (caught) {
        const isAppError = caught instanceof AppError;
        const code = isAppError ? caught.code : AGENT_PROVIDER_ERROR;
        if (
          isAppError &&
          (BUDGET_EXCEEDED_CODES.has(code) ||
            code === SUPERVISOR_DECISION_INVALID)
        ) {
          const message = caught.message;
          await this.writeBlockedStep(state, [], {
            code,
            message,
          });
          status = "failed";
          error = { code, message };
        } else {
          throw caught;
        }
      }
    }

    const latencyMs = this.clock() - startedAt;
    await this.persistence.completeRun(context.tenantId, input.runId, {
      status,
      output,
      error,
      totalSteps: state.stepCount,
      totalToolCalls: state.totalToolCalls,
      totalTokensUsed: state.totalTokensUsed,
      estimatedCost: state.estimatedCost,
      latencyMs,
      handoffsCount: state.handoffsCount,
      approvalsCount: state.approvalsCount,
      guardrailResult: {
        outcomes: state.allOutcomes,
        blocked: status === "failed",
      },
    });

    return {
      runId: input.runId,
      workflowId: workflow.id,
      status,
      output,
      error,
      totalSteps: state.stepCount,
      totalToolCalls: state.totalToolCalls,
      totalTokensUsed: state.totalTokensUsed,
      estimatedCost: state.estimatedCost,
      latencyMs,
      handoffsCount: state.handoffsCount,
      approvalsCount: state.approvalsCount,
      guardrailResult: {
        outcomes: state.allOutcomes,
        blocked: status === "failed",
      },
    };
  }

  private async runStep(state: LoopState): Promise<{
    status: RunStatus;
    output: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
  }> {
    const { context, workflow, tracker } = state;

    tracker.assertCanStartStep();
    tracker.assertWithinDeadline();

    const baseCtx = this.baseGuardrailContext(state);

    const invariantOutcomes = await this.guardrails.evaluate(baseCtx);
    const invariantDenial = this.guardrails.findDenial(invariantOutcomes);
    if (invariantDenial) {
      state.allOutcomes.push(...invariantOutcomes);
      await this.writeBlockedStep(state, invariantOutcomes, {
        code: invariantDenial.reasonCode,
        message: `Guardrail ${invariantDenial.guardrailName} denied the run`,
      });
      return this.terminalFailed(invariantDenial.reasonCode);
    }

    let decision: SupervisorDecision;
    let usage: ModelCompletionUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    try {
      if (state.hooks.resolveDecisionBeforeModel) {
        decision = parseSupervisorDecision(
          JSON.stringify(
            state.hooks.resolveDecisionBeforeModel({
              workflowId: workflow.id,
              currentAgent: state.currentAgent,
              currentInput: state.currentInput,
            }),
          ),
        );
      } else {
        const content = await this.model.decide({
          context,
          workflow,
          currentAgent: state.currentAgent,
          previousAgent: state.previousAgent,
          input: state.currentInput,
          history: state.history,
          availableTools: this.availableToolDescriptors(),
        });
        usage = content.usage;
        if (Number.isFinite(usage.totalTokens)) {
          state.totalTokensUsed += usage.totalTokens;
        }
        tracker.recordUsage(usage);
        tracker.assertWithinDeadline();
        const proposedDecision = parseSupervisorDecision(content.content);
        if (supervisorDecisionCurrentAgent(proposedDecision) !== state.currentAgent) {
          throw new AppError(
            400,
            SUPERVISOR_DECISION_INVALID,
            `Decision currentAgent mismatch (expected ${state.currentAgent})`,
          );
        }
        decision = state.hooks.resolveDecision
          ? parseSupervisorDecision(
              JSON.stringify(
                state.hooks.resolveDecision({
                  workflowId: workflow.id,
                  currentAgent: state.currentAgent,
                  currentInput: state.currentInput,
                  proposedDecision,
                }),
              ),
            )
          : proposedDecision;
      }
      if (supervisorDecisionCurrentAgent(decision) !== state.currentAgent) {
        throw new AppError(
          400,
          SUPERVISOR_DECISION_INVALID,
          `Resolved decision currentAgent mismatch (expected ${state.currentAgent})`,
        );
      }
    } catch (caught) {
      const code =
        caught instanceof AppError
          ? caught.code
          : SUPERVISOR_DECISION_INVALID;
      const message =
        caught instanceof AppError
          ? caught.message
          : "Supervisor decision failed";
      await this.writeBlockedStep(state, invariantOutcomes, { code, message });
      state.allOutcomes.push(...invariantOutcomes);
      return this.terminalFailed(code, message);
    }

    const actionCtx = this.actionGuardrailContext(baseCtx, decision);
    const actionOutcomes = await this.guardrails.evaluate(actionCtx);
    const allOutcomes = [...invariantOutcomes, ...actionOutcomes];
    state.allOutcomes.push(...allOutcomes);

    const approvalRequired = this.guardrails.findApprovalRequired(actionOutcomes);
    if (approvalRequired) {
      return this.awaitApproval(state, allOutcomes, {
        action: decision.action,
        reasonCode: decision.reasonCode,
      });
    }

    const denial = this.guardrails.findDenial(actionOutcomes);
    if (denial) {
      await this.writeBlockedStep(state, allOutcomes, {
        code: denial.reasonCode,
        message: `Guardrail ${denial.guardrailName} denied the action`,
      });
      return this.terminalFailed(denial.reasonCode);
    }

    tracker.recordStep();

    try {
      switch (decision.action) {
        case "handoff":
          return await this.executeHandoff(state, decision, actionCtx, allOutcomes);
        case "tool_call":
          return await this.executeToolCall(state, decision, allOutcomes);
        case "complete":
          return await this.executeComplete(state, decision, allOutcomes);
        case "fail":
          return await this.executeFail(state, decision, allOutcomes);
        case "await_approval":
          return await this.awaitApproval(state, allOutcomes, {
            action: decision.approval.action,
            reasonCode: decision.reasonCode,
          });
        default:
          return this.terminalFailed(
            SUPERVISOR_DECISION_INVALID,
            "Unknown supervisor decision action",
          );
      }
    } catch (caught) {
      const code =
        caught instanceof AppError ? caught.code : AGENT_PROVIDER_ERROR;
      const message =
        caught instanceof AppError
          ? caught.message
          : "Supervisor action execution failed";
      await this.writeBlockedStep(state, allOutcomes, { code, message });
      return this.terminalFailed(code, message);
    }
  }

  private async executeHandoff(
    state: LoopState,
    decision: Extract<SupervisorDecision, { action: "handoff" }>,
    actionCtx: SupervisorGuardrailContext,
    outcomes: SupervisorGuardrailOutcome[],
  ): Promise<{
    status: RunStatus;
    output: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
  }> {
    const { context, workflow, tracker } = state;
    const fromAgent = state.currentAgent;
    const toAgent = decision.nextAgent;

    tracker.assertCanHandoff();
    tracker.assertWithinDeadline();

    const step = await this.createStep(state, "handoff", actionCtx.input);

    const runContext = this.buildRunContext(state, toAgent, step.stepIndex);

    if (toAgent !== workflow.entryAgent) {
      let contract;
      try {
        contract = this.executorRegistry.requireExecutor(toAgent);
      } catch (caught) {
        const code =
          caught instanceof AppError ? caught.code : AGENT_EXECUTOR_NOT_FOUND;
        await this.completeStepWith(state, step.id, {
          status: "failed",
          guardrails: outcomes,
          handoffToAgent: toAgent,
          previousAgent: fromAgent,
          error: { code, message: `No executor for handoff target ${toAgent}` },
        });
        return this.terminalFailed(code);
      }

      let validated;
      try {
        const resolvedPayload = state.hooks.resolveHandoffPayload
          ? state.hooks.resolveHandoffPayload({
              workflowId: workflow.id,
              fromAgent,
              toAgent,
              currentInput: state.currentInput,
              proposedPayload: decision.payload,
            })
          : decision.payload;
        validated = validateAgentHandoff({
          workflowRegistry: this.workflowRegistry,
          workflowId: workflow.id,
          envelope: {
            workflowId: workflow.id,
            fromAgent,
            toAgent,
            requestId: context.requestId,
            traceId: context.traceId,
            reasonCode: decision.reasonCode,
            payload: resolvedPayload,
          },
          targetInputSchema: contract.inputSchema,
        });
      } catch (caught) {
        const code =
          caught instanceof AppError ? caught.code : AGENT_HANDOFF_INVALID;
        await this.completeStepWith(state, step.id, {
          status: "failed",
          guardrails: outcomes,
          handoffToAgent: toAgent,
          previousAgent: fromAgent,
          error: { code, message: `Handoff rejected: ${toAgent}` },
        });
        return this.terminalFailed(code);
      }

      tracker.assertWithinDeadline();
      const executorResult = await contract.execute(
        runContext,
        validated.payload as never,
      );
      tracker.assertWithinDeadline();

      // Trace the executor's observed LLM usage into run totals. The executor
      // reports metadata only; prompts, raw provider output, and
      // chain-of-thought are never part of the result.
      if (executorResult.metadata) {
        if (typeof executorResult.metadata.tokensUsed === "number") {
          state.totalTokensUsed += executorResult.metadata.tokensUsed;
        }
        if (typeof executorResult.metadata.estimatedCost === "number") {
          state.estimatedCost += executorResult.metadata.estimatedCost;
        }
      }
      const tracingPatch = this.stepTracingPatch(
        executorResult.metadata,
        executorResult.latencyMs,
      );

      const outputOutcome = new OutputSchemaGuardrail().evaluate({
        ...actionCtx,
        executorOutput: executorResult.ok ? executorResult.output : undefined,
        outputSchema: contract.outputSchema,
      });
      const fullOutcomes = [...outcomes, outputOutcome];

      // The specialized agent's execution is attributed to its own step, so
      // multi-agent runs persist one step per executing agent while the
      // handoff above stays traceable as a handoff. The handoff step is closed
      // as completed (the transition itself succeeded) and any executor
      // failure is recorded on the dedicated execution step.
      const executionStep = await this.createStep(
        state,
        "execute",
        validated.payload as Record<string, unknown>,
        toAgent,
      );

      const completeHandoff = async (status: "completed" | "failed") => {
        await this.completeStepWith(state, step.id, {
          status,
          guardrails: fullOutcomes,
          handoffToAgent: toAgent,
          previousAgent: fromAgent,
        });
      };

      if (outputOutcome.decision === "deny") {
        await completeHandoff("completed");
        await this.completeStepWith(state, executionStep.id, {
          status: "failed",
          guardrails: fullOutcomes,
          error: {
            code: outputOutcome.reasonCode,
            message: `Executor output failed ${outputOutcome.guardrailName}`,
          },
          ...tracingPatch,
        });
        return this.terminalFailed(outputOutcome.reasonCode);
      }

      if (!executorResult.ok) {
        const executorError = {
          code:
            typeof executorResult.error?.code === "string"
              ? executorResult.error.code
              : AGENT_PROVIDER_ERROR,
          message:
            typeof executorResult.error?.message === "string"
              ? executorResult.error.message
              : "Executor failed",
        };
        await completeHandoff("completed");
        await this.completeStepWith(state, executionStep.id, {
          status: "failed",
          guardrails: fullOutcomes,
          error: executorError,
          ...tracingPatch,
        });
        return this.terminalFailed(executorError.code, executorError.message);
      }

      state.currentInput = {
        ...state.currentInput,
        ...(executorResult.output as Record<string, unknown>),
      };
      this.transitionHandoff(state, toAgent, decision.reasonCode);
      await completeHandoff("completed");
      await this.completeStepWith(state, executionStep.id, {
        status: "completed",
        guardrails: fullOutcomes,
        output: (executorResult.output as Record<string, unknown>) ?? {},
        ...tracingPatch,
      });
      return this.continueRun();
    }

    this.transitionHandoff(state, toAgent, decision.reasonCode);
    await this.completeStepWith(state, step.id, {
      status: "completed",
      guardrails: outcomes,
      output: {},
      handoffToAgent: toAgent,
      previousAgent: fromAgent,
    });
    return this.continueRun();
  }

  private async executeToolCall(
    state: LoopState,
    decision: Extract<SupervisorDecision, { action: "tool_call" }>,
    outcomes: SupervisorGuardrailOutcome[],
  ): Promise<{
    status: RunStatus;
    output: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
  }> {
    const { context, tracker } = state;
    tracker.assertCanUseTool();
    tracker.assertWithinDeadline();

    const tool = this.toolRegistry.get(decision.toolName);
    if (!tool) {
      throw new AppError(
        400,
        AGENT_UNREGISTERED_TOOL,
        `Tool ${decision.toolName} is not registered`,
      );
    }

    const resolvedInput = state.hooks.resolveToolInput
      ? state.hooks.resolveToolInput({
          workflowId: state.workflow.id,
          currentAgent: state.currentAgent,
          toolName: decision.toolName,
          currentInput: state.currentInput,
          proposedInput: decision.toolInput,
        })
      : decision.toolInput;
    const parsedInput = tool.schema.inputSchema.safeParse(resolvedInput);
    if (!parsedInput.success) {
      throw new AppError(
        400,
        SUPERVISOR_DECISION_INVALID,
        `Resolved input for tool ${decision.toolName} is invalid`,
        parsedInput.error.issues,
      );
    }
    const validatedInput = parsedInput.data as Record<string, unknown>;

    const step = await this.createStep(state, "tool_call", validatedInput);
    const runContext = this.buildRunContext(state, state.currentAgent, step.stepIndex);

    const toolCall = await this.persistence.createToolCall({
      runId: state.runId,
      stepId: step.id,
      tenantId: context.tenantId,
      toolName: decision.toolName,
      toolVersion: "1.0.0",
      input: validatedInput,
      traceId: context.traceId,
      requestId: context.requestId,
    });

    const result = await this.toolRegistry.execute(
      runContext,
      decision.toolName,
      validatedInput,
      async (permission) => {
        if (!permission) return true;
        return (context.permissions ?? []).includes(permission);
      },
    );
    tracker.assertWithinDeadline();

    state.totalToolCalls++;
    tracker.recordToolCall();

    if (!result.ok) {
      await this.persistence.completeToolCall(context.tenantId, toolCall.id, {
        status: result.status,
        error: result.error,
        latencyMs: result.latencyMs,
        tokensUsed: result.tokensUsed ?? 0,
        estimatedCost: result.estimatedCost ?? 0,
      });
      await this.completeStepWith(state, step.id, {
        status: "failed",
        guardrails: outcomes,
        toolCallsCount: 1,
        error: result.error,
      });
      return this.terminalFailed(
        typeof result.error?.code === "string"
          ? result.error.code
          : AGENT_PROVIDER_ERROR,
      );
    }

    const parsedOutput = tool.schema.outputSchema.safeParse(result.output);
    if (!parsedOutput.success) {
      const toolError = {
        code: AGENT_OUTPUT_SCHEMA_INVALID,
        message: `Output from tool ${decision.toolName} failed schema validation`,
      };
      await this.persistence.completeToolCall(context.tenantId, toolCall.id, {
        status: "failed",
        error: toolError,
        latencyMs: result.latencyMs,
        tokensUsed: result.tokensUsed ?? 0,
        estimatedCost: result.estimatedCost ?? 0,
      });
      await this.completeStepWith(state, step.id, {
        status: "failed",
        guardrails: outcomes,
        toolCallsCount: 1,
        error: toolError,
      });
      return this.terminalFailed(AGENT_OUTPUT_SCHEMA_INVALID);
    }

    const validatedOutput = parsedOutput.data as Record<string, unknown>;
    await this.persistence.completeToolCall(context.tenantId, toolCall.id, {
      status: result.status,
      output: validatedOutput,
      error: result.error,
      latencyMs: result.latencyMs,
      tokensUsed: result.tokensUsed ?? 0,
      estimatedCost: result.estimatedCost ?? 0,
    });
    try {
      state.hooks.onToolResult?.({
        workflowId: state.workflow.id,
        currentAgent: state.currentAgent,
        toolName: decision.toolName,
        validatedOutput,
        currentInput: state.currentInput,
      });
    } catch (caught) {
      const callbackError = {
        code: caught instanceof AppError ? caught.code : AGENT_PROVIDER_ERROR,
        message:
          caught instanceof Error
            ? caught.message
            : "Tool result callback failed",
      };
      await this.completeStepWith(state, step.id, {
        status: "failed",
        guardrails: outcomes,
        toolCallsCount: 1,
        error: callbackError,
      });
      return this.terminalFailed(callbackError.code, callbackError.message);
    }
    state.currentInput = {
      ...state.currentInput,
      ...validatedOutput,
    };
    state.history.push({
      agent: state.currentAgent,
      action: "tool_call",
      reasonCode: decision.reasonCode,
    });
    await this.completeStepWith(state, step.id, {
      status: "completed",
      guardrails: outcomes,
      output: validatedOutput,
      toolCallsCount: 1,
    });
    return this.continueRun();
  }

  private async executeComplete(
    state: LoopState,
    decision: Extract<SupervisorDecision, { action: "complete" }>,
    outcomes: SupervisorGuardrailOutcome[],
  ): Promise<{
    status: RunStatus;
    output: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
  }> {
    const resolvedResult = state.hooks.resolveCompleteResult
      ? state.hooks.resolveCompleteResult({
          workflowId: state.workflow.id,
          currentAgent: state.currentAgent,
          currentInput: state.currentInput,
          proposedResult: decision.result,
        })
      : decision.result;
    const step = await this.createStep(state, "completed", state.currentInput);
    await this.completeStepWith(state, step.id, {
      status: "completed",
      guardrails: outcomes,
      output: resolvedResult,
    });
    return this.terminal("completed", resolvedResult, null);
  }

  private async executeFail(
    state: LoopState,
    decision: Extract<SupervisorDecision, { action: "fail" }>,
    outcomes: SupervisorGuardrailOutcome[],
  ): Promise<{
    status: RunStatus;
    output: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
  }> {
    const error = { code: decision.error.code, message: decision.error.message };
    const step = await this.createStep(state, "failed", state.currentInput);
    await this.completeStepWith(state, step.id, {
      status: "failed",
      guardrails: outcomes,
      error,
    });
    return this.terminalFailed(decision.error.code, decision.error.message);
  }

  private async awaitApproval(
    state: LoopState,
    outcomes: SupervisorGuardrailOutcome[],
    approval: { action: string; reasonCode: string },
  ): Promise<{
    status: RunStatus;
    output: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
  }> {
    const { context } = state;
    const step = await this.createStep(state, "approval_requested", state.currentInput);
    await this.persistence.createApproval({
      tenantId: context.tenantId,
      actorId: context.actorId,
      runId: state.runId,
      stepId: step.id,
      toolCallId: null,
      requestedBy: state.currentAgent,
      approverRole: null,
      context: {
        action: approval.action,
        currentAgent: state.currentAgent,
        input: state.currentInput,
      },
      ttlMs: 300_000,
      traceId: context.traceId,
    });
    state.approvalsCount++;
    state.history.push({
      agent: state.currentAgent,
      action: "await_approval",
      reasonCode: approval.reasonCode,
    });
    await this.completeStepWith(state, step.id, {
      status: "running",
      guardrails: outcomes,
      approvalsCount: 1,
    });
    return this.terminal("awaiting_approval", null, null);
  }

  private createStep(
    state: LoopState,
    action: "handoff" | "execute" | "tool_call" | "completed" | "failed" | "approval_requested" | "guardrail",
    input: Record<string, unknown>,
    agentName?: string,
  ) {
    const { context } = state;
    const stepIndex = state.stepCount;
    state.stepCount++;
    return this.persistence.createStep({
      runId: state.runId,
      tenantId: context.tenantId,
      stepIndex,
      agentName: agentName ?? state.currentAgent,
      action,
      input,
      guardrails: [],
      traceId: context.traceId,
      requestId: context.requestId,
    });
  }

  private async writeBlockedStep(
    state: LoopState,
    outcomes: SupervisorGuardrailOutcome[],
    error: { code: string; message: string },
  ): Promise<void> {
    const step = await this.createStep(state, "guardrail", state.currentInput);
    await this.completeStepWith(state, step.id, {
      status: "failed",
      guardrails: outcomes,
      error,
    });
  }

  private async completeStepWith(
    state: LoopState,
    stepId: string,
    patch: Parameters<SupervisorPersistence["completeStep"]>[2],
  ): Promise<void> {
    await this.persistence.completeStep(state.context.tenantId, stepId, patch);
  }

  /**
   * Maps executor-reported tracing metadata into the step patch. The latency
   * of the step is the executor's wall-clock duration; provider/model/prompt
   * and token/cost facts come from the executor's metadata when present.
   */
  private stepTracingPatch(
    metadata: AgentResultMetadata | undefined,
    latencyMs: number,
  ): Omit<SupervisorStepPatch, "status"> {
    if (!metadata) {
      return { latencyMs };
    }
    return {
      modelProvider: metadata.modelProvider ?? null,
      modelName: metadata.modelName ?? null,
      promptVersion: metadata.promptVersion ?? null,
      tokensUsed: metadata.tokensUsed,
      estimatedCost: metadata.estimatedCost,
      latencyMs,
    };
  }

  private baseGuardrailContext(
    state: LoopState,
  ): SupervisorGuardrailContext {
    return {
      context: state.context,
      workflow: state.workflow,
      currentAgent: state.currentAgent,
      previousAgent: state.previousAgent,
      input: state.currentInput,
      visitedAgents: state.visitedAgents,
      transitionPairs: state.transitionPairs,
      handoffCount: state.tracker.counters.handoffs,
      budget: state.budget,
      budgetCounters: state.tracker.counters,
      deadlineExceeded: state.tracker.remainingMs === 0,
    };
  }

  private actionGuardrailContext(
    base: SupervisorGuardrailContext,
    decision: SupervisorDecision,
  ): SupervisorGuardrailContext {
    if (decision.action === "handoff") {
      return { ...base, nextAgent: decision.nextAgent, payload: decision.payload };
    }
    if (decision.action === "tool_call") {
      const tool = this.toolRegistry.get(decision.toolName);
      return {
        ...base,
        toolName: decision.toolName,
        toolInput: decision.toolInput,
        toolPermission: tool?.schema.requiredPermission,
        toolApprovalRequired: tool?.schema.approvalRequired,
      };
    }
    if (decision.action === "complete") {
      return { ...base, requestOutput: decision.result };
    }
    return base;
  }

  private availableToolDescriptors(): readonly SupervisorToolDescriptor[] {
    return this.toolRegistry.list().map((tool) => {
      const inputSchema = tool.schema.inputSchema as {
        shape?: Record<string, unknown>;
      };
      return Object.freeze({
        name: tool.schema.name,
        description: tool.schema.description,
        inputFields: Object.freeze(Object.keys(inputSchema.shape ?? {})),
        requiredPermission: tool.schema.requiredPermission ?? null,
        approvalRequired: tool.schema.approvalRequired ?? false,
      });
    });
  }

  private transitionHandoff(
    state: LoopState,
    toAgent: ChatAgentId,
    reasonCode: string,
  ): void {
    state.transitionPairs.add(`${state.currentAgent}->${toAgent}`);
    state.handoffsCount++;
    state.tracker.recordHandoff();
    state.previousAgent = state.currentAgent;
    state.currentAgent = toAgent;
    state.visitedAgents.push(toAgent);
    state.history.push({
      agent: toAgent,
      action: "handoff",
      reasonCode,
    });
  }

  private buildRunContext(
    state: LoopState,
    agentName: ChatAgentId,
    stepIndex: number,
  ): AgentRunContext {
    return {
      tenantId: state.context.tenantId,
      actorId: state.context.actorId,
      actorEmail: state.context.actorEmail ?? "",
      actorRole: state.context.actorRole,
      traceId: state.context.traceId,
      requestId: state.context.requestId,
      workflowName: state.workflow.id,
      agentName,
      runId: state.runId,
      stepIndex,
      maxSteps: state.budget.maxSteps,
      maxToolCalls: state.budget.maxToolCalls,
      maxTokens: state.budget.maxTotalTokens,
      budgetMs: state.budget.budgetMs,
    };
  }

  private workflowBudget(
    workflow: ChatWorkflowDefinition,
  ): BudgetLimits | undefined {
    const metadata = workflow.metadata;
    if (!metadata || typeof metadata.budget !== "object" || !metadata.budget) {
      return undefined;
    }
    return metadata.budget as BudgetLimits;
  }

  private terminal(
    status: RunStatus,
    output: Record<string, unknown> | null,
    error: Record<string, unknown> | null,
  ): {
    status: RunStatus;
    output: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
  } {
    return { status, output, error };
  }

  private terminalFailed(
    code: string,
    message = code,
  ): {
    status: RunStatus;
    output: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
  } {
    return this.terminal("failed", null, { code, message });
  }

  private continueRun(): {
    status: RunStatus;
    output: Record<string, unknown> | null;
    error: Record<string, unknown> | null;
  } {
    return this.terminal("running", null, null);
  }
}
