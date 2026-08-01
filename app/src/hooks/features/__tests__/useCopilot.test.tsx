// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@/services/copilot.service", () => ({
  generatePlan: vi.fn(),
  executeStep: vi.fn(),
  confirmStep: vi.fn(),
  getPlan: vi.fn(),
  cancelPlan: vi.fn(),
  getSuggestions: vi.fn(),
  getGuidePlan: vi.fn(),
  subscribeToPlanEvents: vi.fn().mockResolvedValue(undefined),
}));

import { useCopilot } from "@/hooks/features/useCopilot";
import * as copilotService from "@/services/copilot.service";
import type { CopilotPlan } from "@/types/api/copilot.types";

type Hook = ReturnType<typeof useCopilot>;

function makePlan(overrides: Partial<CopilotPlan> = {}): CopilotPlan {
  return {
    id: "plan_1",
    summary: "Invite a new employee",
    mode: "action",
    steps: [
      {
        stepIndex: 0,
        action: "execute",
        description: "List users",
        tool: "listUsers",
        parameters: null,
        confirmationLevel: "safe",
        requiredPermission: "users:read",
        status: "pending",
        result: null,
        errorMessage: null,
      },
    ],
    estimatedDurationMs: 1000,
    createdAt: "2026-07-31T00:00:00Z",
    updatedAt: "2026-07-31T00:00:00Z",
    status: "active",
    ...overrides,
  };
}

function makeCompletedStep(stepIndex: number) {
  return {
    step: { stepIndex, status: "completed", errorMessage: null },
    result: { ok: true, data: null, error: null, latencyMs: 5 },
    confirmationRequired: false,
    confirmationRequest: null,
  };
}

