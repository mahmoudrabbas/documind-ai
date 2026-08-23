import { createHash } from "node:crypto";
import { Types as MongooseTypes } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  ACTION_NEEDS_INPUT,
  BAD_REQUEST,
  NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import type { AgentExecutionContext } from "../agents/agentExecutionContext.js";
import type { SupervisorRunInput, SupervisorRuntime } from "../agents/supervisorRuntime.js";
import { deterministicExtractToolInput } from "./action/extractActionInput.js";
import { listApprovalsForRun } from "../agents/agents.repository.js";
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
import { matchFlowToUtterance } from "./guide/guideIntent.js";
import type { GuideSession } from "./guide/guide.contracts.js";
import type { ActionDraft, ActionPlan, ActionResult } from "./action/action.contracts.js";
import type { ToolInputValidation } from "./action/extractActionInput.js";
import {
  createCopilotRunHooks,
  getCopilotSupervisorRuntime,
  getCopilotSupervisorPersistence,
  getCopilotToolRegistry,
  initializeCopilotRuntime,
  missingFieldsFromIssues,
  schemaFieldMap,
} from "./copilotComposition.js";
import { evaluatorReauthorize } from "./action/reauthorize.js";
import { writeCopilotActionAudit } from "./copilot.audit.js";
import type { StorageProvider, SecurityScanner, ProcessingDispatcher } from "../../providers/storage/types.js";
import CopilotActionIdempotencyModel from "./idempotency/actionIdempotency.model.js";
import { createRun } from "../agents/agents.repository.js";
import { getModelAdapter } from "../../providers/llm/index.js";
import {
  answerActionDraft,
  cancelActionDraft,
  createActionDraft,
} from "./draft/actionDraft.service.js";
import type { CreateActionDraftInput } from "./draft/actionDraft.service.js";

interface CopilotMessageInput {
  utterance: string;
  locale?: "en" | "ar";
  routeContext?: string;
}

interface CopilotMessageOutput {
  mode: "guide" | "action" | "action_input" | "clarify";
  guideSession?: GuideSession;
  actionPlan?: ActionPlan;
  /** Present when a low-risk action executed directly and produced a result. */
  result?: ActionResult;
  /** Present when the action needs more parameters and an interactive draft was opened. */
  actionDraft?: ActionDraft;
  approvalId?: string;
  clarify?: {
    message: string;
    suggestedFlows: string[];
    suggestedActions: string[];
    /** Why the clarification was shown; the panel renders a tailored heading. */
    kind?: "generic" | "capability_unavailable";
    /** The guide flow the panel should promote as the recommended next step. */
    recommendedFlowId?: string;
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
  locale?: "en" | "ar";
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
  const toolRegistry = getCopilotToolRegistry();

  // Create the pending AgentRun first and adopt its persisted `_id` as the
  // canonical run id. SupervisorRuntime.execute() requires the AgentRun to
  // already exist in a pending state keyed by that exact id, so the runId must
  // be the one Mongo persisted (run.id), never a separately minted ObjectId.
  const run = await createRun({
    tenantId: context.tenantId,
    actorId: context.actorId,
    workflowName: "guider-v1",
    agentName: "platform-guide-agent",
    input: {
      utterance: input.utterance,
      locale: input.locale ?? "en",
      ...(input.routeContext ? { routeContext: input.routeContext } : {}),
    },
    modelProvider: "copilot",
    modelName: "supervisor",
    promptVersion: null,
    promptVersionId: null,
    toolVersionSnapshot: null,
    traceId: context.traceId,
    requestId: context.requestId,
  });
  const runId = run.id;
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
    ...createCopilotRunHooks(toolRegistry),
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
    const output = result.output as { mode: string; reasonCode?: string; flowIdHint?: string; guideSession?: GuideSession; actionPlan?: ActionPlan };
    if (output.mode === "clarify") {
      // The supervisor's clarify completion carries only the mode; the panel
      // needs the full payload (message + suggestions) to render anything,
      // so enrich it here for every clarify outcome. An explicit no-guide
      // request with no matching tool ("create the role X for me — do not
      // guide me through the UI") gets a tailored unsupported-capability
      // payload instead of the generic "could you clarify?".
      if (output.reasonCode === "capability_unavailable") {
        return await buildCapabilityUnavailablePayload(
          context,
          input.locale ?? "en",
          input.utterance,
          output.flowIdHint,
        );
      }
      return await buildClarifyPayload(context, input.locale ?? "en");
    }
    if (output.mode === "action" && output.actionPlan) {
      return {
        mode: "action",
        actionPlan: output.actionPlan,
        result:
          result.totalToolCalls > 0
            ? buildActionResult(
                result.output,
                output.actionPlan,
                input.locale ?? "en",
              )
            : undefined,
      };
    }
    return {
      mode: output.mode as "guide" | "action" | "clarify",
      guideSession: output.guideSession,
      actionPlan: output.actionPlan,
    };
  }

