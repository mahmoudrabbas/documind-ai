import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { CopilotToolRegistry } from "../tools/toolRegistry.js";
import { ActionExecutor } from "../executors/actionExecutor.js";
import type { CopilotTool } from "../tools/tool.types.js";
import type { CopilotPlan, CopilotStep, ToolContext } from "../copilot.types.js";

const mockAuthorizeOp = vi.fn();
const mockAuditWrite = vi.fn();

vi.mock("../../../config/index.js", () => ({
  config: {
    COPILOT_PLAN_TIMEOUT_MS: 30000,
    COPILOT_TOOL_TIMEOUT_MS: 15000,
    COPILOT_TOOL_RETRIES: 2,
  },
}));

vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({
    write: (...args: unknown[]) => mockAuditWrite(...args),
  }),
}));

function makeTool(name: string, overrides: Partial<CopilotTool> = {}): CopilotTool {
  return {
    name,
    description: `Tool ${name}`,
    category: "admin",
    requiredPermission: null,
    confirmationLevel: "safe",
    inputSchema: z.object({}),
    handler: async () => ({ ok: true, data: { done: true }, error: null, latencyMs: 0, auditEvent: null }),
    ...overrides,
  };
}

function makePlan(steps: CopilotStep[]): CopilotPlan {
  return {
    id: "plan-test-1",
    summary: "Test",
    mode: "action",
    steps,
    estimatedDurationMs: 1000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "active",
  };
}

function makeStep(overrides: Partial<CopilotStep> & { action: string }): CopilotStep {
  return {
    stepIndex: 0,
    description: "A step",
    tool: null,
    parameters: null,
    confirmationLevel: "safe",
    requiredPermission: null,
    status: "pending",
    result: null,
    errorMessage: null,
    ...overrides,
  };
}

const defaultContext: ToolContext = {
  tenantId: "tenant-1",
  actorId: "actor-1",
  actorEmail: "admin@test.com",
  actorRole: "COMPANY_ADMIN",
  traceId: "trace-1",
  requestId: "req-1",
};

