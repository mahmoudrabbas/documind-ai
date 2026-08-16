import { beforeEach, describe, it, expect, vi } from "vitest";

const { mockExecute, mockCreateRun } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockCreateRun: vi.fn(),
}));

vi.mock("../../agents/agents.repository.js", () => ({
  createRun: mockCreateRun,
  listApprovals: vi.fn().mockResolvedValue({ approvals: [], totalRecords: 0 }),
}));

vi.mock("../copilotComposition.js", () => ({
  initializeCopilotRuntime: vi.fn().mockResolvedValue(undefined),
  getCopilotSupervisorRuntime: () => ({
    execute: (runInput: unknown) => mockExecute(runInput),
  }),
  getCopilotSupervisorPersistence: () => ({
    listApprovals: vi.fn(),
    getRun: vi.fn(),
    completeRun: vi.fn(),
  }),
}));

vi.mock("../guide/guide.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../guide/guide.service.js")>();
  return {
    ...actual,
    listAvailableGuideFlows: vi
      .fn()
      .mockResolvedValue(["documents.upload", "documents.search"]),
  };
});

import type { AgentExecutionContext } from "../../agents/agentExecutionContext.js";
import { createActionPlan, processCopilotMessage } from "../copilot.service.js";
import { listAvailableGuideFlows } from "../guide/guide.service.js";

const baseContext = {
  tenantId: "tenant-1",
  actorId: "actor-1",
  actorRole: "COMPANY_ADMIN" as const,
} as unknown as AgentExecutionContext;

