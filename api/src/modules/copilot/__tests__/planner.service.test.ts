import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { FakeModelAdapter } from "../../../providers/llm/fakeAdapters.js";
import { CopilotToolRegistry } from "../tools/toolRegistry.js";
import { CopilotPlanner } from "../planner/planner.service.js";
import type { CopilotTool } from "../tools/tool.types.js";

vi.mock("../tools/registerTools.js", () => ({ registerDefaultTools: vi.fn() }));

vi.mock("../../../config/index.js", () => ({
  config: {
    COPILOT_PLAN_TIMEOUT_MS: 30000,
    COPILOT_TOOL_TIMEOUT_MS: 15000,
  },
}));

function makeTool(name: string): CopilotTool {
  return {
    name,
    description: `Tool ${name}`,
    category: "admin",
    requiredPermission: null,
    confirmationLevel: "safe",
    inputSchema: z.object({}),
    handler: async () => ({ ok: true, data: {}, error: null, latencyMs: 0, auditEvent: null }),
  };
}

function createPlanner() {
  const registry = new CopilotToolRegistry();
  registry.register(makeTool("searchDocuments"));
  registry.register(makeTool("listUsers"));
  registry.register(makeTool("uploadDocument"));
  const model = new FakeModelAdapter();
  return new CopilotPlanner(model, registry);
}

describe("CopilotPlanner", () => {
  it("generates a plan with a valid ID", async () => {
    const planner = createPlanner();
    const plan = await planner.generatePlan({
      query: "Search for invoices",
      mode: "action",
      tenantId: "tenant-1",
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-1",
      requestId: "req-1",
    });
    expect(plan.id).toBeDefined();
    expect(plan.id.length).toBeGreaterThan(0);
  });

  it("generates a plan with the correct mode", async () => {
    const planner = createPlanner();
    const plan = await planner.generatePlan({
      query: "Show me documents",
      mode: "guide",
      tenantId: "tenant-1",
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-1",
      requestId: "req-1",
    });
    expect(plan.mode).toBe("guide");
  });

  it("plan has at least one step", async () => {
    const planner = createPlanner();
    const plan = await planner.generatePlan({
      query: "List all users",
      mode: "action",
      tenantId: "tenant-1",
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-1",
      requestId: "req-1",
    });
    expect(plan.steps.length).toBeGreaterThanOrEqual(1);
  });

  it("plan steps have required fields", async () => {
    const planner = createPlanner();
    const plan = await planner.generatePlan({
      query: "Upload a document",
      mode: "action",
      tenantId: "tenant-1",
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-1",
      requestId: "req-1",
    });
    for (const step of plan.steps) {
      expect(step.stepIndex).toBeGreaterThanOrEqual(0);
      expect(step.description).toBeDefined();
      expect(step.confirmationLevel).toMatch(/^(safe|medium|high)$/);
      expect(step.status).toBe("pending");
    }
  });

  it("generates a plan with pending steps", async () => {
    const planner = createPlanner();
    const plan = await planner.generatePlan({
      query: "Check system health",
      mode: "action",
      tenantId: "tenant-1",
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-1",
      requestId: "req-1",
    });
    expect(plan.status).toBe("active");
    expect(plan.steps.every((s) => s.status === "pending")).toBe(true);
  });

  it("generates different plan IDs for different requests", async () => {
    const planner = createPlanner();
    const plan1 = await planner.generatePlan({
      query: "Search documents",
      mode: "action",
      tenantId: "tenant-1",
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-1",
      requestId: "req-1",
    });
    const plan2 = await planner.generatePlan({
      query: "Invite user",
      mode: "action",
      tenantId: "tenant-1",
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-1",
      requestId: "req-2",
    });
    expect(plan1.id).not.toBe(plan2.id);
  });

  it("FakeModelAdapter produces tool-backed steps in action mode", async () => {
    const planner = createPlanner();
    const plan = await planner.generatePlan({
      query: "Invite a new user",
      mode: "action",
      tenantId: "tenant-1",
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-1",
      requestId: "req-1",
    });
    expect(plan.steps.some((s) => s.tool !== null)).toBe(true);
    const inviteStep = plan.steps.find((s) => s.tool === "inviteEmployee");
    expect(inviteStep?.confirmationLevel).toBe("medium");
    const safeStep = plan.steps.find((s) => s.tool === "listUsers");
    expect(safeStep?.confirmationLevel).toBe("safe");
  });

  it("FakeModelAdapter produces navigation steps in guide mode", async () => {
    const planner = createPlanner();
    const plan = await planner.generatePlan({
      query: "Invite a new user",
      mode: "guide",
      tenantId: "tenant-1",
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-1",
      requestId: "req-1",
    });
    expect(plan.steps.every((s) => s.tool === null && s.action === "navigate")).toBe(true);
  });
});
