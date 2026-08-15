/**
 * Guide session state machine — pure, DOM-free.
 *
 * Drives the overlay through a `GuideSession`'s ordered steps: start / next /
 * back / skip / cancel / complete, plus completion detection (click, route
 * change, value present, manual) and the missing-target fallback policy
 * (skip / wait / stop). Immutable reducer so the provider can hold it in
 * `useReducer` and unit tests can assert transitions directly.
 */

import type {
  CompletionEventType,
  GuideSession,
  GuideStep,
} from "./copilot-types";

export type GuideStatus =
  "idle" | "running" | "completed" | "cancelled" | "stopped";

export interface GuideMachineState {
  session: GuideSession;
  status: GuideStatus;
  currentIndex: number;
  skipped: string[];
  stoppedReason?: string;
  /** Count of steps completed so far (completed + skipped). */
  progressCount: number;
}

export type CompletionEventInput = {
  type: CompletionEventType;
  /** Route currently active (for route_change steps). */
  route?: string;
  /** Target id that received the interaction (click / value present). */
  targetId?: string;
};

export type GuideAction =
  | { type: "start" }
  | { type: "setSession"; session: GuideSession }
  | { type: "next" }
  | { type: "back" }
  | { type: "skip" }
  | { type: "cancel" }
  | { type: "stop"; reason?: string }
  | { type: "complete" }
  | { type: "completion"; event: CompletionEventInput };

export function createInitialGuideState(
  session: GuideSession,
): GuideMachineState {
  return {
    session,
    status: "idle",
    currentIndex: 0,
    skipped: [],
    progressCount: 0,
  };
}

