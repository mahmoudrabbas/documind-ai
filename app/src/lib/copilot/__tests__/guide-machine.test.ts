import { beforeEach, describe, expect, it } from "vitest";
import type { GuideSession, GuideStep } from "@/lib/copilot/copilot-types";
import {
  createInitialGuideState,
  doesRouteMatch,
  getCurrentStep,
  guideReducer,
  isNavigationStep,
  isStepCompletedByEvent,
  normalizeRoute,
  resolveMissingTarget,
  shouldNavigateOnNext,
  type GuideMachineState,
} from "@/lib/copilot/guide-machine";

function makeStep(
  overrides: Partial<GuideStep> & { stepId: string },
): GuideStep {
  return {
    order: 1,
    title: "Title",
    instruction: "Instruction",
    target: { targetId: "documents-upload-button" },
    placement: "top",
    interaction: "click",
    completion: { event: "click" },
    fallback: { onMissing: "skip" },
    ...overrides,
  };
}

function makeSession(steps: GuideStep[]): GuideSession {
  return {
    sessionId: "guide-1",
    flowId: "documents.upload",
    locale: "en",
    dir: "ltr",
    entryRoute: "/dashboard/documents",
    steps,
  };
}

const uploadSession = makeSession([
  makeStep({
    stepId: "s1",
    completion: { event: "route_change", routeMatch: "/dashboard/documents" },
    interaction: "navigate",
  }),
  makeStep({
    stepId: "s2",
    target: { targetId: "documents-upload-button" },
    completion: { event: "click" },
  }),
  makeStep({
    stepId: "s3",
    target: { targetId: "documents-title-input" },
    interaction: "input",
    completion: { event: "value_present" },
  }),
]);

describe("normalizeRoute / doesRouteMatch", () => {
  it("normalizes trailing slashes and strips query strings", () => {
    expect(normalizeRoute("/dashboard/documents/")).toBe(
      "/dashboard/documents",
    );
    expect(normalizeRoute("/dashboard/documents/?x=1")).toBe(
      "/dashboard/documents",
    );
    expect(normalizeRoute("/")).toBe("/");
  });

  it("matches exact and nested routes", () => {
    expect(doesRouteMatch("/dashboard/documents", "/dashboard/documents")).toBe(
      true,
    );
    expect(
      doesRouteMatch("/dashboard/documents", "/dashboard/documents/"),
    ).toBe(true);
    expect(
      doesRouteMatch("/dashboard/documents", "/dashboard/documents?tab=all"),
    ).toBe(true);
    expect(
      doesRouteMatch("/dashboard/settings", "/dashboard/settings/billing"),
    ).toBe(true);
    expect(doesRouteMatch("/dashboard/documents", "/dashboard/chat")).toBe(
      false,
    );
  });

  it("matches when no pattern is required", () => {
    expect(doesRouteMatch(undefined, "/dashboard/chat")).toBe(true);
    expect(doesRouteMatch(undefined, undefined)).toBe(false);
  });
});

describe("isStepCompletedByEvent", () => {
  it("completes a click step on a matching target click", () => {
    const step = makeStep({ stepId: "s2", completion: { event: "click" } });
    expect(
      isStepCompletedByEvent(step, {
        type: "click",
        targetId: "documents-upload-button",
      }),
    ).toBe(true);
    expect(
      isStepCompletedByEvent(step, {
        type: "click",
        targetId: "documents-title-input",
      }),
    ).toBe(false);
    expect(
      isStepCompletedByEvent(step, {
        type: "value_present",
        targetId: "documents-upload-button",
      }),
    ).toBe(false);
  });

  it("completes a value_present step when the target receives input", () => {
    const step = makeStep({
      stepId: "s3",
      target: { targetId: "documents-title-input" },
      completion: { event: "value_present" },
    });
    expect(
      isStepCompletedByEvent(step, {
        type: "value_present",
        targetId: "documents-title-input",
      }),
    ).toBe(true);
    expect(
      isStepCompletedByEvent(step, {
        type: "click",
        targetId: "documents-title-input",
      }),
    ).toBe(false);
  });

  it("completes a route_change step when the route matches", () => {
    const step = makeStep({
      stepId: "s1",
      completion: { event: "route_change", routeMatch: "/dashboard/documents" },
    });
    expect(
      isStepCompletedByEvent(step, {
        type: "route_change",
        route: "/dashboard/documents",
      }),
    ).toBe(true);
    expect(
      isStepCompletedByEvent(step, {
        type: "route_change",
        route: "/dashboard/chat",
      }),
    ).toBe(false);
  });

  it("completes a manual step on a manual event", () => {
    const step = makeStep({ stepId: "s4", completion: { event: "manual" } });
    expect(isStepCompletedByEvent(step, { type: "manual" })).toBe(true);
    expect(isStepCompletedByEvent(step, { type: "click" })).toBe(false);
  });
});

