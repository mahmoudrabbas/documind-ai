/**
 * Copilot lifecycle event reducer — maps socket lifecycle events (§15) to a
 * small, renderable action-state. The socket is enhancement-only: when it is
 * unavailable the REST call that produced the plan/result already returns the
 * same payload, so the reducer's inputs stay plain JSON either way.
 */

import type {
  ActionPlan,
  ActionResult,
  CopilotLifecycleEvent,
  CopilotLifecyclePayload,
} from "./copilot-types";

export type ActionPhase =
  | "idle"
  | "planning"
  | "awaiting_confirmation"
  | "executing"
  | "succeeded"
  | "failed"
  | "rejected"
  | "expired";

export interface ActionLifecycleState {
  phase: ActionPhase;
  plan?: ActionPlan;
  result?: ActionResult;
  approvalId?: string;
  error?: string;
  runId?: string;
}

export type CopilotLifecycleMessage = {
  event: CopilotLifecycleEvent;
  payload: CopilotLifecyclePayload;
};

export function createInitialActionLifecycleState(): ActionLifecycleState {
  return { phase: "idle" };
}

export function actionLifecycleReducer(
  state: ActionLifecycleState,
  message: CopilotLifecycleMessage,
): ActionLifecycleState {
  const { event, payload } = message;
  switch (event) {
    case "copilot.classified":
      return { ...state, phase: "planning" };

    case "action.plan.created": {
      const plan = payload.plan ?? (payload as unknown as ActionPlan);
      return {
        ...state,
        phase: "planning",
        plan,
        runId: plan?.runId ?? payload.runId,
      };
    }

    case "action.awaiting_confirmation":
      return {
        ...state,
        phase: "awaiting_confirmation",
        approvalId: payload.approvalId,
        runId: payload.runId,
      };

    case "action.executed": {
      const result = payload.result ?? (payload as unknown as ActionResult);
      return {
        ...state,
        phase: "succeeded",
        result,
        runId: result?.runId ?? payload.runId,
        error: undefined,
      };
    }

    case "action.failed": {
      const result = payload.result ?? (payload as unknown as ActionResult);
      return {
        ...state,
        phase: result?.status === "rejected" ? "rejected" : "failed",
        result,
        runId: result?.runId ?? payload.runId,
        error:
          typeof payload.message === "string" ? payload.message : undefined,
      };
    }

    case "guide.session.created":
      return state;

    case "copilot.completed":
      return state;

    default:
      return state;
  }
}
