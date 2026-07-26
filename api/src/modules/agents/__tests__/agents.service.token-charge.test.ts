import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════
// Hoisted mock functions — vi.mock factories are hoisted to the top of the
// file, so variables they capture must also be hoisted via vi.hoisted().
// ═══════════════════════════════════════════════════════════════════════════

const mockConsume = vi.hoisted(() => vi.fn());
const mockAuthorizeTenantOperation = vi.hoisted(() => vi.fn());
const mockCreateRun = vi.hoisted(() => vi.fn());
const mockStartRun = vi.hoisted(() => vi.fn());
const mockCompleteRun = vi.hoisted(() => vi.fn());
const mockGetRun = vi.hoisted(() => vi.fn());
const mockCreateStep = vi.hoisted(() => vi.fn());
const mockCompleteStep = vi.hoisted(() => vi.fn());

// ═══════════════════════════════════════════════════════════════════════════
// Mock ALL modules that agents.service.ts imports — these MUST be defined
// BEFORE the module under test is imported.
//
// executeSupervisedRun is an internal (non-exported) function, so we
// cannot mock it directly. Instead we mock every dependency it touches:
// the repository layer, supervisor, guardrails, and tool registry.
//
// For a "plan" decision, executeSupervisedRun:
//   1. calls createStep once (mocked ✓)
//   2. calls supervisor.decide() → returns { plan: "plan" } (mocked ✓)
//   3. calls completeStep (mocked ✓)
//   4. breaks out of the loop
//   5. calls completeRun (mocked ✓)
//   6. returns
//
// Then startAgentRun calls getRun (mocked ✓) and hits the charge block.
// ═══════════════════════════════════════════════════════════════════════════

vi.mock("../../../modules/entitlement/entitlement.service.js", () => ({
  getEntitlementService: () => ({ consume: mockConsume }),
}));

vi.mock("../../../modules/permissions/permissions.operation.js", () => ({
  authorizeTenantOperation: mockAuthorizeTenantOperation,
  authorizePlatformOperation: vi.fn(),
}));

vi.mock("../agents.repository.js", () => ({
  createRun: mockCreateRun,
  startRun: mockStartRun,
  completeRun: mockCompleteRun,
  getRun: mockGetRun,
  createStep: mockCreateStep,
  completeStep: mockCompleteStep,
  createToolCall: vi.fn(),
  completeToolCall: vi.fn(),
  createApproval: vi.fn(),
  resolveApproval: vi.fn(),
  listRuns: vi.fn(),
  getSteps: vi.fn(),
  getToolCalls: vi.fn(),
  listApprovals: vi.fn(),
  expirePendingApprovals: vi.fn(),
}));

vi.mock("../supervisor.js", () => ({
  Supervisor: class {
    decide() {
      return {
        plan: { action: "plan", reason: "done" },
        budget: { maxSteps: 10 },
      };
    }
    evaluateGuardrails() {
      return { passed: true, action: "allow", reason: null };
    }
  },
}));

vi.mock("../fakeTools.js", () => ({
  createFakeTools: () => [],
}));

vi.mock("../guardrails.js", () => ({
  createDefaultGuardrails: () => [],
}));

vi.mock("../../../providers/llm/fakeAdapters.js", () => ({
  FakeModelAdapter: class {},
}));

// ═══════════════════════════════════════════════════════════════════════════
// Import module under test AFTER all mocks are registered
// ═══════════════════════════════════════════════════════════════════════════

import { startAgentRun } from "../agents.service.js";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const defaultInput = {
  tenantId: "tenant-1",
  actorId: "actor-1",
  workflowName: "test-workflow",
  agentName: "test-agent",
  input: { note: "hello" },
  modelProvider: "fake",
  modelName: "fake-default",
  traceId: "trace-1",
  requestId: "req-1",
};

const defaultContext = {
  tenantId: "tenant-1",
  actorId: "actor-1",
  actorEmail: "test@test.com",
  actorRole: "COMPANY_ADMIN" as const,
  traceId: "trace-1",
  requestId: "req-1",
};

const actorResult = { tenantId: "tenant-1", actorId: "actor-1" };
const defaultRun = { id: "run-1", tenantId: "tenant-1" };

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock implementations that make startAgentRun succeed
  mockAuthorizeTenantOperation.mockResolvedValue(actorResult);
  mockCreateRun.mockResolvedValue(defaultRun);
  mockStartRun.mockResolvedValue({ id: "run-1", status: "running" });
  mockCreateStep.mockResolvedValue({ id: "step-1" });
  mockCompleteStep.mockResolvedValue({ id: "step-1", status: "completed" });
  mockCompleteRun.mockResolvedValue({ id: "run-1", status: "completed" });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("startAgentRun — post-hoc token charge", () => {
  it("charges tokens after a successful run when totalTokensUsed > 0", async () => {
    mockGetRun.mockResolvedValue({
      ...defaultRun,
      totalTokensUsed: 500,
      requestId: "req-1",
    });

    const result = await startAgentRun(defaultInput, defaultContext);

    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(mockConsume).toHaveBeenCalledWith(
      "tenant-1",
      "tokensPerMonth",
      500,
      "req-1",
    );
    expect(result).toEqual(
      expect.objectContaining({ totalTokensUsed: 500 }),
    );
  });

  it("skips consume when totalTokensUsed is 0", async () => {
    mockGetRun.mockResolvedValue({
      ...defaultRun,
      totalTokensUsed: 0,
      requestId: "req-1",
    });

    const result = await startAgentRun(defaultInput, defaultContext);

    expect(mockConsume).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ totalTokensUsed: 0 }),
    );
  });

  it("skips consume when totalTokensUsed is null", async () => {
    mockGetRun.mockResolvedValue({
      ...defaultRun,
      totalTokensUsed: null,
      requestId: "req-1",
    });

    const result = await startAgentRun(defaultInput, defaultContext);

    expect(mockConsume).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ totalTokensUsed: null }),
    );
  });

  it("does not fail the request when consume() throws", async () => {
    mockGetRun.mockResolvedValue({
      ...defaultRun,
      totalTokensUsed: 500,
      requestId: "req-1",
    });
    mockConsume.mockRejectedValue(new Error("Service down"));

    // Should resolve, not reject
    const result = await startAgentRun(defaultInput, defaultContext);

    expect(mockConsume).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({ totalTokensUsed: 500 }),
    );
  });
});