describe("ActionExecutor", () => {
  let registry: CopilotToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeOp.mockResolvedValue({ tenantId: "tenant-1", actorId: "actor-1" });
    mockAuditWrite.mockResolvedValue(true);
    registry = new CopilotToolRegistry();
  });

  it("returns confirmation for medium-level tools", async () => {
    registry.register(makeTool("uploadDoc", {
      requiredPermission: "documents:create",
      confirmationLevel: "medium",
      inputSchema: z.object({ filename: z.string() }),
    }));

    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const plan = makePlan([makeStep({ stepIndex: 0, action: "uploadDoc", tool: "uploadDoc", parameters: { filename: "test.pdf" } })]);
    const result = await executor.executeStep(plan.steps[0], plan, defaultContext);

    expect(result.confirmationRequired).toBe(true);
    expect(result.confirmationRequest).not.toBeNull();
    expect(result.confirmationRequest!.confirmationLevel).toBe("medium");
  });

  it("returns confirmation for high-level tools", async () => {
    registry.register(makeTool("deleteDoc", {
      requiredPermission: "documents:delete",
      confirmationLevel: "high",
    }));

    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const plan = makePlan([makeStep({ stepIndex: 0, action: "deleteDoc", tool: "deleteDoc" })]);
    const result = await executor.executeStep(plan.steps[0], plan, defaultContext);

    expect(result.confirmationRequired).toBe(true);
  });

  it("executes safe-level tools directly", async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true, data: { found: true }, error: null, latencyMs: 0, auditEvent: null });
    registry.register(makeTool("search", {
      requiredPermission: null,
      confirmationLevel: "safe",
      handler,
    }));

    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const plan = makePlan([makeStep({ stepIndex: 0, action: "search", tool: "search" })]);
    const result = await executor.executeStep(plan.steps[0], plan, defaultContext);

    expect(result.confirmationRequired).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
    expect(result.step.status).toBe("completed");
  });

  it("rejects execution when permission check fails", async () => {
    mockAuthorizeOp.mockRejectedValue(new Error("Permission denied"));
    registry.register(makeTool("adminOp", {
      requiredPermission: "admin:do",
      confirmationLevel: "safe",
    }));

    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const plan = makePlan([makeStep({ stepIndex: 0, action: "adminOp", tool: "adminOp", requiredPermission: "admin:do" })]);
    const result = await executor.executeStep(plan.steps[0], plan, defaultContext);

    expect(result.step.status).toBe("failed");
    expect(result.step.errorMessage).toContain("Missing permission");
  });

  it("handles unknown tool gracefully", async () => {
    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const plan = makePlan([makeStep({ stepIndex: 0, action: "unknownTool", tool: "unknownTool" })]);
    const result = await executor.executeStep(plan.steps[0], plan, defaultContext);

    expect(result.step.status).toBe("failed");
    expect(result.step.errorMessage).toContain("Unknown tool");
  });

  it("handles null tool (navigation step) without executing", async () => {
    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const plan = makePlan([makeStep({ stepIndex: 0, action: "navigate", tool: null })]);
    const result = await executor.executeStep(plan.steps[0], plan, defaultContext);

    expect(result.step.status).toBe("completed");
    expect(result.confirmationRequired).toBe(false);
  });

  it("confirms and executes a previously awaiting step", async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true, data: { done: true }, error: null, latencyMs: 0, auditEvent: null });
    registry.register(makeTool("approveAction", {
      requiredPermission: null,
      confirmationLevel: "safe",
      handler,
    }));

    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const plan = makePlan([makeStep({ stepIndex: 0, action: "approveAction", tool: "approveAction" })]);
    const result = await executor.confirmAndExecute(plan.steps[0], plan, defaultContext);

    expect(handler).toHaveBeenCalledOnce();
    expect(result.step.status).toBe("completed");
  });

  it("sets step to running during execution", async () => {
    registry.register(makeTool("quickOp", {
      requiredPermission: null,
      confirmationLevel: "safe",
    }));

    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const step = makeStep({ stepIndex: 0, action: "quickOp", tool: "quickOp" });
    const plan = makePlan([step]);
    await executor.executeStep(step, plan, defaultContext);

    expect(step.status).toBe("completed");
  });

  it("handles handler throwing an error", async () => {
    registry.register(makeTool("badTool", {
      requiredPermission: null,
      confirmationLevel: "safe",
      handler: async () => { throw new Error("Internal failure"); },
    }));

    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const plan = makePlan([makeStep({ stepIndex: 0, action: "badTool", tool: "badTool" })]);
    const result = await executor.executeStep(plan.steps[0], plan, defaultContext);

    expect(result.step.status).toBe("failed");
    expect(result.step.errorMessage).toBe("Internal failure");
  });

  it("writes a COPILOT_STEP_EXECUTED audit event on success", async () => {
    registry.register(makeTool("search", {
      requiredPermission: null,
      confirmationLevel: "safe",
    }));

    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const plan = makePlan([makeStep({ stepIndex: 0, action: "search", tool: "search" })]);
    await executor.executeStep(plan.steps[0], plan, defaultContext);

    const event = mockAuditWrite.mock.calls[0][0];
    expect(event.action).toBe("COPILOT_STEP_EXECUTED");
    expect(event.resourceType).toBe("CopilotPlan");
    expect(event.resourceId).toBe(plan.id);
    expect(event.outcome).toBe("SUCCESS");
    expect(event.tenantId).toBe("tenant-1");
    expect(event.changes).toMatchObject({ stepIndex: 0, action: "search", tool: "search" });
  });

  it("writes a COPILOT_STEP_EXECUTED audit event with DENIED outcome on permission failure", async () => {
    mockAuthorizeOp.mockRejectedValue(new Error("Permission denied"));
    registry.register(makeTool("adminOp", {
      requiredPermission: "admin:do",
      confirmationLevel: "safe",
    }));

    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const plan = makePlan([makeStep({ stepIndex: 0, action: "adminOp", tool: "adminOp", requiredPermission: "admin:do" })]);
    await executor.executeStep(plan.steps[0], plan, defaultContext);

    const event = mockAuditWrite.mock.calls[0][0];
    expect(event.action).toBe("COPILOT_STEP_EXECUTED");
    expect(event.outcome).toBe("DENIED");
  });

  it("writes a COPILOT_STEP_EXECUTED audit event with FAILURE outcome when the handler throws", async () => {
    registry.register(makeTool("badTool", {
      requiredPermission: null,
      confirmationLevel: "safe",
      handler: async () => { throw new Error("boom"); },
    }));

    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const plan = makePlan([makeStep({ stepIndex: 0, action: "badTool", tool: "badTool" })]);
    await executor.executeStep(plan.steps[0], plan, defaultContext);

    const event = mockAuditWrite.mock.calls[0][0];
    expect(event.action).toBe("COPILOT_STEP_EXECUTED");
    expect(event.outcome).toBe("FAILURE");
  });

  it("does not emit a step audit event for awaiting-confirmation steps", async () => {
    registry.register(makeTool("uploadDoc", {
      confirmationLevel: "medium",
    }));

    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const plan = makePlan([makeStep({ stepIndex: 0, action: "uploadDoc", tool: "uploadDoc" })]);
    const result = await executor.executeStep(plan.steps[0], plan, defaultContext);

    expect(result.confirmationRequired).toBe(true);
    expect(mockAuditWrite).not.toHaveBeenCalled();
  });

  it("retries transient failures and records retryCount", async () => {
    const handler = vi.fn()
      .mockResolvedValueOnce({ ok: false, data: null, error: "transient", latencyMs: 0, auditEvent: null })
      .mockResolvedValueOnce({ ok: true, data: { done: true }, error: null, latencyMs: 0, auditEvent: null });
    registry.register(makeTool("flakyOp", {
      requiredPermission: null,
      confirmationLevel: "safe",
      handler,
    }));

    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const step = makeStep({ stepIndex: 0, action: "flakyOp", tool: "flakyOp" });
    const plan = makePlan([step]);
    const result = await executor.executeStep(step, plan, defaultContext);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(step.retryCount).toBe(1);
    expect(step.status).toBe("completed");
    expect(result.result!.ok).toBe(true);
  });

  it("fails after exhausting retries", async () => {
    const handler = vi.fn().mockResolvedValue({ ok: false, data: null, error: "always down", latencyMs: 0, auditEvent: null });
    registry.register(makeTool("downOp", {
      requiredPermission: null,
      confirmationLevel: "safe",
      handler,
    }));

    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const step = makeStep({ stepIndex: 0, action: "downOp", tool: "downOp" });
    const plan = makePlan([step]);
    const result = await executor.executeStep(step, plan, defaultContext);

    expect(handler).toHaveBeenCalledTimes(3);
    expect(step.retryCount).toBe(2);
    expect(step.status).toBe("failed");
    expect(result.result!.error).toBe("always down");
  });

  it("emits a step audit event for guide steps with no tool", async () => {
    const executor = new ActionExecutor(registry, mockAuthorizeOp);
    const plan = makePlan([makeStep({ stepIndex: 0, action: "navigate", tool: null })]);
    await executor.executeStep(plan.steps[0], plan, defaultContext);

    const event = mockAuditWrite.mock.calls[0][0];
    expect(event.action).toBe("COPILOT_STEP_EXECUTED");
    expect(event.outcome).toBe("SUCCESS");
    expect(event.changes.tool).toBeNull();
  });
});
