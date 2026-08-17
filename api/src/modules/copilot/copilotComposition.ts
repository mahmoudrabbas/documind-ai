import { getModelAdapter } from "../../providers/llm/index.js";
import { SupervisorRuntime, type SupervisorRuntimeConfig, type SupervisorDecisionModel, type SupervisorDecisionContent, type SupervisorDecisionRequest } from "../agents/supervisorRuntime.js";
import type { AgentContract } from "../agents/agentContract.js";
import { AgentExecutorRegistry } from "../agents/agentExecutorRegistry.js";
import { ToolRegistry } from "../agents/toolRegistry.js";
import { MongoSupervisorPersistence } from "../agents/supervisorPersistence.js";
import { createDefaultSupervisorGuardrails } from "../agents/supervisorGuardrails.js";
import { createCopilotWorkflowRegistry } from "../agents/chatWorkflow.js";
import { assertSupervisorComposition } from "../agents/supervisorComposition.js";
import { platformGuideAgent } from "./agents/platformGuideAgent.js";
import {
  createPlatformActionAgent,
  platformActionToolCatalog,
} from "./agents/platformActionAgent.js";
import { CopilotClassifier } from "./agents/copilotSupervisor.js";
import { registerActionTools } from "./action/registerActionTools.js";
import type { ClassifierDecision } from "./action/action.contracts.js";
import type { StorageProvider, SecurityScanner, ProcessingDispatcher } from "../../providers/storage/types.js";
import type { SupervisorPersistence } from "../agents/supervisorPersistence.js";

let supervisorRuntimeInstance: SupervisorRuntime | null = null;
let copilotToolRegistryInstance: ToolRegistry | null = null;
let copilotPersistenceInstance: SupervisorPersistence | null = null;

export function getCopilotSupervisorRuntime(): SupervisorRuntime {
  if (!supervisorRuntimeInstance) {
    throw new Error("Copilot SupervisorRuntime not initialized. Call initializeCopilotRuntime() first.");
  }
  return supervisorRuntimeInstance;
}

export function getCopilotToolRegistry(): ToolRegistry {
  if (!copilotToolRegistryInstance) {
    throw new Error("Copilot ToolRegistry not initialized. Call initializeCopilotRuntime() first.");
  }
  return copilotToolRegistryInstance;
}

export function getCopilotSupervisorPersistence(): SupervisorPersistence {
  if (!copilotPersistenceInstance) {
    throw new Error("Copilot persistence not initialized. Call initializeCopilotRuntime() first.");
  }
  return copilotPersistenceInstance;
}

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

/**
 * Maps the classifier's typed decision to a strict SupervisorDecision so the
 * runtime (not this callback) performs the handoff and runs the executors.
 */
function classifierToDecision(
  classifierDecision: ClassifierDecision,
  utterance: string,
  locale: "en" | "ar",
  routeContext?: string,
): SupervisorDecisionContent {
  if (classifierDecision.mode === "guide") {
    const payload: Record<string, unknown> = { utterance, locale };
    if (classifierDecision.flowIdHint) {
      payload.flowIdHint = classifierDecision.flowIdHint;
    }
    if (routeContext) {
      payload.routeContext = routeContext;
    }
    return {
      content: JSON.stringify({
        action: "handoff",
        currentAgent: "copilot-supervisor",
        nextAgent: "platform-guide-agent",
        reasonCode: classifierDecision.reasonCode,
        payload,
      }),
      usage: ZERO_USAGE,
    };
  }

  if (classifierDecision.mode === "action") {
    const payload: Record<string, unknown> = { mode: "action", utterance, locale };
    if (classifierDecision.toolNameHint) {
      payload.toolNameHint = classifierDecision.toolNameHint;
    }
    return {
      content: JSON.stringify({
        action: "handoff",
        currentAgent: "copilot-supervisor",
        nextAgent: "platform-action-agent",
        reasonCode: classifierDecision.reasonCode,
        payload,
      }),
      usage: ZERO_USAGE,
    };
  }

  return {
    content: JSON.stringify({
      action: "complete",
      currentAgent: "copilot-supervisor",
      reasonCode: classifierDecision.reasonCode,
      result: {
        mode: "clarify",
        reasonCode: classifierDecision.reasonCode,
        ...(classifierDecision.flowIdHint
          ? { flowIdHint: classifierDecision.flowIdHint }
          : {}),
      },
    }),
    usage: ZERO_USAGE,
  };
}

class CopilotSupervisorDecisionModel implements SupervisorDecisionModel {
  readonly providerKey: string;
  readonly modelName: string;

  /**
   * Holds the action plan between the platform-action-agent's tool_call step
   * and its final complete step (the runtime replaces the current input with
   * the tool output in between, so the plan must be retained per run).
   */
  private readonly planByRunId = new Map<string, Record<string, unknown>>();

  constructor(
    private readonly classifier: CopilotClassifier,
    providerKey: string,
    modelName: string,
  ) {
    this.providerKey = providerKey;
    this.modelName = modelName;
  }