describe("guideReducer transitions", () => {
  let state: GuideMachineState;

  beforeEach(() => {
    state = createInitialGuideState(uploadSession);
  });

  it("starts on the first step", () => {
    const started = guideReducer(state, { type: "start" });
    expect(started.status).toBe("running");
    expect(started.currentIndex).toBe(0);
    expect(getCurrentStep(started)?.stepId).toBe("s1");
  });

  it("next advances and completing the last step completes the guide", () => {
    let s = guideReducer(state, { type: "start" });
    s = guideReducer(s, { type: "next" }); // 0 -> 1
    s = guideReducer(s, { type: "next" }); // 1 -> 2
    s = guideReducer(s, { type: "next" }); // last -> completed
    expect(s.status).toBe("completed");
    expect(s.progressCount).toBe(uploadSession.steps.length);
  });

  it("back never goes below the first step", () => {
    let s = guideReducer(state, { type: "start" });
    s = guideReducer(s, { type: "back" });
    expect(s.currentIndex).toBe(0);
    s = guideReducer(s, { type: "next" });
    s = guideReducer(s, { type: "back" });
    expect(s.currentIndex).toBe(0);
  });

  it("skip records the step id and advances", () => {
    let s = guideReducer(state, { type: "start" });
    s = guideReducer(s, { type: "skip" });
    expect(s.skipped).toEqual(["s1"]);
    expect(s.currentIndex).toBe(1);
    expect(s.progressCount).toBe(1);
  });

  it("cancel and complete set terminal statuses", () => {
    expect(guideReducer(state, { type: "cancel" }).status).toBe("cancelled");
    const s = guideReducer(state, { type: "start" });
    expect(guideReducer(s, { type: "complete" }).status).toBe("completed");
  });

  it("advances only on a matching completion event", () => {
    let s = guideReducer(state, { type: "start" });
    s = guideReducer(s, {
      type: "completion",
      event: { type: "route_change", route: "/dashboard/chat" },
    });
    expect(s.currentIndex).toBe(0); // non-matching route
    s = guideReducer(s, {
      type: "completion",
      event: { type: "route_change", route: "/dashboard/documents" },
    });
    expect(s.currentIndex).toBe(1);
  });

  it("an empty session immediately completes on start", () => {
    const empty = createInitialGuideState(makeSession([]));
    expect(guideReducer(empty, { type: "start" }).status).toBe("completed");
  });
});

describe("shouldNavigateOnNext", () => {
  it("navigates on a route_change step whose route is not yet active", () => {
    const step = makeStep({
      stepId: "s1",
      interaction: "navigate",
      completion: {
        event: "route_change",
        routeMatch: "/dashboard/settings/billing",
      },
    });
    expect(shouldNavigateOnNext(step, "/dashboard")).toBe(true);
  });

  it("advances when the route_change step's route is already active", () => {
    const step = makeStep({
      stepId: "s1",
      interaction: "navigate",
      completion: {
        event: "route_change",
        routeMatch: "/dashboard/settings/billing",
      },
    });
    expect(shouldNavigateOnNext(step, "/dashboard/settings/billing")).toBe(
      false,
    );
    expect(
      shouldNavigateOnNext(step, "/dashboard/settings/billing/payments"),
    ).toBe(false);
  });

  it("never navigates for click, value_present, or manual steps", () => {
    expect(shouldNavigateOnNext(makeStep({ stepId: "s2" }), "/dashboard")).toBe(
      false,
    );
    const inputStep = makeStep({
      stepId: "s3",
      interaction: "input",
      completion: { event: "value_present" },
    });
    expect(shouldNavigateOnNext(inputStep, "/dashboard")).toBe(false);
    const manualStep = makeStep({
      stepId: "s4",
      completion: { event: "manual" },
    });
    expect(shouldNavigateOnNext(manualStep, "/dashboard")).toBe(false);
  });

  it("is false for a missing step or a step without a route match", () => {
    expect(shouldNavigateOnNext(null, "/dashboard")).toBe(false);
    const noRoute = makeStep({
      stepId: "s1",
      interaction: "navigate",
      completion: { event: "route_change" },
    });
    expect(shouldNavigateOnNext(noRoute, "/dashboard")).toBe(false);
  });
});