  if (result.status === "awaiting_approval") {
    const approvals = await listApprovalsForRun(context.tenantId, runId);
    const approval = approvals.find(
      (candidate) => candidate.status === "pending",
    );
    const approvalPlan = extractPlanFromApproval(approval);

    if (!approval || !approvalPlan) {
      throw new AppError(
        400,
        "RUN_FAILED",
        "Action requires confirmation but no pending approval was found for this run.",
      );
    }

    return {
      mode: "action",
      actionPlan: approvalPlan,
      approvalId: approval.id,
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

    // The guide agent rejected an explicit no-guide request (defense-in-depth;
    // the classifier normally routes these to the capability-unavailable
    // clarify before the guide agent is ever called).
    if (code === "CAPABILITY_UNAVAILABLE") {
      return buildCapabilityUnavailablePayload(
        context,
        input.locale ?? "en",
        input.utterance,
      );
    }

    // The resolveToolInput hook aborted the run because the action needs
    // parameters the utterance did not provide. Open an interactive draft so
    // the panel can ask for them one at a time.
    if (code === ACTION_NEEDS_INPUT) {
      const details = parseNeedsInputMessage(result.error.message);
      if (!details) {
        throw new AppError(400, ACTION_NEEDS_INPUT, "Action requires more information");
      }
      return {
        mode: "action_input",
        actionDraft: await startActionDraft({
          toolName: details.toolName,
          missing: details.missing,
          utterance: input.utterance,
          locale: input.locale ?? "en",
          context,
        }),
      };
    }

    // The runtime preserved the tool's error message, but tool failures here
    // travel without a toolName (the LLM decided the tool call directly), so
    // humanize by error code — quota, missing document, duplicate email, ...
    const humanized = humanizeToolFailure(
      {
        code,
        message:
          typeof result.error.message === "string" &&
          result.error.message !== result.error.code
            ? result.error.message
            : "The assistant could not complete that request",
        details:
          typeof result.error.details === "object" &&
          result.error.details !== null
            ? (result.error.details as Record<string, unknown>)
            : undefined,
      },
      "",
    );
    throw new AppError(
      code === "TARGET_NOT_FOUND" ? 404 : 400,
      humanized.code,
      humanized.message,
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
      kind: "generic",
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

/**
 * The user asked to perform an action no tool supports directly ("create the
 * role HR Manager for me — do not guide me through the UI"). Instead of the
 * generic clarify, say the capability isn't available yet and surface the
 * matching guide flow so they can complete the task step by step.
 */
async function buildCapabilityUnavailablePayload(
  context: AgentExecutionContext,
  locale: "en" | "ar",
  utterance: string,
  flowIdHint?: string,
): Promise<CopilotMessageOutput> {
  const availableFlows = await listAvailableGuideFlows({
    tenantId: context.tenantId,
    actorId: context.actorId,
    actorRole: context.actorRole as "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE",
    locale,
  });
  const hint = flowIdHint
    ? flowIdHint
    : matchFlowToUtterance(utterance, locale, availableFlows)?.flowId ??
      undefined;
  // A recommendation is only safe when a flow was confidently matched to the
  // request. We must NOT promote roles.create merely because it happens to be
  // in the actor's catalog: an unrelated capability-unavailable request (no
  // matched flow) must not render "Create a role" as recommended. The message
  // key keeps its existing catalog-aware semantics (unchanged) so the displayed
  // message never diverges from what was already shown.
  const recommendedFlowId =
    hint && availableFlows.includes(hint) ? hint : undefined;
  const messageKey =
    (hint === "roles.create" && availableFlows.includes(hint)) ||
    (!hint && availableFlows.includes("roles.create"))
      ? "copilot.clarify.roleCreateUnavailable"
      : "copilot.clarify.capabilityUnavailable";
  return {
    mode: "clarify",
    clarify: {
      kind: "capability_unavailable",
      message: localizeGuideKey(messageKey, locale),
      suggestedFlows: availableFlows,
      suggestedActions: [],
      recommendedFlowId,
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
  toolRegistry?: ToolRegistry;
}

export interface CopilotActionRunOutcome {
  plan: ActionPlan;
  approvalId?: string;
  /** Present when the run completed and a tool actually executed. */
  result?: ActionResult;
}

/**
 * Runs a copilot action with an explicit toolName+toolInput (no classifier):
 * the supervisor validates the input through the resolveToolInput hook, then
 * either executes the tool (low/reversible risk) or parks the run awaiting a
 * confirmation approval (destructive risk). Returns the plan plus, when the
 * tool already ran, its localized result.
 */
export async function runCopilotAction(
  input: CopilotActionInput,
  context: AgentExecutionContext,
  options: { idempotencyKey?: string; deps?: CreateActionPlanDeps } = {},
): Promise<CopilotActionRunOutcome> {
  const persistence = options.deps?.persistence ?? getCopilotSupervisorPersistence();

  if (options.idempotencyKey) {
    const replayed = await tryReplayActionPlan(context, options.idempotencyKey, persistence);
    if (replayed) {
      return toRunOutcome(replayed);
    }
  }

  const runtime = options.deps?.runtime ?? getCopilotSupervisorRuntime();
  const toolRegistry = options.deps?.toolRegistry ?? getCopilotToolRegistry();

  // Create the pending AgentRun first and adopt its persisted `_id` as the
  // canonical run id, mirroring the chat production flow. The runtime requires
  // the AgentRun to already exist in pending state keyed by run.id, so the
  // runId passed to execute() is the Mongo-persisted id, never a pre-generated
  // caller-side ObjectId.
  const run = await createRun({
    tenantId: context.tenantId,
    actorId: context.actorId,
    workflowName: "guider-v1",
    agentName: "platform-guide-agent",
    input: {
      utterance: input.utterance ?? "",
      locale: input.locale ?? "en",
      toolName: input.toolName,
      toolInput: input.toolInput,
    },
    modelProvider: "copilot",
    modelName: "supervisor",
    promptVersion: null,
    promptVersionId: null,
    toolVersionSnapshot: null,
    traceId: context.traceId,
    requestId: context.requestId,
  });
  const runId = run.id;
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

  // Claim the idempotency key BEFORE execution so concurrent duplicates
  // replay instead of launching a second run/approval.
  if (options.idempotencyKey) {
    try {
      await recordIdempotencyMapping(context, options.idempotencyKey, runId);
    } catch {
      const winner = await tryReplayActionPlan(context, options.idempotencyKey, persistence);
      if (winner) {
        return toRunOutcome(winner);
      }
    }
  }

  const result = await runtime.execute(runInput, {
    ...createCopilotRunHooks(toolRegistry),
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

  if (result.status === "failed" && result.error) {
    const code =
      typeof result.error.code === "string" ? result.error.code : "RUN_FAILED";

    if (code === ACTION_NEEDS_INPUT) {
      throw new AppError(
        400,
        ACTION_NEEDS_INPUT,
        typeof result.error.message === "string"
          ? result.error.message
          : JSON.stringify({ toolName: input.toolName, missing: [] }),
      );
    }

    // The tool executed and failed — surface a human-readable failure like the
    // confirm path does (quota, missing document, duplicate email, ...).
    const humanized = humanizeToolFailure(
      {
        code,
        message:
          typeof result.error.message === "string"
            ? result.error.message
            : "Tool execution failed",
        details:
          typeof result.error.details === "object" && result.error.details !== null
            ? (result.error.details as Record<string, unknown>)
            : undefined,
      },
      input.toolName ?? "",
    );
    throw new AppError(
      code === "TARGET_NOT_FOUND" ? 404 : 400,
      humanized.code,
      humanized.message,
    );
  }

  if (!plan) {
    throw new AppError(400, "RUN_FAILED", "Failed to create action plan");
  }

  const outcome = toRunOutcome(plan);
  if (
    !outcome.approvalId &&
    result.status === "completed" &&
    result.output &&
    result.totalToolCalls > 0
  ) {
    outcome.result = buildActionResult(
      result.output,
      outcome.plan,
      input.locale ?? "en",
    );
  }
  return outcome;
}

function toRunOutcome(
  plan: ActionPlan & { approvalId?: string },
): CopilotActionRunOutcome {
  return {
    plan: {
      runId: plan.runId,
      intent: plan.intent,
      toolName: plan.toolName,
      risk: plan.risk,
      requiresConfirmation: plan.requiresConfirmation,
      summary: plan.summary,
      target: plan.target,
      ...(plan.undo ? { undo: plan.undo } : {}),
    },
    ...(plan.approvalId ? { approvalId: plan.approvalId } : {}),
  };
}

export type CreateActionPlanResult =
  | {
      mode: "action";
      actionPlan: ActionPlan & { approvalId?: string };
      /** Present when the low-risk action executed directly and produced a result. */
      result?: ActionResult;
    }
  | { mode: "action_input"; actionDraft: ActionDraft };

export async function createActionPlan(
  input: CopilotActionInput,
  context: AgentExecutionContext,
  options: { idempotencyKey?: string; deps?: CreateActionPlanDeps } = {},
): Promise<CreateActionPlanResult> {
  const toolRegistry = options.deps?.toolRegistry ?? undefined;

  // Pre-check: validate tool input against the schema before the runtime
  // starts.  Guardrails may intercept destructive tool_call decisions and
  // route to awaitApproval *before* the resolveToolInput hook fires, so a
  // bare chip click for a destructive tool would bypass the hook entirely
  // and return a completed plan with empty toolInput.  Detecting missing
  // fields here ensures every incomplete chip click produces a draft
  // regardless of the runtime's guardrail/hook path.
  if (input.toolName && toolRegistry) {
    const tool = toolRegistry.get(input.toolName);
    if (tool) {
      const proposedInput = input.toolInput ?? {};
      const parsed = tool.schema.inputSchema.safeParse(proposedInput);
      if (!parsed.success) {
        const missing = missingFieldsFromIssues(parsed.error);
        if (missing.length > 0) {
          return {
            mode: "action_input",
            actionDraft: await startActionDraft({
              toolName: input.toolName,
              missing,
              utterance: input.utterance ?? "",
              locale: input.locale ?? "en",
              context,
              toolRegistry,
            }),
          };
        }
      }
    }
  }

  try {
    const outcome = await runCopilotAction(input, context, options);
    const plan: ActionPlan & { approvalId?: string } = {
      runId: outcome.plan.runId,
      intent: outcome.plan.intent,
      toolName: outcome.plan.toolName,
      risk: outcome.plan.risk,
      requiresConfirmation: outcome.plan.requiresConfirmation,
      summary: outcome.plan.summary,
      target: outcome.plan.target,
      ...(outcome.plan.undo ? { undo: outcome.plan.undo } : {}),
    };
    if (outcome.approvalId) plan.approvalId = outcome.approvalId;
    return {
      mode: "action",
      actionPlan: plan,
      ...(outcome.result ? { result: outcome.result } : {}),
    };
  } catch (error) {
    if (error instanceof AppError && error.code === ACTION_NEEDS_INPUT) {
      const details = parseNeedsInputMessage(error.message);
      if (details) {
        return {
          mode: "action_input",
          actionDraft: await startActionDraft({
            toolName: details.toolName,
            missing: details.missing,
            utterance: input.utterance ?? "",
            locale: input.locale ?? "en",
            context,
            toolRegistry,
          }),
        };
      }
    }
    throw error;
  }
}

/**
 * The resolveToolInput hook aborts a run with ACTION_NEEDS_INPUT and a
 * JSON-encoded message because the failed run can only carry a code + message
 * back through terminalFailed. Decode it back into a structured hint.
 */
function parseNeedsInputMessage(
  message: unknown,
): { toolName: string; missing: string[] } | null {
  if (typeof message !== "string") return null;
  try {
    const parsed = JSON.parse(message) as Record<string, unknown>;
    if (typeof parsed.toolName !== "string" || !Array.isArray(parsed.missing)) {
      return null;
    }
    return {
      toolName: parsed.toolName,
      missing: parsed.missing.filter((item) => typeof item === "string"),
    };
  } catch {
    return null;
  }
}

/** Builds a "tool executed" ActionResult from the completed run's output. */
function buildActionResult(
  output: Record<string, unknown>,
  plan: ActionPlan,
  locale: "en" | "ar",
): ActionResult {
  const reserved = new Set([
    "mode",
    "actionPlan",
    "reasonCode",
    "flowIdHint",
    "guideSession",
    "runId",
    "summary",
  ]);
  const toolOutput: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output)) {
    if (!reserved.has(key) && value !== undefined && value !== null) {
      toolOutput[key] = value;
    }
  }
  return {
    runId: plan.runId,
    status: "completed",
    toolName: plan.toolName,
    output: toolOutput,
    message: actionResultMessage(plan.toolName, locale, toolOutput),
    ...(plan.undo ? { undo: plan.undo } : {}),
  };
}

const ACTION_RESULT_KEYS: Record<string, string> = {
  "user.invite": "copilot.action.result.user.invite",
  "user.resendInvitation": "copilot.action.result.user.resendInvitation",
  "user.revokeInvitation": "copilot.action.result.user.revokeInvitation",
  "user.delete": "copilot.action.result.user.delete",
  "document.search": "copilot.action.result.document.search",
  "document.get": "copilot.action.result.document.get",
  "document.updateMetadata": "copilot.action.result.document.updateMetadata",
  "document.archive": "copilot.action.result.document.archive",
  "document.restore": "copilot.action.result.document.restore",
  "document.softDelete": "copilot.action.result.document.softDelete",
  "document.permanentDelete": "copilot.action.result.document.permanentDelete",
  "settings.update": "copilot.action.result.settings.update",
  "roles.create": "copilot.action.result.roles.create",
};

function actionResultMessage(
  toolName: string,
  locale: "en" | "ar",
  output: Record<string, unknown>,
): string {
  // The invited person's identity is carried by the tool output — surface it
  // so the confirmation reads like the manual flow ("Invited Sara Ali
  // (sara@company.com) as EMPLOYEE") instead of a generic "Done.".
  const user = output.user as
    | { name?: string; email?: string; role?: string }
    | undefined;
  if (user?.name) {
    if (toolName === "user.invite") {
      return localizeGuideKey("copilot.action.result.user.invite.named", locale)
        .replace("{name}", user.name)
        .replace("{email}", user.email ?? "")
        .replace("{role}", displayRole(user.role ?? ""));
    }
    if (toolName === "user.resendInvitation") {
      return localizeGuideKey("copilot.action.result.user.resendInvitation.named", locale)
        .replace("{name}", user.name)
        .replace("{email}", user.email ?? "");
    }
  }
  const role = output.role as { name?: string } | undefined;
  if (toolName === "roles.create" && role?.name) {
    return localizeGuideKey("copilot.action.result.roles.create.named", locale)
      .replace("{name}", role.name);
  }
  const key =
    ACTION_RESULT_KEYS[toolName] ?? "copilot.action.result.success";
  return localizeGuideKey(key, locale);
}

function displayRole(role: string): string {
  if (role === "COMPANY_ADMIN") return "company admin";
  if (role === "EMPLOYEE") return "employee";
  return role;
}

function makeToolInputValidator(
  toolRegistry: ToolRegistry,
  toolName: string,
): (input: Record<string, unknown>) => ToolInputValidation {
  return (input) => {
    const tool = toolRegistry.get(toolName);
    if (!tool) return { ok: false, missing: [] };
    const parsed = tool.schema.inputSchema.safeParse(input);
    if (parsed.success) return { ok: true, missing: [] };
    return { ok: false, missing: missingFieldsFromIssues(parsed.error) };
  };
}

async function startActionDraft(opts: {
  toolName: string;
  missing: string[];
  utterance: string;
  locale: "en" | "ar";
  context: AgentExecutionContext;
  toolRegistry?: ToolRegistry;
}): Promise<ActionDraft> {
  const registry = opts.toolRegistry ?? getCopilotToolRegistry();
  const model = await getModelAdapter();

  // Seed the draft with values the deterministic extractor already pulled from
  // the utterance (email, name, role, search text, etc.) so the user doesn't
  // have to repeat themselves.
  const extracted = deterministicExtractToolInput({
    toolName: opts.toolName,
    utterance: opts.utterance,
  });

  const draftInput: CreateActionDraftInput = {
    toolName: opts.toolName,
    toolInput: extracted,
    utterance: opts.utterance,
    locale: opts.locale,
    tenantId: opts.context.tenantId,
    actorId: opts.context.actorId,
    missing: opts.missing,
    deps: {
      validate: (toolInput, toolName) =>
        makeToolInputValidator(registry, toolName)(toolInput),
      schemaFields: schemaFieldMap(registry, opts.toolName),
      model,
    },
  };
  return createActionDraft(draftInput);
}

export type ActionDraftAnswerResult =
  | { completed: false; draft: ActionDraft }
  | { completed: true; outcome: CopilotActionRunOutcome };

/**
 * Answers the draft's current question. When every required field is present,
 * completes the draft and runs the action end-to-end (destructive actions go
 * through the approval flow; low-risk actions execute immediately and return
 * their result).
 */
export async function answerCopilotActionDraft(
  input: { draftId: string; answer: string },
  context: AgentExecutionContext,
): Promise<ActionDraftAnswerResult> {
  const registry = getCopilotToolRegistry();
  const model = await getModelAdapter();
  const answered = await answerActionDraft({
    draftId: input.draftId,
    answer: input.answer,
    tenantId: context.tenantId,
    actorId: context.actorId,
    deps: {
      validate: (toolInput, toolName) =>
        makeToolInputValidator(registry, toolName)(toolInput),
      schemaFields: {},
      model,
    },
  });
  if (!answered.completed) {
    return { completed: false, draft: answered.draft };
  }

  const outcome = await runCopilotAction(
    {
      utterance: answered.utterance,
      toolName: answered.toolName,
      toolInput: answered.toolInput,
      locale: answered.locale,
    },
    context,
  );
  return { completed: true, outcome };
}

export async function cancelCopilotActionDraft(
  draftId: string,
  context: AgentExecutionContext,
): Promise<void> {
  await cancelActionDraft({
    draftId,
    tenantId: context.tenantId,
    actorId: context.actorId,
  });
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
): Promise<RunRecord & { resultMessage?: string }> {
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

  // Self-approval segregation: prevent a user from approving their own
  // destructive action. Low-risk and reversible actions are exempt.
  if (input.decision === "approve" && approval.requestedBy === actor.actorId) {
    const approvalCtx = approval.context as Record<string, unknown> | undefined;
    const approvalPlan = (approvalCtx?.input as Record<string, unknown> | undefined)
      ?.actionPlan as Record<string, unknown> | undefined;
    const risk = typeof approvalPlan?.risk === "string" ? approvalPlan.risk : "low";
    if (risk === "destructive") {
      throw new AppError(
        403,
        "SELF_ACTION_FORBIDDEN",
        "You cannot approve your own destructive action. Ask a colleague to review it.",
      );
    }
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

  // Schema re-validation: even though the plan was validated at creation time,
  // the tool schema could have changed (hot-reload) or the input could have
  // been tampered with in the approval context. Reject early with a clear
  // error instead of executing a broken tool call.
  const tool = toolRegistry.get(toolName);
  if (tool) {
    const parsed = tool.schema.inputSchema.safeParse(toolInput);
    if (!parsed.success) {
      await persistence.completeRun(tenantId, runId, {
        status: "failed",
        error: {
          code: "VALIDATION_ERROR",
          message: "Tool input no longer matches the expected schema",
        },
      });
      const failedRun = await persistence.getRun(tenantId, runId);
      if (!failedRun) throw new AppError(404, NOT_FOUND, "Run not found");
      return failedRun;
    }
  }

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
  if (status === "completed") {
    const locale = input.locale ?? "en";
    return {
      ...resolvedRun,
      resultMessage: actionResultMessage(
        toolName,
        locale,
        (output ?? {}) as Record<string, unknown>,
      ),
    };
  }
  return resolvedRun;
}