  async decide(request: SupervisorDecisionRequest): Promise<SupervisorDecisionContent> {
    const { currentAgent, input, context } = request;
    const utterance = (input.utterance as string) ?? "";
    const locale = (input.locale as "en" | "ar") ?? "en";

    // The supervisor runtime does not expose a runId on the decision request;
    // the copilot controller mint a fresh conversationId per run, so it is a
    // stable, unique key for per-run state (the action plan retained between
    // the action agent's tool_call and its final complete step).
    const runKey = context.conversationId;

    if (currentAgent === "copilot-supervisor") {
      // Explicit tool selection (direct /copilot/action route) bypasses the
      // LLM hint entirely — the caller's enumerated toolName is authoritative.
      const explicitTool = input.toolName as string | undefined;
      if (typeof explicitTool === "string" && explicitTool.trim().length > 0) {
        const payload: Record<string, unknown> = {
          mode: "action",
          utterance,
          locale,
          toolNameHint: explicitTool.trim(),
        };
        if (input.toolInput && typeof input.toolInput === "object") {
          payload.toolInput = input.toolInput;
        }
        return {
          content: JSON.stringify({
            action: "handoff",
            currentAgent: "copilot-supervisor",
            nextAgent: "platform-action-agent",
            reasonCode: "explicit_tool",
            payload,
          }),
          usage: ZERO_USAGE,
        };
      }

      const routeContext = (input.routeContext as string | undefined) ?? undefined;
      const decision = await this.classifier.classify(utterance, locale, routeContext);
      return classifierToDecision(decision, utterance, locale, routeContext);
    }

    // After the runtime handed off to a specialized agent, its executor output
    // is the current input; the run simply surfaces it as the final result.
    if (currentAgent === "platform-guide-agent") {
      return {
        content: JSON.stringify({
          action: "complete",
          currentAgent: "platform-guide-agent",
          reasonCode: "guide_session_created",
          result: input,
        }),
        usage: ZERO_USAGE,
      };
    }

    if (currentAgent === "platform-action-agent") {
      const plan = input.actionPlan as Record<string, unknown> | undefined;
      const planHasTool =
        plan &&
        typeof plan.toolName === "string" &&
        plan.toolName.length > 0;

      // HEAD's runtime merges the tool output back into the current input but
      // leaves the consumed actionPlan in place, so a plain `input.actionPlan`
      // check would re-issue the tool_call forever. The plan carries the run
      // id it was built for; when the recorded plan for this conversation
      // matches the plan still sitting in the input, the tool already ran and
      // this decide must surface the result instead.
      const recorded = this.planByRunId.get(runKey);
      const samePlan =
        planHasTool &&
        recorded &&
        typeof plan.runId === "string" &&
        plan.runId === recorded.runId;
      if (samePlan) {
        this.planByRunId.delete(runKey);
        return {
          content: JSON.stringify({
            action: "complete",
            currentAgent: "platform-action-agent",
            reasonCode: "action_plan_created",
            result: input,
          }),
          usage: ZERO_USAGE,
        };
      }

      // The handoff output (the action plan) drives a tool_call so the
      // SupervisorRuntime executes the tool under its guardrails — including
      // the approval path for destructive operations.
      if (planHasTool) {
        this.planByRunId.set(runKey, plan);
        return {
          content: JSON.stringify({
            action: "tool_call",
            currentAgent: "platform-action-agent",
            toolName: plan!.toolName,
            toolInput:
              plan!.toolInput && typeof plan!.toolInput === "object"
                ? (plan!.toolInput as Record<string, unknown>)
                : {},
            reasonCode: "action_plan_tool_call",
          }),
          usage: ZERO_USAGE,
        };
      }

      // The current input after the executor produced no plan; surface it as
      // the final output.
      return {
        content: JSON.stringify({
          action: "complete",
          currentAgent: "platform-action-agent",
          reasonCode: "action_plan_created",
          result: input,
        }),
        usage: ZERO_USAGE,
      };
    }

    throw new Error(`Unknown agent: ${currentAgent}`);
  }
}

export async function initializeCopilotRuntime(deps: {
  storageProvider: StorageProvider;
  securityScanner: SecurityScanner;
  processingDispatcher: ProcessingDispatcher;
}): Promise<SupervisorRuntime> {
  if (supervisorRuntimeInstance) {
    return supervisorRuntimeInstance;
  }

  const modelAdapter = getModelAdapter();
  const toolRegistry = new ToolRegistry();

  registerActionTools(toolRegistry, deps);

  const classifier = new CopilotClassifier(modelAdapter);

  copilotToolRegistryInstance = toolRegistry;

  const executorRegistry = new AgentExecutorRegistry();
  executorRegistry.register(platformGuideAgent as unknown as AgentContract);
  executorRegistry.register(
    createPlatformActionAgent(toolRegistry, {
      mode: "action",
      confidence: 1,
      flowIdHint: null,
      toolNameHint: null,
      reasonCode: "initial",
    }) as unknown as AgentContract,
  );

  const workflowRegistry = createCopilotWorkflowRegistry();

  // Compose-time validation: catch drift between workflows, agent executors,
  // and the tool registry at startup instead of mid-run.
  assertSupervisorComposition({
    agentRegistry: executorRegistry.definitionsRegistry(),
    toolRegistry,
    workflowRegistry,
  });
  for (const toolName of platformActionToolCatalog()) {
    if (!toolRegistry.get(toolName)) {
      throw new Error(
        `Copilot action agent references unregistered tool ${toolName}`,
      );
    }
  }

  const persistence = new MongoSupervisorPersistence();
  copilotPersistenceInstance = persistence;

  const config: SupervisorRuntimeConfig = {
    model: new CopilotSupervisorDecisionModel(
      classifier,
      modelAdapter.providerKey,
      (modelAdapter as { model?: string }).model ?? modelAdapter.providerKey,
    ),
    workflowRegistry,
    executorRegistry,
    toolRegistry,
    persistence,
    guardrails: createDefaultSupervisorGuardrails({
      agentRegistry: executorRegistry.definitionsRegistry(),
      toolRegistry,
    }),
  };

  supervisorRuntimeInstance = new SupervisorRuntime(config);
  return supervisorRuntimeInstance;
}
