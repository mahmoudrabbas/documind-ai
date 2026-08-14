import type { ChatAgentRegistry } from "./chatAgents.js";
import type { WorkflowRegistry } from "./chatWorkflow.js";
import type { ToolRegistry } from "./toolRegistry.js";

export interface SupervisorCompositionDeps {
  agentRegistry: ChatAgentRegistry;
  toolRegistry: ToolRegistry;
  workflowRegistry: WorkflowRegistry;
}

/**
 * Compose-time validation of a supervisor runtime. Catches drift between the
 * workflow definitions, the registered agent executors, and the tool registry
 * at boot time instead of failing mid-run:
 *
 * - every agent a workflow can reach (its `agents` list) must be a registered,
 *   active agent definition;
 * - every workflow handoff target must be a registered agent;
 * - every tool an agent declares in `allowedTools` must be a registered tool.
 *
 * Returns a list of human-readable errors (empty = valid composition).
 */
export function validateSupervisorComposition(
  deps: SupervisorCompositionDeps,
): string[] {
  const errors: string[] = [];
  const { agentRegistry, toolRegistry, workflowRegistry } = deps;

  for (const workflow of workflowRegistry.list()) {
    for (const agentId of workflow.agents) {
      const definition = agentRegistry.get(agentId);
      if (!definition) {
        errors.push(
          `workflow ${workflow.id}: agent ${agentId} is not registered`,
        );
        continue;
      }
      if (definition.status !== "active") {
        errors.push(
          `workflow ${workflow.id}: agent ${agentId} is not active (status: ${definition.status})`,
        );
      }
    }

    for (const [from, targets] of Object.entries(workflow.allowedHandoffs)) {
      for (const target of targets ?? []) {
        if (!agentRegistry.has(target)) {
          errors.push(
            `workflow ${workflow.id}: handoff ${from}->${target} targets an unregistered agent`,
          );
        }
      }
    }
  }

  for (const definition of agentRegistry.list()) {
    for (const toolName of definition.allowedTools ?? []) {
      if (!toolRegistry.get(toolName)) {
        errors.push(
          `agent ${definition.id}: declares unregistered tool ${toolName}`,
        );
      }
    }
  }

  return errors;
}

export function assertSupervisorComposition(
  deps: SupervisorCompositionDeps,
): void {
  const errors = validateSupervisorComposition(deps);
  if (errors.length > 0) {
    throw new Error(
      `Invalid supervisor composition:\n- ${errors.join("\n- ")}`,
    );
  }
}
