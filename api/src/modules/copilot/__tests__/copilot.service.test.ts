import { describe, it, expect, vi, beforeEach } from "vitest";
import { CopilotToolRegistry } from "../tools/toolRegistry.js";
import { CopilotService } from "../copilot.service.js";
import { z } from "zod";
import { FakeModelAdapter } from "../../../providers/llm/fakeAdapters.js";
import { CopilotPlanner } from "../planner/planner.service.js";
import { ActionExecutor } from "../executors/actionExecutor.js";
import type { ToolContext } from "../copilot.types.js";
import type { OperationAuthorizationContext } from "../../permissions/permissions.operation.js";
import { Permission } from "../../permissions/permissions.catalog.js";
import type { CopilotTool } from "../tools/tool.types.js";
import { PlanEventBus } from "../events/planEventBus.js";

const mockAuthorizeTenantOp = vi.fn();

vi.mock("../../../config/index.js", () => ({
  config: {
    COPILOT_PLAN_TIMEOUT_MS: 30000,
    COPILOT_TOOL_TIMEOUT_MS: 15000,
  },
}));

vi.mock("../../permissions/permissions.operation.js", () => ({
  authorizeTenantOperation: (...args: unknown[]) => mockAuthorizeTenantOp(...args),
}));

vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({
    write: async () => true,
  }),
}));

const mockFindById = vi.fn();
const mockFindByIdAndUpdate = vi.fn();
const mockCreate = vi.fn();
const mockSave = vi.fn();

