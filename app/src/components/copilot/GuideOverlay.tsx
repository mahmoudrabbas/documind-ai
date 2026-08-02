"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GuideInstruction } from "@/types/api/copilot.types";
import { cn } from "@/lib/utils";

interface TargetRect {
  id: string;
  rect: DOMRect;
}

type Position = "top" | "bottom" | "left" | "right";

function isRtl(): boolean {
  return typeof document !== "undefined" && document.documentElement.dir === "rtl";
}

function queryTarget(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function getRect(id: string): TargetRect | null {
  const el = queryTarget(id);
  if (!el) return null;
  return { id, rect: el.getBoundingClientRect() };
}

export function GuideOverlay({
  instructions,
  onComplete,
  onSkip,
}: {
  instructions: GuideInstruction[];
  onComplete: () => void;
  onSkip: () => void;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [target, setTarget] = useState<TargetRect | null>(null);
  const [message, setMessage] = useState<string>("");
  const [arrow, setArrow] = useState<{ id: string; position: Position } | null>(null);
  const [tooltip, setTooltip] = useState<{ id: string; message: string; position: Position } | null>(null);
  const [hint, setHint] = useState<{ message: string; position?: Position } | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [complete, setComplete] = useState<string | null>(null);

  const instruction = instructions[current];

  const refreshTarget = useCallback((id: string | null) => {
    setTarget(id ? getRect(id) : null);
  }, []);

  const advance = useCallback(() => {
    setCurrent((c) => Math.min(c + 1, instructions.length));
  }, [instructions.length]);

  useEffect(() => {
    if (current >= instructions.length) {
      onComplete();
      return;
    }

    const inst = instructions[current];

    setHint(null);
    setTooltip(null);
    setArrow(null);
    setMessage("");
    setWaiting(false);
    setCelebrate(null);
    setComplete(null);

    const fire = (name: string, detail: Record<string, unknown>) => {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    };

    switch (inst.type) {
      case "navigate": {
        const params = inst.params ? new URLSearchParams(inst.params).toString() : "";
        router.push(params ? `${inst.route}?${params}` : inst.route);
        advance();
        break;
      }
      case "scrollTo": {
        const rect = getRect(inst.elementId);
        if (rect) {
          queryTarget(inst.elementId)?.scrollIntoView({ behavior: "smooth", block: "center" });
          refreshTarget(inst.elementId);
        }
        break;
      }
      case "expandSection": {
        fire("copilot:expand-section", { sectionId: inst.sectionId });
        advance();
        break;
      }
      case "openDialog": {
        fire("copilot:open-dialog", { dialogId: inst.dialogId });
        advance();
        break;
      }
      case "highlight": {
        refreshTarget(inst.elementId);
        setMessage(inst.message);
        setWaiting(true);
        break;
      }
      case "showArrow": {
        refreshTarget(inst.elementId);
        setArrow({ id: inst.elementId, position: inst.position });
        setWaiting(true);
        break;
      }
      case "showTooltip": {
        refreshTarget(inst.elementId);
        setTooltip({ id: inst.elementId, message: inst.message, position: inst.position ?? "top" });
        setWaiting(true);
        break;
      }
      case "focus": {
        queryTarget(inst.elementId)?.focus();
        break;
      }
      case "waitForUser": {
        setMessage(inst.message);
        setWaiting(true);
        break;
      }
      case "showHint": {
        setHint({ message: inst.message, position: inst.position });
        setWaiting(true);
        break;
      }
      case "celebrate": {
        setCelebrate(inst.message);
        setWaiting(true);
        break;
      }
      case "complete": {
        setComplete(inst.message);
        setWaiting(false);
        break;
      }
    }
  }, [current, instructions, router, advance, refreshTarget, onComplete]);

  useEffect(() => {
    if (current >= instructions.length) return;

    const inst = instructions[current];
    if (!("elementId" in inst) || !inst.elementId) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 50;

    const resolve = () => {
      if (cancelled) return;
      const rect = getRect(inst.elementId);
      if (rect) {
        if (inst.type === "scrollTo") {
          queryTarget(inst.elementId)?.scrollIntoView({ behavior: "smooth", block: "center" });
          refreshTarget(inst.elementId);
          advance();
        } else if (inst.type === "focus") {
          queryTarget(inst.elementId)?.focus();
          advance();
        } else {
          refreshTarget(inst.elementId);
        }
        return;
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
        if (inst.type === "scrollTo" || inst.type === "focus") advance();
        return;
      }
      setTimeout(resolve, 100);
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [current, instructions, advance, refreshTarget]);

  useEffect(() => {
    if (!target) return;
    const update = () => refreshTarget(target.id);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [target, refreshTarget]);

  if (current >= instructions.length || !instruction) return null;

  const rtl = isRtl();
  const isLast = current === instructions.length - 1;
  const spotlightRect = target?.rect;
  const arrowRect = arrow && target?.id === arrow.id ? target.rect : null;

  const arrowPosition = arrow?.position ?? "top";

  const arrowStyle = (): React.CSSProperties => {
    if (!arrowRect) return { display: "none" };
    switch (arrowPosition) {
      case "bottom":
        return { left: arrowRect.left + arrowRect.width / 2 - 8, top: arrowRect.top - 24 };
      case "top":
        return { left: arrowRect.left + arrowRect.width / 2 - 8, top: arrowRect.top + arrowRect.height + 4 };
      case "left":
        return { left: arrowRect.left - 8, top: arrowRect.top + arrowRect.height / 2 - 8 };
      case "right":
        return { left: arrowRect.left + arrowRect.width + 4, top: arrowRect.top + arrowRect.height / 2 - 8 };
    }
  };

  const tooltipOffset = (position: Position): { style: React.CSSProperties; placement: Position } => {
    if (!target) return { style: {}, placement: position };
    const r = target.rect;
    const gap = 12;
    switch (position) {
      case "top":
        return { style: { bottom: window.innerHeight - r.top + gap }, placement: "top" };
      case "bottom":
        return { style: { top: r.bottom + gap }, placement: "bottom" };
      case "left":
        return { style: { right: rtl ? window.innerWidth - r.right + gap : undefined, left: rtl ? undefined : r.left - 260 - gap }, placement: "left" };
      case "right":
        return { style: { left: rtl ? undefined : r.right + gap, right: rtl ? window.innerWidth - r.left + gap : undefined }, placement: "right" };
    }
  };

  const tooltipStyle = tooltip ? tooltipOffset(tooltip.position) : null;

  return (
    <>
      {spotlightRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[100] transition-all duration-300"
          style={{
            left: spotlightRect.left - 4,
            top: spotlightRect.top - 4,
            width: spotlightRect.width + 8,
            height: spotlightRect.height + 8,
            borderRadius: 12,
            boxShadow: "0 0 0 4px rgba(99, 102, 241, 0.9), 0 0 0 9999px rgba(0, 0, 0, 0.45)",
          }}
        />
      ) : null}

      {arrowRect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[100]"
          style={arrowStyle()}
        >
          <span
            className={cn(
              "block h-0 w-0 border-x-8 border-solid",
              arrowPosition === "bottom" && "border-x-transparent border-t-8 border-t-primary",
              arrowPosition === "top" && "border-x-transparent border-b-8 border-b-primary",
              arrowPosition === "left" && "border-y-transparent border-r-8 border-r-primary",
              arrowPosition === "right" && "border-y-transparent border-l-8 border-l-primary",
            )}
          />
        </div>
      ) : null}

      {tooltip && tooltipStyle ? (
        <div
          className="fixed z-[100] max-w-[280px] rounded-xl bg-primary px-4 py-3 text-sm font-medium text-on-primary shadow-modal"
          style={tooltipStyle.style}
          role="tooltip"
        >
          <p>{tooltip.message}</p>
        </div>
      ) : null}

      <div className="fixed bottom-6 left-1/2 z-[100] w-[min(92vw,480px)] -translate-x-1/2 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-modal rtl:translate-x-1/2">
        {celebrate ? (
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl text-warning">celebration</span>
            <div>
              <p className="text-title-md font-bold text-on-surface">Great job!</p>
              <p className="text-sm text-on-surface-variant">{celebrate}</p>
            </div>
          </div>
        ) : complete ? (
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl text-primary">task_alt</span>
            <div>
              <p className="text-title-md font-bold text-on-surface">Complete</p>
              <p className="text-sm text-on-surface-variant">{complete}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined mt-0.5 text-primary">explore</span>
            <div className="min-w-0 flex-1">
              <p className="text-label-md font-medium text-primary">Copilot Guide</p>
              <p className="mt-0.5 text-sm text-on-surface">{message || hint?.message || "Follow the highlighted area."}</p>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-container-high">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${((current + 1) / instructions.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            onClick={onSkip}
            className="rounded-lg px-3 py-1.5 text-label-md font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            Skip guide
          </button>
          {isLast || complete ? (
            <button
              onClick={() => { onComplete(); }}
              className="rounded-lg bg-primary px-4 py-1.5 text-label-md font-medium text-on-primary transition-colors hover:bg-primary/90"
            >
              Finish
            </button>
          ) : (
            <button
              onClick={advance}
              className="rounded-lg bg-primary px-4 py-1.5 text-label-md font-medium text-on-primary transition-colors hover:bg-primary/90"
            >
              {waiting ? "Next" : "Continue"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
