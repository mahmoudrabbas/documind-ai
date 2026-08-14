"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useCopilot } from "@/providers/copilot-provider";
import { useGuideTarget } from "@/hooks/features/useGuideTarget";
import { useI18n } from "@/providers/i18n-provider";
import { Button } from "@/components/ui/Button";
import { GuideSpotlight } from "./GuideSpotlight";
import { GuideArrow } from "./GuideArrow";
import { GuideTooltip } from "./GuideTooltip";
import {
  computeTooltipPlacement,
  resolvePlacement,
  type Size,
} from "@/lib/copilot/placement";
import {
  doesRouteMatch,
  getCurrentStep,
  resolveMissingTarget,
  shouldNavigateOnNext,
} from "@/lib/copilot/guide-machine";

/**
 * Full-screen guide overlay (guider.md §9). Portal-rendered so it sits above
 * the app chrome. It resolves the current step's target, draws the spotlight
 * + tooltip + arrow, and feeds completion events back into the guide machine:
 *
 *   - click / input steps → captured on `document` against `data-guide-id`
 *   - route_change steps → `usePathname` changes
 *   - manual steps → the Next button
 *
 * Missing targets fall back per the step policy (skip / stop / wait).
 */
export function GuideOverlay() {
  const { guide, guideActions } = useCopilot();
  const { t, dir } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  const step = useMemo(() => (guide ? getCurrentStep(guide) : null), [guide]);
  const targetState = useGuideTarget(step?.target.targetId ?? null);

  const [tooltipSize, setTooltipSize] = useState<Size>({ width: 0, height: 0 });
  const tooltipObserverRef = useRef<ResizeObserver | null>(null);

  // Next on a route_change step navigates to the step's route (the step only
  // completes when the route is actually reached). On every other step it
  // advances the machine as before.
  const handleNext = useCallback(() => {
    if (step && shouldNavigateOnNext(step, pathname)) {
      router.push(step.completion.routeMatch as string);
      return;
    }
    guideActions.next();
  }, [step, pathname, router, guideActions]);

  const measureTooltip = useCallback((node: HTMLDivElement | null) => {
    tooltipObserverRef.current?.disconnect();
    tooltipObserverRef.current = null;
    if (!node) return;
    const box = node.getBoundingClientRect();
    setTooltipSize({ width: box.width, height: box.height });
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const rect = entries[0].contentRect;
        setTooltipSize({ width: rect.width, height: rect.height });
      });
      observer.observe(node);
      tooltipObserverRef.current = observer;
    }
  }, []);

  // ---- completion: click / input captured on document ----
  const currentStepRef = useRef(step);
  useEffect(() => {
    currentStepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleClick = (event: MouseEvent) => {
      const current = currentStepRef.current;
      if (!current || current.completion.event !== "click") return;
      const el = (event.target as HTMLElement | null)?.closest?.(
        "[data-guide-id]",
      );
      const targetId = el?.getAttribute("data-guide-id");
      if (targetId === current.target.targetId) {
        guideActions.dispatch({
          type: "completion",
          event: { type: "click", targetId },
        });
      }
    };
    const handleInput = (event: Event) => {
      const current = currentStepRef.current;
      if (!current || current.completion.event !== "value_present") return;
      const el = (event.target as HTMLElement | null)?.closest?.(
        "[data-guide-id]",
      );
      const targetId = el?.getAttribute("data-guide-id");
      if (targetId === current.target.targetId) {
        guideActions.dispatch({
          type: "completion",
          event: { type: "value_present", targetId },
        });
      }
    };
    document.addEventListener("click", handleClick, true);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("change", handleInput, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("change", handleInput, true);
    };
  }, [guideActions]);

  // ---- completion: route changes ----
  // A route_change step only completes when the live route actually satisfies
  // the step's `routeMatch`. Previously the handled marker was armed before the
  // match, so a guide started off-route could never advance after navigating.
  const handledRouteRef = useRef("");
  useEffect(() => {
    if (!step || step.completion.event !== "route_change") return;
    if (!doesRouteMatch(step.completion.routeMatch, pathname)) {
      handledRouteRef.current = "";
      return;
    }
    if (handledRouteRef.current === step.stepId) return;
    handledRouteRef.current = step.stepId;
    guideActions.dispatch({
      type: "completion",
      event: { type: "route_change", route: pathname },
    });
  }, [pathname, step, guideActions]);

  // ---- missing-target fallback policy ----
  const handledMissingRef = useRef("");
  useEffect(() => {
    if (!step || !guide || guide.status !== "running") return;
    if (targetState.targetId !== step.target.targetId) return;
    if (targetState.status !== "missing") {
      handledMissingRef.current = "";
      return;
    }
    const key = `${step.stepId}:missing`;
    if (handledMissingRef.current === key) return;
    const resolution = resolveMissingTarget(guide);
    handledMissingRef.current = key;
    if (resolution.mode === "skip") {
      guideActions.skip();
    } else if (resolution.mode === "stop") {
      guideActions.stop(resolution.state.stoppedReason);
    } else if (resolution.mode === "wait") {
      // "wait" keeps the overlay in a waiting state while useGuideTarget
      // re-scans on DOM mutations. Bound it with `fallback.waitMs` so a target
      // that never appears can't hang the guide forever.
      const waitMs = step.fallback.waitMs ?? 5000;
      const timer = window.setTimeout(() => {
        guideActions.skip();
      }, waitMs);
      return () => window.clearTimeout(timer);
    }
  }, [step, guide, targetState.status, targetState.targetId, guideActions]);

  const viewport = {
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  };

  let placement: ReturnType<typeof computeTooltipPlacement> | null = null;
  if (
    step &&
    targetState.rect &&
    targetState.targetId === step.target.targetId &&
    tooltipSize.width > 0 &&
    tooltipSize.height > 0
  ) {
    const side = resolvePlacement(step.placement, dir);
    placement = computeTooltipPlacement(
      targetState.rect,
      tooltipSize,
      side,
      viewport,
    );
  }

  if (typeof window === "undefined" || !guide) return null;
  if (guide.status === "cancelled") return null;

  const targetCurrent = targetState.targetId === (step?.target.targetId ?? "");

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-80"
      data-copilot-guide-overlay
    >
      {guide.status === "running" && targetState.rect && targetCurrent ? (
        <GuideSpotlight rect={targetState.rect} />
      ) : null}

      {guide.status === "stopped" ? (
          <div className="pointer-events-auto fixed inset-0 z-85 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-outline-variant bg-surface-bright p-6 text-center shadow-xl">
            <h3 className="text-body-lg font-bold text-danger">
              {t("copilot.guide.stopped")}
            </h3>
            {guide.stoppedReason ? (
              <p className="mt-1 text-body-md text-on-surface-variant">
                {guide.stoppedReason}
              </p>
            ) : null}
            <Button
              variant="primary"
              size="md"
              className="mt-4"
              onClick={guideActions.cancel}
            >
              {t("copilot.guide.cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {guide.status === "completed" ? null : null}

      {guide.status === "running" && step ? (
        <>
          {targetState.status === "missing" && targetCurrent ? (
            <div className="fixed left-1/2 top-8 z-85 -translate-x-1/2">
              <div className="flex items-center gap-2 rounded-full border border-outline-variant bg-surface-bright px-4 py-2 text-label-md text-on-surface-variant shadow-lg">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                {t("copilot.guide.waiting")}
              </div>
            </div>
          ) : null}

          {targetState.status === "found" && targetState.rect && targetCurrent ? (
            <div
              className="pointer-events-auto fixed z-85"
              style={{
                top: placement ? placement.top : -9999,
                left: placement ? placement.left : -9999,
                visibility: placement ? "visible" : "hidden",
              }}
            >
              <div ref={measureTooltip}>
                <GuideTooltip
                  step={step}
                  currentIndex={guide.currentIndex}
                  totalSteps={guide.session.steps.length}
                  dir={dir}
                  onNext={handleNext}
                  onBack={guideActions.back}
                  onSkip={guideActions.skip}
                  onCancel={guideActions.cancel}
                />
              </div>
              {placement ? (
                <GuideArrow
                  side={placement.side}
                  anchor={placement.anchor}
                  tooltip={{
                    top: placement.top,
                    left: placement.left,
                    width: tooltipSize.width,
                    height: tooltipSize.height,
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>,
    document.body,
  );
}
