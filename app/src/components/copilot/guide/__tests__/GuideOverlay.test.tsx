// @vitest-environment jsdom
/**
 * Regression tests for GuideOverlay completion/fallback behavior:
 *  - a route_change step must only complete when the live route actually
 *    matches (Bug: handledRouteRef was armed before the match, so guides
 *    started off-route could never advance);
 *  - a missing target with fallback.onMissing "wait" must not hang forever —
 *    it self-skips after fallback.waitMs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { GuideStep } from "@/lib/copilot/copilot-types";
import type { GuideTargetState } from "@/hooks/features/useGuideTarget";
import type { GuideMachineState } from "@/lib/copilot/guide-machine";

const state = vi.hoisted(() => {
  const actions = {
    start: vi.fn(),
    next: vi.fn(),
    back: vi.fn(),
    skip: vi.fn(),
    cancel: vi.fn(),
    stop: vi.fn(),
    dispatch: vi.fn(),
  };
  return {
    pathname: "/dashboard/documents",
    guide: null as GuideMachineState | null,
    target: null as GuideTargetState | null,
    actions,
    routerPush: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({
    push: state.routerPush,
  }),
}));

vi.mock("@/providers/copilot-provider", () => ({
  useCopilot: () => ({
    guide: state.guide,
    guideActions: state.actions,
  }),
}));

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({ t: (key: string) => key, dir: "ltr" as const }),
}));

vi.mock("@/hooks/features/useGuideTarget", () => ({
  useGuideTarget: (targetId: string | null | undefined) =>
    state.target ?? {
      targetId: targetId ?? "",
      status: "found" as const,
      rect: { top: 0, left: 0, width: 200, height: 200 },
      element: null,
    },
}));

import { GuideOverlay } from "@/components/copilot/guide/GuideOverlay";
import { createInitialGuideState } from "@/lib/copilot/guide-machine";

function makeStep(overrides: Partial<GuideStep> & { stepId: string }): GuideStep {
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

function runningGuide(steps: GuideStep[]): GuideMachineState {
  return {
    ...createInitialGuideState({
      sessionId: "guide-1",
      flowId: "navigate.emails",
      locale: "en",
      dir: "ltr",
      entryRoute: "/dashboard/emails",
      steps,
    }),
    status: "running",
  };
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  state.guide = null;
  state.target = null;
  state.pathname = "/dashboard/documents";
  state.actions.dispatch.mockClear();
  state.actions.next.mockClear();
  state.actions.skip.mockClear();
  state.actions.stop.mockClear();
  state.routerPush.mockClear();
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

function renderOverlay() {
  act(() => {
    root.render(<GuideOverlay />);
  });
}

describe("GuideOverlay route_change completion", () => {
  it("does not dispatch while off-route, then completes once the route matches", () => {
    const navStep = makeStep({
      stepId: "step-1",
      target: { targetId: "nav-emails" },
      interaction: "navigate",
      completion: { event: "route_change", routeMatch: "/dashboard/emails" },
    });
    state.guide = runningGuide([navStep]);

    renderOverlay();
    expect(state.actions.dispatch).not.toHaveBeenCalled();

    state.pathname = "/dashboard/emails";
    renderOverlay();
    expect(state.actions.dispatch).toHaveBeenCalledTimes(1);
    expect(state.actions.dispatch).toHaveBeenCalledWith({
      type: "completion",
      event: { type: "route_change", route: "/dashboard/emails" },
    });
  });

  it("does not double-dispatch when the route stays matched", () => {
    const navStep = makeStep({
      stepId: "step-1",
      target: { targetId: "nav-emails" },
      interaction: "navigate",
      completion: { event: "route_change", routeMatch: "/dashboard/emails" },
    });
    state.guide = runningGuide([navStep]);
    state.pathname = "/dashboard/emails";

    renderOverlay();
    renderOverlay();

    expect(state.actions.dispatch).toHaveBeenCalledTimes(1);
  });
});

describe("GuideOverlay next button on route_change steps", () => {
  const navSteps = () => [
    makeStep({
      stepId: "step-1",
      target: { targetId: "nav-emails" },
      interaction: "navigate",
      completion: { event: "route_change", routeMatch: "/dashboard/emails" },
    }),
    makeStep({
      stepId: "step-2",
      target: { targetId: "nav-emails" },
      interaction: "navigate",
      completion: { event: "route_change", routeMatch: "/dashboard/emails" },
    }),
  ];

  function findPrimaryButton(): HTMLButtonElement | undefined {
    return Array.from(document.querySelectorAll("button")).find((button) => {
      const text = button.textContent?.trim();
      return text === "copilot.guide.next" || text === "copilot.guide.finish";
    });
  }

  it("navigates to the step route instead of advancing while off-route", () => {
    state.guide = runningGuide(navSteps());

    renderOverlay();
    const nextButton = findPrimaryButton();
    expect(nextButton).toBeTruthy();

    act(() => {
      nextButton?.click();
    });

    expect(state.routerPush).toHaveBeenCalledWith("/dashboard/emails");
    expect(state.actions.next).not.toHaveBeenCalled();
  });

  it("advances instead of navigating when the route is already matched", () => {
    state.guide = runningGuide(navSteps());
    state.pathname = "/dashboard/emails";

    renderOverlay();
    const nextButton = findPrimaryButton();
    expect(nextButton).toBeTruthy();

    act(() => {
      nextButton?.click();
    });

    expect(state.routerPush).not.toHaveBeenCalled();
    expect(state.actions.next).toHaveBeenCalledTimes(1);
  });

  it("hides the next button on interactive click steps", () => {
    const clickStep = makeStep({
      stepId: "step-1",
      target: { targetId: "documents-upload-button" },
      interaction: "click",
      completion: { event: "click" },
    });
    state.guide = runningGuide([clickStep]);

    renderOverlay();
    const buttons = Array.from(
      document.querySelectorAll("button"),
    ).map((button) => button.textContent?.trim());
    expect(buttons).not.toContain("copilot.guide.next");
    expect(buttons).not.toContain("copilot.guide.finish");
    expect(buttons).toContain("copilot.guide.skip");
  });
});

describe("GuideOverlay wait fallback", () => {
  it("skips after fallback.waitMs when the target stays missing", () => {
    vi.useFakeTimers();
    const waitStep = makeStep({
      stepId: "step-1",
      target: { targetId: "nav-emails" },
      completion: { event: "click" },
      fallback: { onMissing: "wait", waitMs: 250 },
    });
    state.guide = runningGuide([waitStep]);
    state.target = {
      targetId: "nav-emails",
      status: "missing",
      rect: null,
      element: null,
    };

    renderOverlay();
    expect(state.actions.skip).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(state.actions.skip).toHaveBeenCalledTimes(1);
  });

  it("does not skip before waitMs elapses", () => {
    vi.useFakeTimers();
    const waitStep = makeStep({
      stepId: "step-1",
      target: { targetId: "nav-emails" },
      completion: { event: "click" },
      fallback: { onMissing: "wait", waitMs: 5000 },
    });
    state.guide = runningGuide([waitStep]);
    state.target = {
      targetId: "nav-emails",
      status: "missing",
      rect: null,
      element: null,
    };

    renderOverlay();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(state.actions.skip).not.toHaveBeenCalled();
  });
});

describe("GuideOverlay tooltip collision avoidance (roles-create-button)", () => {
  // The overlay must stay transparent to pointer events except the tooltip card
  // itself, so a target the tooltip no longer covers remains clickable.
  it("keeps the overlay pointer-transparent except for the tooltip card", () => {
    const clickStep = makeStep({
      stepId: "step-2",
      target: { targetId: "roles-create-button" },
      placement: "top",
      interaction: "click",
      completion: { event: "click" },
    });
    state.guide = runningGuide([clickStep]);
    state.target = {
      targetId: "roles-create-button",
      status: "found",
      rect: { top: 210, left: 1210, width: 120, height: 40 },
      element: null,
    };

    renderOverlay();
    const overlay = document.querySelector("[data-copilot-guide-overlay]");
    expect(overlay).toBeTruthy();
    expect(overlay?.className).toContain("pointer-events-none");

    const interactive = Array.from(document.querySelectorAll("div")).filter(
      (el) => el.className.includes("pointer-events-auto"),
    );
    expect(interactive.length).toBe(1);
    expect(interactive[0].className).toContain("fixed");
  });

  it("clicking the interactive target dispatches completion and advances the guide", () => {
    const clickStep = makeStep({
      stepId: "step-2",
      target: { targetId: "roles-create-button" },
      placement: "top",
      interaction: "click",
      completion: { event: "click" },
    });
    state.guide = runningGuide([clickStep]);
    state.target = {
      targetId: "roles-create-button",
      status: "found",
      rect: { top: 210, left: 1210, width: 120, height: 40 },
      element: null,
    };

    const targetEl = document.createElement("button");
    targetEl.setAttribute("data-guide-id", "roles-create-button");
    document.body.appendChild(targetEl);

    renderOverlay();
    expect(state.actions.dispatch).not.toHaveBeenCalled();

    act(() => {
      targetEl.click();
    });
    expect(state.actions.dispatch).toHaveBeenCalledWith({
      type: "completion",
      event: { type: "click", targetId: "roles-create-button" },
    });
    targetEl.remove();
  });
});

describe("GuideOverlay missing navigation target recovery", () => {
  // The roles.create flow opens with a nav-roles step (interaction "navigate",
  // completion route_change to /dashboard/roles, default fallback skip). A
  // missing nav target must never auto-skip into a silently completed guide.
  const navRolesStep = () =>
    makeStep({
      stepId: "step-1",
      target: { targetId: "nav-roles" },
      interaction: "navigate",
      completion: { event: "route_change", routeMatch: "/dashboard/roles" },
      fallback: { onMissing: "skip" },
    });

  it("never auto-skips a missing navigation target, even with skip fallback", () => {
    vi.useFakeTimers();
    state.guide = runningGuide([navRolesStep()]);
    state.target = {
      targetId: "nav-roles",
      status: "missing",
      rect: null,
      element: null,
    };

    renderOverlay();
    expect(state.actions.skip).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(state.actions.skip).not.toHaveBeenCalled();
    expect(state.guide.status).toBe("running");
  });

  it("renders a recovery card with go-to-route and cancel instead of the waiting pill", () => {
    state.guide = runningGuide([navRolesStep()]);
    state.target = {
      targetId: "nav-roles",
      status: "missing",
      rect: null,
      element: null,
    };

    renderOverlay();
    const buttons = Array.from(document.querySelectorAll("button")).map(
      (button) => button.textContent?.trim(),
    );
    expect(buttons).toContain("copilot.guide.goToRoute");
    expect(buttons).toContain("copilot.guide.cancel");
    expect(document.body.textContent).not.toContain("copilot.guide.waiting");

    const goToRoute = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "copilot.guide.goToRoute",
    );
    act(() => {
      goToRoute?.click();
    });
    expect(state.routerPush).toHaveBeenCalledWith("/dashboard/roles");
  });

  it("resumes the guide when the recovery action reaches the route", () => {
    state.guide = runningGuide([navRolesStep()]);
    state.target = {
      targetId: "nav-roles",
      status: "missing",
      rect: null,
      element: null,
    };

    renderOverlay();
    const goToRoute = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "copilot.guide.goToRoute",
    );
    act(() => {
      goToRoute?.click();
    });
    expect(state.routerPush).toHaveBeenCalledWith("/dashboard/roles");

    state.pathname = "/dashboard/roles";
    state.target = {
      targetId: "nav-roles",
      status: "found",
      rect: { top: 0, left: 0, width: 200, height: 200 },
      element: null,
    };
    renderOverlay();
    expect(state.actions.dispatch).toHaveBeenCalledWith({
      type: "completion",
      event: { type: "route_change", route: "/dashboard/roles" },
    });
  });

  it("cancel from the recovery card ends the guide", () => {
    state.guide = runningGuide([navRolesStep()]);
    state.target = {
      targetId: "nav-roles",
      status: "missing",
      rect: null,
      element: null,
    };

    renderOverlay();
    const cancel = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "copilot.guide.cancel",
    );
    act(() => {
      cancel?.click();
    });
    expect(state.actions.cancel).toHaveBeenCalledTimes(1);
  });
});