describe("processCopilotMessage", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockCreateRun.mockReset();
    mockCreateRun.mockResolvedValue({
      id: "run-test",
      status: "pending",
    });
  });

  it("enriches a completed clarify outcome with a full payload", async () => {
    mockExecute.mockResolvedValue({
      status: "completed",
      output: {
        mode: "clarify",
        reasonCode: "low_confidence",
      },
    });

    const result = await processCopilotMessage(
      { utterance: "help me with this" },
      baseContext,
    );

    expect(result.mode).toBe("clarify");
    expect(result.clarify).toBeDefined();
    expect(result.clarify?.message).toBeTruthy();
    expect(result.clarify?.suggestedFlows).toEqual([
      "documents.upload",
      "documents.search",
    ]);
    expect(result.clarify?.suggestedActions.length).toBeGreaterThan(0);
    expect(result.guideSession).toBeUndefined();
    expect(result.actionPlan).toBeUndefined();
  });

  it("localizes the clarify message for arabic requests", async () => {
    mockExecute.mockResolvedValue({
      status: "completed",
      output: { mode: "clarify", reasonCode: "unknown" },
    });

    const result = await processCopilotMessage(
      { utterance: "ساعدني في هذا", locale: "ar" },
      baseContext,
    );

    expect(result.mode).toBe("clarify");
    expect(result.clarify?.message).toContain("لم أتمكن من فهم");
  });

  describe("capability_unavailable payload", () => {
    beforeEach(() => {
      // The role flow is available so the role-creation recommendation can
      // resolve; other flows stay visible alongside it.
      vi.mocked(listAvailableGuideFlows).mockResolvedValue([
        "roles.create",
        "documents.upload",
        "documents.search",
      ]);
    });

    it("exposes the classifier flowIdHint as recommendedFlowId while keeping every flow visible", async () => {
      mockExecute.mockResolvedValue({
        status: "completed",
        output: {
          mode: "clarify",
          reasonCode: "capability_unavailable",
          flowIdHint: "roles.create",
        },
      });

      const result = await processCopilotMessage(
        { utterance: "Don't guide me, just create the role." },
        baseContext,
      );

      expect(result.mode).toBe("clarify");
      expect(result.clarify?.kind).toBe("capability_unavailable");
      expect(result.clarify?.recommendedFlowId).toBe("roles.create");
      expect(result.clarify?.suggestedFlows).toEqual([
        "roles.create",
        "documents.upload",
        "documents.search",
      ]);
      expect(result.clarify?.message).toContain("guide you through creating a role");
    });

    it("does not promote roles.create merely because it is available for a no-hint request", async () => {
      // Regression: a capability_unavailable request that matched no flow must
      // not recommend roles.create simply because it lives in the catalog. Such
      // a request must instead render the generic capability-unavailable
      // message with the full catalog visible and no promoted CTA.
      mockExecute.mockResolvedValue({
        status: "completed",
        output: {
          mode: "clarify",
          reasonCode: "capability_unavailable",
        },
      });

      const result = await processCopilotMessage(
        {
          utterance:
            "Create HR Manager for me. Do not guide me through the UI.",
        },
        baseContext,
      );

      expect(result.clarify?.recommendedFlowId).toBeUndefined();
      expect(result.clarify?.message).toContain("guide you through creating a role");
      // The full catalog stays visible in the suggested flows.
      expect(result.clarify?.suggestedFlows).toEqual([
        "roles.create",
        "documents.upload",
        "documents.search",
      ]);
    });

    it("recommends a non-role flow hint without a role-creation message", async () => {
      mockExecute.mockResolvedValue({
        status: "completed",
        output: {
          mode: "clarify",
          reasonCode: "capability_unavailable",
          flowIdHint: "documents.upload",
        },
      });

      const result = await processCopilotMessage(
        { utterance: "Don't guide me, just upload the file." },
        baseContext,
      );

      expect(result.clarify?.recommendedFlowId).toBe("documents.upload");
      expect(result.clarify?.message).not.toContain("creating a role");
    });
  });

  it("passes guide sessions through untouched", async () => {
    const guideSession = {
      sessionId: "ses-1",
      flowId: "documents.upload",
      locale: "en",
      dir: "ltr",
      steps: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    mockExecute.mockResolvedValue({
      status: "completed",
      output: { mode: "guide", guideSession },
    });

    const result = await processCopilotMessage(
      { utterance: "upload a document" },
      baseContext,
    );

    expect(result.mode).toBe("guide");
    expect(result.guideSession).toBe(guideSession);
    expect(result.clarify).toBeUndefined();
  });

  it("passes action plans through untouched", async () => {
    const actionPlan = {
      runId: "run-1",
      intent: "delete this document",
      toolName: "document.softDelete",
      risk: "destructive",
      requiresConfirmation: true,
      summary: "Soft delete the document",
      target: null,
    };
    mockExecute.mockResolvedValue({
      status: "completed",
      output: { mode: "action", actionPlan },
    });

    const result = await processCopilotMessage(
      { utterance: "delete this document" },
      baseContext,
    );

    expect(result.mode).toBe("action");
    expect(result.actionPlan).toBe(actionPlan);
    expect(result.clarify).toBeUndefined();
  });

  it("strips the controller-only `resolved` key before the runtime runs", async () => {
    // The controller's buildExecutionContext attaches `resolved` permissions;
    // the runtime schema is strict and previously 500'd on the unknown key.
    const controllerContext = {
      ...baseContext,
      resolved: {
        grants: [{ permission: "DOCUMENTS_CREATE", granted: true }],
      },
    };
    mockExecute.mockResolvedValue({
      status: "completed",
      output: { mode: "clarify", reasonCode: "low_confidence" },
    });

    const result = await processCopilotMessage(
      { utterance: "help me with this" },
      controllerContext,
    );

    expect(result.mode).toBe("clarify");
    expect(result.clarify?.message).toBeTruthy();

    const runInput = mockExecute.mock.calls[0][0] as {
      context: Record<string, unknown>;
    };
    expect(runInput.context).not.toHaveProperty("resolved");
    expect(runInput.context.tenantId).toBe("tenant-1");
  });

  it("executes with the persisted run id returned by createRun, not a separately minted one", async () => {
    // createRun returns a persisted run whose id can never collide with any
    // caller-pre-generated ObjectId: "run-persisted-1" is not an ObjectId
    // string. If a caller-side id were reintroduced, execute would receive it
    // instead of this value and the assertion would fail.
    mockCreateRun.mockResolvedValueOnce({
      id: "run-persisted-1",
      status: "pending",
    });
    mockExecute.mockResolvedValue({
      status: "completed",
      output: { mode: "clarify", reasonCode: "low_confidence" },
    });

    await processCopilotMessage(
      { utterance: "help me with this" },
      baseContext,
    );

    expect(mockCreateRun).toHaveBeenCalledTimes(1);
    const runInput = mockExecute.mock.calls[0][0] as {
      runId: string;
    };
    expect(runInput.runId).toBe("run-persisted-1");
  });
});

describe("createActionPlan", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockCreateRun.mockReset();
    mockCreateRun.mockResolvedValue({
      id: "run-test",
      status: "pending",
    });
  });

  it("executes with the persisted run id returned by createRun", async () => {
    // Same invariant as processCopilotMessage: the runId handed to the
    // runtime must be the Mongo-persisted AgentRun id, not a separately
    // pre-generated caller-side id.
    mockCreateRun.mockResolvedValueOnce({
      id: "run-persisted-2",
      status: "pending",
    });
    mockExecute.mockResolvedValue({
      status: "completed",
      output: {
        mode: "action",
        actionPlan: {
          runId: "run-persisted-2",
          intent: "delete this document",
          toolName: "document.softDelete",
          risk: "destructive",
          requiresConfirmation: true,
          summary: "Soft delete the document",
          target: null,
        },
      },
    });

    const plan = await createActionPlan(
      { utterance: "delete this document" },
      baseContext,
    );

    expect(mockCreateRun).toHaveBeenCalledTimes(1);
    const runInput = mockExecute.mock.calls[0][0] as {
      runId: string;
    };
    expect(runInput.runId).toBe("run-persisted-2");
    expect(plan.runId).toBe("run-persisted-2");
  });
});