describe("resolveMissingTarget fallback policies", () => {
  it("skip advances past the missing step", () => {
    const session = makeSession([
      makeStep({ stepId: "s1", fallback: { onMissing: "skip" } }),
      makeStep({ stepId: "s2" }),
    ]);
    let state = guideReducer(createInitialGuideState(session), {
      type: "start",
    });
    const resolution = resolveMissingTarget(state);
    expect(resolution.mode).toBe("skip");
    expect(resolution.state.currentIndex).toBe(1);
    expect(resolution.state.skipped).toEqual(["s1"]);
    state = resolution.state;
    const stop = resolveMissingTarget(state);
    expect(stop.mode).toBe("skip");
    expect(stop.state.status).toBe("completed");
  });

  it("wait keeps the current step for re-scan", () => {
    const session = makeSession([
      makeStep({ stepId: "s1", fallback: { onMissing: "wait", waitMs: 2000 } }),
    ]);
    const state = guideReducer(createInitialGuideState(session), {
      type: "start",
    });
    const resolution = resolveMissingTarget(state);
    expect(resolution.mode).toBe("wait");
    expect(resolution.state.currentIndex).toBe(0);
    expect(resolution.state.status).toBe("running");
  });

  it("stop halts with a reason", () => {
    const session = makeSession([
      makeStep({
        stepId: "s1",
        target: { targetId: "documents-table-row-menu" },
        fallback: { onMissing: "stop" },
      }),
    ]);
    const state = guideReducer(createInitialGuideState(session), {
      type: "start",
    });
    const resolution = resolveMissingTarget(state);
    expect(resolution.mode).toBe("stop");
    expect(resolution.state.status).toBe("stopped");
    expect(resolution.state.stoppedReason).toContain(
      "documents-table-row-menu",
    );
  });

  it("none for a non-running guide", () => {
    const session = makeSession([makeStep({ stepId: "s1" })]);
    const resolution = resolveMissingTarget(createInitialGuideState(session));
    expect(resolution.mode).toBe("none");
  });
});

describe("resolveMissingTarget never skips navigation steps", () => {
  it("a missing navigation step stays wait even with skip fallback", () => {
    const session = makeSession([
      makeStep({
        stepId: "s1",
        interaction: "navigate",
        completion: { event: "route_change", routeMatch: "/dashboard/roles" },
        fallback: { onMissing: "skip" },
      }),
      makeStep({ stepId: "s2" }),
    ]);
    let state = guideReducer(createInitialGuideState(session), {
      type: "start",
    });
    const resolution = resolveMissingTarget(state);
    expect(resolution.mode).toBe("wait");
    expect(resolution.state.currentIndex).toBe(0);
    expect(resolution.state.status).toBe("running");
    expect(resolution.state.skipped).toEqual([]);
    state = resolution.state;
    const again = resolveMissingTarget(state);
    expect(again.mode).toBe("wait");
    expect(again.state.status).toBe("running");
  });

  it("a route_change completion marks a step as a navigation step", () => {
    const nav = makeStep({
      stepId: "s1",
      interaction: "click",
      completion: { event: "route_change", routeMatch: "/dashboard/roles" },
    });
    expect(isNavigationStep(nav)).toBe(true);
    const navigate = makeStep({
      stepId: "s2",
      interaction: "navigate",
      completion: { event: "route_change", routeMatch: "/dashboard/roles" },
    });
    expect(isNavigationStep(navigate)).toBe(true);
  });

  it("isNavigationStep is false for click, value_present, and manual steps", () => {
    expect(
      isNavigationStep(makeStep({ stepId: "s1", completion: { event: "click" } })),
    ).toBe(false);
    const input = makeStep({
      stepId: "s2",
      interaction: "input",
      completion: { event: "value_present" },
    });
    expect(isNavigationStep(input)).toBe(false);
    const manual = makeStep({
      stepId: "s3",
      completion: { event: "manual" },
    });
    expect(isNavigationStep(manual)).toBe(false);
    expect(isNavigationStep(null)).toBe(false);
    expect(isNavigationStep(undefined)).toBe(false);
  });
});