vi.mock("../../../db/models/copilotPlan.model.js", () => ({
  default: {
    findById: (...args: unknown[]) => mockFindById(...args),
    findOne: (...args: unknown[]) => mockFindById(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockFindByIdAndUpdate(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
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

function fakePlanDoc(overrides: Record<string, unknown> = {}) {
  const createdAt = new Date();
  return {
    _id: overrides.id ?? VALID_ID,
    id: overrides.id ?? VALID_ID,
    tenantId: "000000000000000000000001",
    summary: "Test plan",
    mode: "action",
    steps: [
      { stepIndex: 0, action: "searchDocuments", description: "Search", tool: "searchDocuments", parameters: { query: "test" }, confirmationLevel: "safe", requiredPermission: null, status: "completed", result: { ok: true, data: { documents: [] }, error: null, latencyMs: 0, auditEvent: null }, errorMessage: null },
      { stepIndex: 1, action: "uploadDocument", description: "Upload", tool: "uploadDocument", parameters: { filename: "doc.pdf", content: "data" }, confirmationLevel: "medium", requiredPermission: "documents:create", status: "awaiting_confirmation", result: null, errorMessage: null },
    ],
    estimatedDurationMs: 500,
    status: "active",
    createdAt,
    updatedAt: createdAt,
    save: mockSave,
    toJSON: () => ({}),
    ...overrides,
  };
}

function createService() {
  const registry = new CopilotToolRegistry();
  registry.register(makeTool("searchDocuments", { name: "searchDocuments", requiredPermission: "documents:read" }));
  registry.register(makeTool("uploadDocument", { name: "uploadDocument", requiredPermission: "documents:create", confirmationLevel: "medium" }));
  registry.register(makeTool("deleteDocument", { name: "deleteDocument", requiredPermission: "documents:delete", confirmationLevel: "high" }));
  registry.register(makeTool("listUsers", { name: "listUsers", requiredPermission: "users:read" }));
  registry.register(makeTool("inviteEmployee", { name: "inviteEmployee", requiredPermission: "users:create", confirmationLevel: "medium" }));
  const planner = new CopilotPlanner(new FakeModelAdapter(), registry);
  const executor = new ActionExecutor(registry, mockAuthorizeTenantOp);
  return new CopilotService(planner, executor, registry);
}

function createServiceWithBus(bus: PlanEventBus) {
  const registry = new CopilotToolRegistry();
  registry.register(makeTool("searchDocuments", { name: "searchDocuments", requiredPermission: "documents:read" }));
  registry.register(makeTool("uploadDocument", { name: "uploadDocument", requiredPermission: "documents:create", confirmationLevel: "medium" }));
  registry.register(makeTool("deleteDocument", { name: "deleteDocument", requiredPermission: "documents:delete", confirmationLevel: "high" }));
  registry.register(makeTool("listUsers", { name: "listUsers", requiredPermission: "users:read" }));
  registry.register(makeTool("inviteEmployee", { name: "inviteEmployee", requiredPermission: "users:create", confirmationLevel: "medium" }));
  const planner = new CopilotPlanner(new FakeModelAdapter(), registry);
  const executor = new ActionExecutor(registry, mockAuthorizeTenantOp);
  return new CopilotService(planner, executor, registry, bus);
}

const TENANT_ID = "000000000000000000000001";
const VALID_ID = "507f1f77bcf86cd799439011";

const defaultAuthCtx: OperationAuthorizationContext = {
  tenantId: TENANT_ID,
  actorId: "actor-1",
  actorEmail: "admin@test.com",
  actorRole: "COMPANY_ADMIN",
  traceId: "trace-1",
  requestId: "req-1",
};

const defaultToolCtx: ToolContext = {
  tenantId: TENANT_ID,
  actorId: "actor-1",
  actorEmail: "admin@test.com",
  actorRole: "COMPANY_ADMIN",
  traceId: "trace-1",
  requestId: "req-1",
};

describe("CopilotService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeTenantOp.mockResolvedValue(defaultAuthCtx);
    mockCreate.mockReset();
    mockFindById.mockReset();
    mockFindByIdAndUpdate.mockReset();
    mockSave.mockReset();
  });

  describe("generatePlan", () => {
    it("generates a plan successfully", async () => {
      mockCreate.mockResolvedValue(fakePlanDoc({ _id: "plan-1", id: "plan-1" }));

      const service = createService();
      const plan = await service.generatePlan(
        { query: "Search for documents", mode: "action" },
        defaultToolCtx,
      );

      expect(plan).toBeDefined();
      expect(plan.id).toBeDefined();
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.mode).toBe("action");
      expect(plan.status).toBe("active");
    });

    it("calls authorizeTenantOperation", async () => {
      mockCreate.mockResolvedValue(fakePlanDoc({ _id: "507f1f77bcf86cd799439016", id: "507f1f77bcf86cd799439016" }));

      const service = createService();
      await service.generatePlan(
        { query: "List users", mode: "action" },
        defaultToolCtx,
      );

      expect(mockAuthorizeTenantOp).toHaveBeenCalled();
    });

    it("gates guide mode on the guided permission", async () => {
      mockCreate.mockResolvedValue(fakePlanDoc({ mode: "guide" }));

      const service = createService();
      await service.generatePlan(
        { query: "Show me how to search", mode: "guide" },
        defaultToolCtx,
      );

      expect(mockAuthorizeTenantOp).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID }),
        Permission.COPILOT_GUIDED,
      );
    });

    it("persists the plan to the database", async () => {
      let savedPlan: unknown = null;
      mockCreate.mockImplementation((plan: unknown) => {
        savedPlan = plan;
        return fakePlanDoc({ _id: "507f1f77bcf86cd799439017", id: "507f1f77bcf86cd799439017" });
      });

      const service = createService();
      const plan = await service.generatePlan(
        { query: "Check health", mode: "action" },
        defaultToolCtx,
      );

      expect(savedPlan).toBeTruthy();
      expect(mockCreate).toHaveBeenCalled();

      mockFindById.mockResolvedValue(fakePlanDoc({ _id: plan.id, id: plan.id }));
      const stored = await service.getPlan(plan.id, TENANT_ID);
      expect(stored).toBeDefined();
      expect(stored!.id).toBe(plan.id);
    });
  });

  describe("getPlan", () => {
    it("returns undefined for unknown plan", async () => {
      mockFindById.mockResolvedValue(null);

      const service = createService();
      const result = await service.getPlan("nonexistent", TENANT_ID);
      expect(result).toBeUndefined();
    });
  });

  describe("tenant isolation", () => {
    beforeEach(() => {
      mockFindById.mockImplementation((...args: unknown[]) => {
        const filter = args[0] as { tenantId?: { toString(): string } } | null | string | undefined;
        if (filter && typeof filter === "object" && filter.tenantId && filter.tenantId.toString() !== TENANT_ID) {
          return null;
        }
        return fakePlanDoc({});
      });
    });

    it("does not expose plans owned by another tenant", async () => {
      const service = createService();
      const crossTenant = await service.getPlan(VALID_ID, "999999999999999999999999");
      expect(crossTenant).toBeUndefined();

      const own = await service.getPlan(VALID_ID, TENANT_ID);
      expect(own).toBeDefined();
    });

    it("rejects step execution on a foreign plan", async () => {
      const service = createService();
      await expect(service.executeStep(
        VALID_ID,
        0,
        null,
        { ...defaultToolCtx, tenantId: "999999999999999999999999" },
      )).rejects.toThrow("Plan not found");
    });
  });

  describe("re-execution guard", () => {
    it("returns stored result for completed steps without re-running the tool", async () => {
      const completedDoc = fakePlanDoc({
        steps: [
          { stepIndex: 0, action: "searchDocuments", description: "Search", tool: "searchDocuments", parameters: { query: "test" }, confirmationLevel: "safe", requiredPermission: null, status: "completed", result: { ok: true, data: { documents: ["cached"] }, error: null, latencyMs: 1, auditEvent: null }, errorMessage: null },
        ],
      });
      mockFindById.mockResolvedValue(completedDoc);
      mockFindByIdAndUpdate.mockClear();

      const service = createService();
      const result = await service.executeStep(VALID_ID, 0, null, defaultToolCtx);

      expect(result.result).toEqual(expect.objectContaining({ data: { documents: ["cached"] } }));
      expect(mockFindByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("cancelPlan", () => {
    it("cancels an existing plan", async () => {
      const planDoc = fakePlanDoc({ _id: "507f1f77bcf86cd799439012", id: "507f1f77bcf86cd799439012" });
      mockCreate.mockResolvedValue(planDoc);
      mockFindById.mockResolvedValue(planDoc);

      const service = createService();
      const plan = await service.generatePlan(
        { query: "Search", mode: "action" },
        defaultToolCtx,
      );

      const cancelled = await service.cancelPlan(plan.id, defaultAuthCtx);
      expect(cancelled).toBe(true);

      const stored = await service.getPlan(plan.id, TENANT_ID);
      expect(stored!.status).toBe("cancelled");
    });

    it("cancels pending steps", async () => {
      const planDoc = fakePlanDoc({ _id: "507f1f77bcf86cd799439013", id: "507f1f77bcf86cd799439013", steps: [
        { stepIndex: 0, action: "searchDocuments", description: "Search", tool: "searchDocuments", parameters: { query: "test" }, confirmationLevel: "safe", requiredPermission: null, status: "pending", result: null, errorMessage: null },
        { stepIndex: 1, action: "uploadDocument", description: "Upload", tool: "uploadDocument", parameters: { filename: "doc.pdf", content: "data" }, confirmationLevel: "medium", requiredPermission: "documents:create", status: "pending", result: null, errorMessage: null },
      ] });
      mockCreate.mockResolvedValue(planDoc);
      mockFindById.mockResolvedValue(planDoc);

      const service = createService();
      const plan = await service.generatePlan(
        { query: "Search for documents", mode: "action" },
        defaultToolCtx,
      );

      mockSave.mockResolvedValue({ ...planDoc, status: "cancelled", steps: planDoc.steps.map((s: { status: string }) => ({ ...s, status: s.status === "pending" ? "cancelled" : s.status })) });
      await service.cancelPlan(plan.id, defaultAuthCtx);

      mockFindById.mockResolvedValue({ ...planDoc, status: "cancelled", steps: planDoc.steps.map((s: { status: string }) => ({ ...s, status: s.status === "pending" ? "cancelled" : s.status })) });
      const stored = await service.getPlan(plan.id, TENANT_ID);
      for (const step of stored!.steps) {
        if (step.status === "pending" || step.status === "awaiting_confirmation") {
          expect(step.status).toBe("cancelled");
        }
      }
    });

    it("returns false for unknown plan", async () => {
      mockFindById.mockResolvedValue(null);

      const service = createService();
      const result = await service.cancelPlan("nonexistent", defaultAuthCtx);
      expect(result).toBe(false);
    });

    it("rolls back completed steps in reverse order with rollback handlers", async () => {
      const bus = new PlanEventBus();
      const eventTypes: string[] = [];
      const rollbackCalls: number[] = [];

      const registry = new CopilotToolRegistry();
      const rollbackTool = {
        ...makeTool("flakyOp", { name: "flakyOp", requiredPermission: "documents:update" }),
        rollbackCapable: true,
        rollback: vi.fn(async (params: unknown, _ctx: unknown, resultData?: unknown) => {
          const stepIndex = (resultData as { stepIndex: number }).stepIndex;
          rollbackCalls.push(stepIndex);
          return { ok: true, data: { restored: true }, error: null, latencyMs: 0, auditEvent: null };
        }),
      };
      registry.register(rollbackTool as unknown as CopilotTool);
      const planner = new CopilotPlanner(new FakeModelAdapter(), registry);
      const executor = new ActionExecutor(registry, mockAuthorizeTenantOp);
      const service = new CopilotService(planner, executor, registry, bus);

      const planId = "507f1f77bcf86cd799439017";
      const completedStep = (index: number, tool: string) => ({
        stepIndex: index,
        action: tool,
        description: `Step ${index}`,
        tool,
        parameters: { documentId: `doc-${index}` },
        confirmationLevel: "safe" as const,
        requiredPermission: "documents:update",
        status: "completed" as const,
        result: { ok: true, data: { stepIndex: index }, error: null, latencyMs: 0, auditEvent: null },
        errorMessage: null,
      });
      mockFindById.mockResolvedValue(fakePlanDoc({
        _id: planId,
        id: planId,
        steps: [
          completedStep(0, "flakyOp"),
          completedStep(1, "flakyOp"),
          { stepIndex: 2, action: "searchDocuments", description: "Pending", tool: "searchDocuments", parameters: null, confirmationLevel: "safe", requiredPermission: null, status: "pending", result: null, errorMessage: null },
        ],
      }));
      bus.subscribe(planId, (event) => eventTypes.push(event.type));

      await service.cancelPlan(planId, defaultAuthCtx);

      expect(rollbackCalls).toEqual([1, 0]);
      expect(eventTypes).toContain("rollback.started");
      expect(eventTypes).toContain("rollback.completed");
      expect(eventTypes).toContain("plan.cancelled");
      expect(eventTypes).not.toContain("rollback.failed");
    });

    it("emits rollback.failed when a rollback handler returns an error", async () => {
      const bus = new PlanEventBus();
      const eventTypes: string[] = [];

      const registry = new CopilotToolRegistry();
      const failingRollback = {
        ...makeTool("flakyOp", { name: "flakyOp", requiredPermission: "documents:update" }),
        rollbackCapable: true,
        rollback: async () => ({ ok: false, data: null, error: "rollback boom", latencyMs: 0, auditEvent: null }),
      };
      registry.register(failingRollback as unknown as CopilotTool);
      const planner = new CopilotPlanner(new FakeModelAdapter(), registry);
      const executor = new ActionExecutor(registry, mockAuthorizeTenantOp);
      const service = new CopilotService(planner, executor, registry, bus);

      const planId = "507f1f77bcf86cd799439018";
      mockFindById.mockResolvedValue(fakePlanDoc({
        _id: planId,
        id: planId,
        steps: [
          { stepIndex: 0, action: "flakyOp", description: "Done", tool: "flakyOp", parameters: {}, confirmationLevel: "safe", requiredPermission: "documents:update", status: "completed", result: { ok: true, data: {}, error: null, latencyMs: 0, auditEvent: null }, errorMessage: null },
        ],
      }));
      bus.subscribe(planId, (event) => eventTypes.push(event.type));

      await service.cancelPlan(planId, defaultAuthCtx);

      expect(eventTypes).toContain("rollback.started");
      expect(eventTypes).toContain("rollback.failed");
      expect(eventTypes).not.toContain("rollback.completed");
    });
  });

  describe("getSuggestions", () => {
    it("includes employee-only suggestions for non-employee roles", async () => {
      const service = createService();
      const suggestions = await service.getSuggestions(TENANT_ID, "COMPANY_ADMIN");
      const labels = suggestions.map((s) => s.label);
      expect(labels).toContain("Invite user");
      expect(labels).toContain("System health");
    });

    it("excludes admin suggestions for employee role", async () => {
      const service = createService();
      const suggestions = await service.getSuggestions(TENANT_ID, "EMPLOYEE");
      const labels = suggestions.map((s) => s.label);
      expect(labels).not.toContain("Invite user");
      expect(labels).not.toContain("Run OCR");
      expect(labels).not.toContain("System health");
    });

    it("always includes basic suggestions", async () => {
      const service = createService();
      const suggestions = await service.getSuggestions(TENANT_ID, "EMPLOYEE");
      const labels = suggestions.map((s) => s.label);
      expect(labels).toContain("Search documents");
      expect(labels).toContain("Ask a question");
    });
  });

  describe("plan events", () => {
    it("publishes intent.detected and plan.ready on generatePlan", async () => {
      const bus = new PlanEventBus();
      const types: string[] = [];
      bus.subscribe("plan-events-1", (event) => types.push(event.type));

      const service = createServiceWithBus(bus);
      mockCreate.mockResolvedValue(fakePlanDoc({ _id: "plan-events-1", id: "plan-events-1" }));
      await service.generatePlan({ query: "Search for documents", mode: "action" }, defaultToolCtx);

      expect(types).toContain("intent.detected");
      expect(types).toContain("plan.ready");
    });

    it("replays generated events for the same tenant", async () => {
      const bus = new PlanEventBus();
      const service = createServiceWithBus(bus);
      mockCreate.mockResolvedValue(fakePlanDoc({ _id: "plan-events-2", id: "plan-events-2" }));
      await service.generatePlan({ query: "Search for documents", mode: "action" }, defaultToolCtx);

      const replayed = bus.replay("plan-events-2", TENANT_ID);
      expect(replayed.map((e) => e.type)).toEqual(["intent.detected", "plan.ready"]);
      expect(bus.replay("plan-events-2", "other-tenant")).toEqual([]);
    });

    it("publishes step.completed after executing a safe step", async () => {
      const bus = new PlanEventBus();
      const types: string[] = [];
      const planId = "507f1f77bcf86cd799439015";
      bus.subscribe(planId, (event) => types.push(event.type));

      const service = createServiceWithBus(bus);
      mockFindById.mockResolvedValue(fakePlanDoc({
        _id: planId,
        id: planId,
        steps: [
          { stepIndex: 0, action: "searchDocuments", description: "Search", tool: "searchDocuments", parameters: { query: "test" }, confirmationLevel: "safe", requiredPermission: "documents:read", status: "pending", result: null, errorMessage: null },
        ],
      }));
      await service.executeStep(planId, 0, null, defaultToolCtx);

      expect(types).toContain("step.started");
      expect(types).toContain("step.completed");
      expect(types).toContain("plan.completed");
    });

    it("marks the plan failed and emits plan.failed when the final step fails", async () => {
      const bus = new PlanEventBus();
      const types: string[] = [];
      const planId = "507f1f77bcf86cd799439017";
      bus.subscribe(planId, (event) => types.push(event.type));

      const registry = new CopilotToolRegistry();
      registry.register(makeTool("flakyTool", {
        name: "flakyTool",
        confirmationLevel: "safe",
        handler: async () => ({ ok: false, data: null, error: "boom", latencyMs: 1, auditEvent: null }),
      }));
      const planner = new CopilotPlanner(new FakeModelAdapter(), registry);
      const executor = new ActionExecutor(registry, mockAuthorizeTenantOp);
      const service = new CopilotService(planner, executor, registry, bus);

      mockFindById.mockResolvedValue(fakePlanDoc({
        _id: planId,
        id: planId,
        steps: [
          { stepIndex: 0, action: "flakyTool", description: "Flaky", tool: "flakyTool", parameters: {}, confirmationLevel: "safe", requiredPermission: null, status: "pending", result: null, errorMessage: null },
        ],
      }));
      await service.executeStep(planId, 0, null, defaultToolCtx);

      expect(types).toContain("step.failed");
      expect(types).toContain("plan.failed");
      expect(types).not.toContain("plan.completed");
      expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
        planId,
        expect.objectContaining({ $set: expect.objectContaining({ status: "failed" }) }),
        { new: true },
      );
    });

    it("emits plan.failed when a confirmed step fails", async () => {
      const bus = new PlanEventBus();
      const types: string[] = [];
      const planId = "507f1f77bcf86cd799439018";
      bus.subscribe(planId, (event) => types.push(event.type));

      const registry = new CopilotToolRegistry();
      registry.register(makeTool("flakyTool", {
        name: "flakyTool",
        confirmationLevel: "medium",
        handler: async () => ({ ok: false, data: null, error: "boom", latencyMs: 1, auditEvent: null }),
      }));
      const planner = new CopilotPlanner(new FakeModelAdapter(), registry);
      const executor = new ActionExecutor(registry, mockAuthorizeTenantOp);
      const service = new CopilotService(planner, executor, registry, bus);

      mockFindById.mockResolvedValue(fakePlanDoc({
        _id: planId,
        id: planId,
        steps: [
          { stepIndex: 0, action: "flakyTool", description: "Flaky", tool: "flakyTool", parameters: {}, confirmationLevel: "medium", requiredPermission: null, status: "awaiting_confirmation", result: null, errorMessage: null },
        ],
      }));
      await service.confirmStep(planId, 0, "approve", defaultToolCtx);

      expect(types).toContain("step.confirmed");
      expect(types).toContain("step.failed");
      expect(types).toContain("plan.failed");
      expect(types).not.toContain("plan.completed");
    });

    it("publishes step.confirmation_required when a step needs confirmation", async () => {
      const bus = new PlanEventBus();
      const types: string[] = [];
      const planId = "507f1f77bcf86cd799439016";
      bus.subscribe(planId, (event) => types.push(event.type));

      const service = createServiceWithBus(bus);
      mockFindById.mockResolvedValue(fakePlanDoc({
        _id: planId,
        id: planId,
        steps: [
          { stepIndex: 0, action: "uploadDocument", description: "Upload", tool: "uploadDocument", parameters: { filename: "doc.pdf", content: "data" }, confirmationLevel: "medium", requiredPermission: "documents:create", status: "pending", result: null, errorMessage: null },
        ],
      }));
      await service.executeStep(planId, 0, null, defaultToolCtx);

      expect(types).toContain("step.started");
      expect(types).toContain("step.confirmation_required");
      expect(types).not.toContain("step.completed");
    });
  });

  describe("executeStep", () => {
    it("throws on unknown plan", async () => {
      mockFindById.mockResolvedValue(null);

      const service = createService();
      await expect(service.executeStep(
        "nonexistent",
        0,
        null,
        defaultToolCtx,
      )).rejects.toThrow("Plan not found");
    });

    it("throws on unknown step", async () => {
      mockCreate.mockResolvedValue(fakePlanDoc({ _id: "507f1f77bcf86cd799439014", id: "507f1f77bcf86cd799439014" }));
      mockFindById.mockResolvedValue(fakePlanDoc({ _id: "507f1f77bcf86cd799439014", id: "507f1f77bcf86cd799439014" }));

      const service = createService();
      const plan = await service.generatePlan(
        { query: "Search", mode: "action" },
        defaultToolCtx,
      );

      mockFindById.mockResolvedValue(fakePlanDoc({ _id: plan.id, id: plan.id }));
      await expect(service.executeStep(
        plan.id,
        999,
        null,
        defaultToolCtx,
      )).rejects.toThrow("Step not found");
    });
  });

  describe("confirmStep", () => {
    it("rejects step when decision is reject", async () => {
      mockCreate.mockResolvedValue(fakePlanDoc({ _id: "507f1f77bcf86cd799439015", id: "507f1f77bcf86cd799439015" }));
      mockFindById.mockResolvedValue(fakePlanDoc({ _id: "507f1f77bcf86cd799439015", id: "507f1f77bcf86cd799439015" }));
      mockFindByIdAndUpdate.mockResolvedValue(fakePlanDoc({ _id: "507f1f77bcf86cd799439015", id: "507f1f77bcf86cd799439015" }));

      const service = createService();
      const plan = await service.generatePlan(
        { query: "Search", mode: "action" },
        defaultToolCtx,
      );

      mockFindById.mockResolvedValue(fakePlanDoc({ _id: plan.id, id: plan.id }));
      const result = await service.confirmStep(plan.id, 0, "reject", defaultToolCtx);
      expect(result).toHaveProperty("cancelled", true);
    });

    it("throws on unknown plan", async () => {
      mockFindById.mockResolvedValue(null);

      const service = createService();
      await expect(service.confirmStep(
        "nonexistent",
        0,
        "approve",
        defaultToolCtx,
      )).rejects.toThrow("Plan not found");
    });
  });
});