/** Strip trailing slashes so `/dashboard/documents` matches `/dashboard/documents/`. */
export function normalizeRoute(route: string): string {
  const withoutQuery = route.split(/[?#]/, 1)[0];
  return withoutQuery.replace(/\/+$/, "") || "/";
}

/**
 * Whether a live route satisfies a step's `routeMatch`. Falls back to a prefix
 * match so nested pages under the step route still count.
 */
export function doesRouteMatch(
  pattern: string | undefined,
  route: string | undefined,
): boolean {
  if (!pattern) return route !== undefined;
  if (!route) return false;
  const normalizedPattern = normalizeRoute(pattern);
  const normalizedRoute = normalizeRoute(route);
  return (
    normalizedRoute === normalizedPattern ||
    normalizedRoute.startsWith(`${normalizedPattern}/`)
  );
}

export function isStepCompletedByEvent(
  step: GuideStep,
  event: CompletionEventInput,
): boolean {
  const completion = step.completion;
  switch (completion.event) {
    case "click":
      return (
        event.type === "click" &&
        (event.targetId === undefined ||
          event.targetId === step.target.targetId)
      );
    case "value_present":
      return (
        event.type === "value_present" &&
        (event.targetId === undefined ||
          event.targetId === step.target.targetId)
      );
    case "route_change":
      return (
        event.type === "route_change" &&
        doesRouteMatch(completion.routeMatch, event.route)
      );
    case "manual":
      return event.type === "manual";
    default:
      return false;
  }
}

export function getCurrentStep(state: GuideMachineState): GuideStep | null {
  if (state.status !== "running") return null;
  return state.session.steps[state.currentIndex] ?? null;
}

/**
 * Whether pressing the tooltip's Next button should navigate to the step's
 * route instead of advancing the machine. `route_change` steps are meant to be
 * completed by actually reaching their target route; blindly advancing lands
 * the guide on the next step while the user is still on the old page, where
 * the next target is typically missing and the `skip` fallback silently
 * completes the whole guide. Navigating first lets the route-change completion
 * advance the step as designed.
 */
export function shouldNavigateOnNext(
  step: GuideStep | null | undefined,
  pathname: string | undefined,
): boolean {
  if (!step) return false;
  const completion = step.completion;
  if (completion.event !== "route_change") return false;
  if (!completion.routeMatch) return false;
  return !doesRouteMatch(completion.routeMatch, pathname);
}

function advance(state: GuideMachineState): GuideMachineState {
  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.session.steps.length) {
    return {
      ...state,
      status: "completed",
      progressCount: state.session.steps.length,
    };
  }
  return { ...state, currentIndex: nextIndex };
}

/**
 * Whether a step is a navigation step — one that moves the user to a page
 * (`interaction: "navigate"` or a `route_change` completion). Navigation steps
 * are never auto-skipped when their target is missing: every flow leads with
 * one, and skipping it cascades through the rest of the flow (the remaining
 * targets live on the page the user was never taken to), silently collapsing
 * the whole guide to "completed".
 */
export function isNavigationStep(
  step: GuideStep | null | undefined,
): boolean {
  if (!step) return false;
  return (
    step.interaction === "navigate" ||
    step.completion.event === "route_change"
  );
}

export function guideReducer(
  state: GuideMachineState,
  action: GuideAction,
): GuideMachineState {
  switch (action.type) {
    case "setSession": {
      const steps = action.session.steps;
      return {
        session: action.session,
        status: steps.length > 0 ? "running" : "completed",
        currentIndex: 0,
        skipped: [],
        progressCount: 0,
      };
    }

    case "start": {
      if (state.status === "running") return state;
      if (state.session.steps.length === 0) {
        return { ...state, status: "completed", progressCount: 0 };
      }
      return {
        ...state,
        status: "running",
        currentIndex: 0,
        skipped: [],
        stoppedReason: undefined,
        progressCount: 0,
      };
    }

    case "next":
      if (state.status !== "running") return state;
      return advance({ ...state, progressCount: state.progressCount + 1 });

    case "back":
      if (state.status !== "running") return state;
      return { ...state, currentIndex: Math.max(0, state.currentIndex - 1) };

    case "skip": {
      if (state.status !== "running") return state;
      const step = state.session.steps[state.currentIndex];
      if (!step) return state;
      return advance({
        ...state,
        skipped: [...state.skipped, step.stepId],
        progressCount: state.progressCount + 1,
      });
    }

    case "cancel":
      return { ...state, status: "cancelled" };

    case "stop":
      return { ...state, status: "stopped", stoppedReason: action.reason };

    case "complete":
      return {
        ...state,
        status: "completed",
        progressCount: state.session.steps.length,
      };

    case "completion": {
      if (state.status !== "running") return state;
      const step = state.session.steps[state.currentIndex];
      if (!step) return state;
      if (!isStepCompletedByEvent(step, action.event)) return state;
      return advance({ ...state, progressCount: state.progressCount + 1 });
    }

    default:
      return state;
  }
}

export type MissingTargetResolution =
  | { mode: "wait"; state: GuideMachineState }
  | { mode: "skip"; state: GuideMachineState }
  | { mode: "stop"; state: GuideMachineState }
  | { mode: "none"; state: GuideMachineState };

/**
 * Apply a step's `fallback.onMissing` policy when the current target is absent.
 * `wait` and `wait-stop` return the state unchanged so the caller re-scans after
 * `waitMs`; `stop` halts with a friendly reason; `skip` advances past the step.
 * The overlay decides the end of the wait window: `wait` skips, `wait-stop`
 * stops so a temporarily unavailable target never cascades a guide to a
 * silent completion.
 *
 * Navigation steps are an exception: they always resolve to `wait`. A skipped
 * nav step cascades through the rest of the flow (every flow leads with one)
 * and silently completes the whole guide while the user is still on the wrong
 * page — the overlay must instead surface a recovery action ("go to the step's
 * route") or keep waiting on a DOM re-scan.
 */
export function resolveMissingTarget(
  state: GuideMachineState,
): MissingTargetResolution {
  if (state.status !== "running") return { mode: "none", state };
  const step = state.session.steps[state.currentIndex];
  if (!step) return { mode: "none", state };
  if (isNavigationStep(step)) return { mode: "wait", state };
  const fallback = step.fallback.onMissing;
  if (fallback === "wait" || fallback === "wait-stop") {
    return { mode: "wait", state };
  }
  if (fallback === "stop") {
    return {
      mode: "stop",
      state: {
        ...state,
        status: "stopped",
        stoppedReason: `Missing target "${step.target.targetId}"`,
      },
    };
  }
  // skip
  return {
    mode: "skip",
    state: advance({
      ...state,
      skipped: [...state.skipped, step.stepId],
      progressCount: state.progressCount + 1,
    }),
  };
}
