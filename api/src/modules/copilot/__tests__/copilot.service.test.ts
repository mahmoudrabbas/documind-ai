import { beforeEach, describe, it, expect, vi } from "vitest";

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

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
import { processCopilotMessage } from "../copilot.service.js";

const baseContext = {
  tenantId: "tenant-1",
  actorId: "actor-1",
  actorRole: "COMPANY_ADMIN" as const,
} as unknown as AgentExecutionContext;

describe("processCopilotMessage", () => {
  beforeEach(() => {
    mockExecute.mockReset();
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
});