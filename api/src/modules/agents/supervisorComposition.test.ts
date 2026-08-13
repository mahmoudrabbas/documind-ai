import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  ChatAgentRegistry,
  createChatAgentRegistry,
} from "./chatAgents.js";
import { WorkflowRegistry } from "./chatWorkflow.js";
import { ToolRegistry } from "./toolRegistry.js";
import type { RegisteredTool } from "./agents.types.js";
import {
  assertSupervisorComposition,
  validateSupervisorComposition,
} from "./supervisorComposition.js";

function registerTool(toolRegistry: ToolRegistry, name: string): void {
  const tool: RegisteredTool = {
    schema: {
      name,
      version: "1.0.0",
      description: `test tool ${name}`,
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.any(),
    },
    handler: async () => ({}),
  };
  toolRegistry.register(tool);
}

function guiderWorkflow(registry: WorkflowRegistry): void {
  registry.register({
    id: "guider-v1",
    entryAgent: "copilot-supervisor",
    agents: [
      "copilot-supervisor",
      "platform-guide-agent",
      "platform-action-agent",
    ],
    allowedHandoffs: {
      "copilot-supervisor": ["platform-guide-agent", "platform-action-agent"],
      "platform-guide-agent": ["copilot-supervisor"],
      "platform-action-agent": ["copilot-supervisor"],
    },
  });
}

test("a fully registered composition passes validation", () => {
  const agentRegistry = createChatAgentRegistry();
  const toolRegistry = new ToolRegistry();
  const workflowRegistry = new WorkflowRegistry();
  guiderWorkflow(workflowRegistry);

  assert.deepEqual(
    validateSupervisorComposition({ agentRegistry, toolRegistry, workflowRegistry }),
    [],
  );
  assert.doesNotThrow(() =>
    assertSupervisorComposition({ agentRegistry, toolRegistry, workflowRegistry }),
  );
});

test("a workflow agent that is not registered is reported", () => {
  const agentRegistry = new ChatAgentRegistry();
  agentRegistry.register({
    id: "copilot-supervisor",
    name: "copilot-supervisor",
    description: "supervisor",
    capabilities: ["read"],
    status: "active",
  });

  const toolRegistry = new ToolRegistry();
  const workflowRegistry = new WorkflowRegistry();
  guiderWorkflow(workflowRegistry);

  const errors = validateSupervisorComposition({
    agentRegistry,
    toolRegistry,
    workflowRegistry,
  });

  assert.ok(
    errors.some((error) => error.includes("platform-guide-agent") && error.includes("not registered")),
    `expected an unregistered-agent error, got: ${errors.join(" | ")}`,
  );
  assert.throws(
    () =>
      assertSupervisorComposition({
        agentRegistry,
        toolRegistry,
        workflowRegistry,
      }),
    /Invalid supervisor composition/,
  );
});

test("a handoff target that is not registered is reported", () => {
  const agentRegistry = new ChatAgentRegistry();
  agentRegistry.register({
    id: "copilot-supervisor",
    name: "copilot-supervisor",
    description: "supervisor",
    capabilities: ["read"],
    status: "active",
  });
  agentRegistry.register({
    id: "platform-guide-agent",
    name: "platform-guide-agent",
    description: "guide",
    capabilities: ["read"],
    status: "active",
  });

  const toolRegistry = new ToolRegistry();
  const workflowRegistry = new WorkflowRegistry();
  workflowRegistry.register({
    id: "guider-v1",
    entryAgent: "copilot-supervisor",
    agents: [
      "copilot-supervisor",
      "platform-guide-agent",
      "platform-action-agent",
    ],
    allowedHandoffs: {
      "copilot-supervisor": ["platform-guide-agent", "platform-action-agent"],
      "platform-guide-agent": ["copilot-supervisor"],
    },
  });

  const errors = validateSupervisorComposition({
    agentRegistry,
    toolRegistry,
    workflowRegistry,
  });

  assert.ok(
    errors.some(
      (error) =>
        error.includes("platform-action-agent") &&
        error.includes("handoff") &&
        error.includes("unregistered agent"),
    ),
    `expected a handoff-target error, got: ${errors.join(" | ")}`,
  );
});

test("an inactive workflow agent is reported", () => {
  const agentRegistry = new ChatAgentRegistry();
  agentRegistry.register({
    id: "copilot-supervisor",
    name: "copilot-supervisor",
    description: "supervisor",
    capabilities: ["read"],
    status: "inactive",
  });

  const toolRegistry = new ToolRegistry();
  const workflowRegistry = new WorkflowRegistry();
  guiderWorkflow(workflowRegistry);

  const errors = validateSupervisorComposition({
    agentRegistry,
    toolRegistry,
    workflowRegistry,
  });

  assert.ok(
    errors.some((error) => error.includes("copilot-supervisor") && error.includes("not active")),
    `expected an inactive-agent error, got: ${errors.join(" | ")}`,
  );
});

test("an agent declaring an unregistered tool is reported", () => {
  const agentRegistry = new ChatAgentRegistry();
  agentRegistry.register({
    id: "copilot-supervisor",
    name: "copilot-supervisor",
    description: "supervisor",
    capabilities: ["read", "execute"],
    status: "active",
    allowedTools: ["document.search", "document.missing"],
  });

  const toolRegistry = new ToolRegistry();
  registerTool(toolRegistry, "document.search");

  const workflowRegistry = new WorkflowRegistry();
  guiderWorkflow(workflowRegistry);

  const errors = validateSupervisorComposition({
    agentRegistry,
    toolRegistry,
    workflowRegistry,
  });

  assert.ok(
    errors.some((error) => error.includes("document.missing")),
    `expected an unregistered-tool error, got: ${errors.join(" | ")}`,
  );
});
