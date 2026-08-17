import { describe, it, expect } from "vitest";
import type { ActionPlan } from "@/lib/copilot/copilot-types";
import {
  actionLifecycleReducer,
  createInitialActionLifecycleState,
} from "@/lib/copilot/copilot-events";

const plan: ActionPlan = {
  runId: "run-1",
  intent: "Delete document",
  toolName: "document.softDelete",
  risk: "destructive",
  requiresConfirmation: true,
  summary: "Soft-delete document",
  target: { type: "document", id: "doc-1", label: "Contract.pdf" },
};

describe("actionLifecycleReducer", () => {
  it("starts idle", () => {
    expect(createInitialActionLifecycleState().phase).toBe("idle");
  });

  it("plan.created enters planning and stores the plan", () => {
    const state = actionLifecycleReducer(createInitialActionLifecycleState(), {
      event: "action.plan.created",
      payload: { plan, runId: "run-1" },
    });
    expect(state.phase).toBe("planning");
    expect(state.plan?.runId).toBe("run-1");
  });

  it("awaiting_confirmation stores the approval id", () => {
    const state = actionLifecycleReducer(
      { phase: "planning", plan },
      {
        event: "action.awaiting_confirmation",
        payload: { runId: "run-1", approvalId: "ap-1" },
      },
    );
    expect(state.phase).toBe("awaiting_confirmation");
    expect(state.approvalId).toBe("ap-1");
  });

  it("executed transitions to succeeded with the result", () => {
    const state = actionLifecycleReducer(
      { phase: "awaiting_confirmation", plan, approvalId: "ap-1" },
      {
        event: "action.executed",
        payload: {
          runId: "run-1",
          result: {
            runId: "run-1",
            status: "completed",
            toolName: "document.softDelete",
            output: null,
            message: "Done",
          },
        },
      },
    );
    expect(state.phase).toBe("succeeded");
    expect(state.result?.status).toBe("completed");
    expect(state.error).toBeUndefined();
  });

  it("failed transitions to failed with the message", () => {
    const state = actionLifecycleReducer(
      { phase: "awaiting_confirmation", plan },
      {
        event: "action.failed",
        payload: {
          runId: "run-1",
          message: "boom",
          result: {
            runId: "run-1",
            status: "failed",
            toolName: "document.softDelete",
            output: null,
            message: "boom",
          },
        },
      },
    );
    expect(state.phase).toBe("failed");
    expect(state.error).toBe("boom");
  });

  it("rejected transitions to rejected", () => {
    const state = actionLifecycleReducer(
      { phase: "awaiting_confirmation", plan },
      {
        event: "action.failed",
        payload: {
          runId: "run-1",
          result: {
            runId: "run-1",
            status: "rejected",
            toolName: "document.softDelete",
            output: null,
            message: "nope",
          },
        },
      },
    );
    expect(state.phase).toBe("rejected");
  });

  it("guide.session.created and copilot.completed are inert", () => {
    let state = actionLifecycleReducer(createInitialActionLifecycleState(), {
      event: "guide.session.created",
      payload: { runId: "guide-1" },
    });
    expect(state.phase).toBe("idle");
    state = actionLifecycleReducer(
      { phase: "succeeded" },
      {
        event: "copilot.completed",
        payload: { runId: "run-1", status: "completed" },
      },
    );
    expect(state.phase).toBe("succeeded");
  });
});