function makeConfirmationStep(stepIndex: number) {
  return {
    step: { stepIndex, status: "awaiting_confirmation", errorMessage: null },
    result: { ok: false, data: null, error: null, latencyMs: 5 },
    confirmationRequired: true,
    confirmationRequest: {
      stepIndex,
      toolName: "inviteEmployee",
      parameters: { email: "a@b.com" },
      confirmationLevel: "medium",
      description: "Invite user",
      impact: "Creates a user",
    },
  };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderHook(): Promise<{ holder: { current: Hook }; cleanup: () => void }> {
  const holder: { current: Hook } = { current: undefined as unknown as Hook };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness() {
    holder.current = useCopilot();
    return null;
  }

  await act(async () => {
    root.render(<Harness />);
  });

  return {
    holder,
    cleanup: () => root.unmount(),
  };
}

describe("useCopilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("auto-advances through safe steps in action mode", async () => {
    const plan = makePlan({
      steps: [
        { ...makePlan().steps[0] },
        {
          stepIndex: 1,
          action: "execute",
          description: "Check health",
          tool: "getSystemHealth",
          parameters: null,
          confirmationLevel: "safe",
          requiredPermission: null,
          status: "pending",
          result: null,
          errorMessage: null,
        },
      ],
    });
    (copilotService.generatePlan as Mock).mockResolvedValue(plan);
    (copilotService.executeStep as Mock)
      .mockResolvedValueOnce(makeCompletedStep(0))
      .mockResolvedValueOnce(makeCompletedStep(1));

    const { holder, cleanup } = await renderHook();
    await act(async () => {
      await holder.current.generatePlan("Invite a user");
    });
    await settle();

    expect(copilotService.executeStep).toHaveBeenCalledTimes(2);
    expect(copilotService.executeStep).toHaveBeenCalledWith("plan_1", 0);
    expect(copilotService.executeStep).toHaveBeenCalledWith("plan_1", 1);
    expect(holder.current.plan?.status).toBe("active");
    cleanup();
  });

  it("does not auto-advance in guide mode", async () => {
    const guidePlan = makePlan({
      mode: "guide",
      steps: [
        {
          stepIndex: 0,
          action: "navigate",
          description: "Go to the Users page",
          tool: null,
          parameters: { route: "/dashboard/users" },
          confirmationLevel: "safe",
          requiredPermission: null,
          status: "pending",
          result: null,
          errorMessage: null,
        },
        {
          stepIndex: 1,
          action: "navigate",
          description: "Follow the highlighted steps",
          tool: null,
          parameters: { route: "/dashboard/users" },
          confirmationLevel: "safe",
          requiredPermission: null,
          status: "pending",
          result: null,
          errorMessage: null,
        },
      ],
    });
    (copilotService.generatePlan as Mock).mockResolvedValue(guidePlan);

    const { holder, cleanup } = await renderHook();
    await act(async () => {
      await holder.current.generatePlan("How do I invite a user?", "guide");
    });
    await settle();

    expect(holder.current.plan?.mode).toBe("guide");
    expect(copilotService.executeStep).not.toHaveBeenCalled();
    expect(holder.current.executionSteps.map((s) => s.status)).toEqual(["pending", "pending"]);
    cleanup();
  });

  it("pauses on a medium step and opens the confirmation dialog", async () => {
    const plan = makePlan({
      steps: [
        { ...makePlan().steps[0] },
        {
          stepIndex: 1,
          action: "execute",
          description: "Invite user",
          tool: "inviteEmployee",
          parameters: { email: "a@b.com" },
          confirmationLevel: "medium",
          requiredPermission: "users:invite",
          status: "pending",
          result: null,
          errorMessage: null,
        },
      ],
    });
    (copilotService.generatePlan as Mock).mockResolvedValue(plan);
    (copilotService.executeStep as Mock)
      .mockResolvedValueOnce(makeCompletedStep(0))
      .mockResolvedValueOnce(makeConfirmationStep(1));

    const { holder, cleanup } = await renderHook();
    await act(async () => {
      await holder.current.generatePlan("Invite a user");
    });
    await settle();
    await act(async () => {
      await holder.current.executeStep(1);
    });

    expect(holder.current.confirmation).not.toBeNull();
    expect(holder.current.confirmation?.stepIndex).toBe(1);
    expect(holder.current.confirmation?.toolName).toBe("inviteEmployee");
    expect(holder.current.executionSteps[1].status).toBe("awaiting_confirmation");
    cleanup();
  });

  it("approving a confirmation runs the tool", async () => {
    const plan = makePlan({
      steps: [
        { ...makePlan().steps[0] },
        {
          stepIndex: 1,
          action: "execute",
          description: "Invite user",
          tool: "inviteEmployee",
          parameters: { email: "a@b.com" },
          confirmationLevel: "medium",
          requiredPermission: "users:invite",
          status: "pending",
          result: null,
          errorMessage: null,
        },
      ],
    });
    (copilotService.generatePlan as Mock).mockResolvedValue(plan);
    (copilotService.executeStep as Mock)
      .mockResolvedValueOnce(makeCompletedStep(0))
      .mockResolvedValueOnce(makeConfirmationStep(1));
    (copilotService.confirmStep as Mock).mockResolvedValue(makeCompletedStep(1));

    const { holder, cleanup } = await renderHook();
    await act(async () => {
      await holder.current.generatePlan("Invite a user");
    });
    await settle();
    await act(async () => {
      await holder.current.executeStep(1);
    });
    await settle();

    expect(holder.current.confirmation?.stepIndex).toBe(1);

    await act(async () => {
      await holder.current.confirmAction("approve");
    });
    await settle();

    expect(copilotService.confirmStep).toHaveBeenCalledWith("plan_1", 1, "approve");
    expect(holder.current.executionSteps[1].status).toBe("completed");
    cleanup();
  });

  it("rejecting a confirmation marks the step cancelled", async () => {
    const plan = makePlan({
      steps: [
        { ...makePlan().steps[0] },
        {
          stepIndex: 1,
          action: "execute",
          description: "Invite user",
          tool: "inviteEmployee",
          parameters: { email: "a@b.com" },
          confirmationLevel: "medium",
          requiredPermission: "users:invite",
          status: "pending",
          result: null,
          errorMessage: null,
        },
      ],
    });
    (copilotService.generatePlan as Mock).mockResolvedValue(plan);
    (copilotService.executeStep as Mock)
      .mockResolvedValueOnce(makeCompletedStep(0))
      .mockResolvedValueOnce(makeConfirmationStep(1));

    const { holder, cleanup } = await renderHook();
    await act(async () => {
      await holder.current.generatePlan("Invite a user");
    });
    await settle();
    await act(async () => {
      await holder.current.executeStep(1);
    });
    await settle();

    await act(async () => {
      await holder.current.confirmAction("reject");
    });

    expect(copilotService.confirmStep).not.toHaveBeenCalled();
    expect(holder.current.executionSteps[1].status).toBe("cancelled");
    cleanup();
  });

  it("cancelCurrentPlan calls the API and resets state", async () => {
    (copilotService.generatePlan as Mock).mockResolvedValue(makePlan());
    (copilotService.executeStep as Mock).mockResolvedValue(makeCompletedStep(0));

    const { holder, cleanup } = await renderHook();
    await act(async () => {
      await holder.current.generatePlan("Invite a user");
    });
    await settle();

    expect(holder.current.plan).not.toBeNull();

    await act(async () => {
      await holder.current.cancelCurrentPlan();
    });

    expect(copilotService.cancelPlan).toHaveBeenCalledWith("plan_1");
    expect(holder.current.plan).toBeNull();
    expect(holder.current.executionSteps).toEqual([]);
    cleanup();
  });
});
