"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Rect } from "@/lib/copilot/placement";

export type GuideTargetStatus = "pending" | "found" | "missing";

export interface GuideTargetState {
  targetId: string;
  status: GuideTargetStatus;
  /** Client rect relative to the viewport (matches a fixed portal overlay). */
  rect: Rect | null;
  element: HTMLElement | null;
}

function readRect(element: HTMLElement): Rect | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Resolves a registered `data-guide-id` anchor and keeps its rect fresh with
 * Mutation/Resize/Intersection observers plus scroll/resize listeners
 * (guider.md §9). Returns `pending` while the first scan runs, `found` with the
 * live rect, or `missing` when the node is absent or has zero area. Hidden or
 * off-screen targets are scrolled into view before measuring.
 */
export function useGuideTarget(
  targetId: string | null | undefined,
): GuideTargetState {
  const [state, setState] = useState<GuideTargetState>({
    targetId: targetId ?? "",
    status: "pending",
    rect: null,
    element: null,
  });

  const targetRef = useRef(targetId);
  useEffect(() => {
    targetRef.current = targetId;
  }, [targetId]);

  const scan = useCallback((): GuideTargetState | null => {
    const id = targetRef.current;
    if (!id) return null;
    const element = document.querySelector<HTMLElement>(
      `[data-guide-id="${id}"]`,
    );
    if (!element) {
      return { targetId: id, status: "missing", rect: null, element: null };
    }
    element.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "instant" as ScrollBehavior,
    });
    const rect = readRect(element);
    if (!rect) {
      return { targetId: id, status: "missing", rect: null, element };
    }
    return { targetId: id, status: "found", rect, element };
  }, []);

  const refresh = useCallback(() => {
    setState((prev) => {
      const next = scan();
      return next ?? prev;
    });
  }, [scan]);

  useEffect(() => {
    if (!targetId) {
      setState({ targetId: "", status: "pending", rect: null, element: null });
      return;
    }

    let disposed = false;
    const handleChange = () => {
      if (!disposed) refresh();
    };

    const mutation = new MutationObserver(handleChange);
    mutation.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-guide-id", "hidden", "class", "style"],
    });

    const element = document.querySelector<HTMLElement>(
      `[data-guide-id="${targetId}"]`,
    );
    if (element) {
      element.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "instant" as ScrollBehavior,
      });
    }

    // Initial scan (deferred so a just-rendered anchor is measured).
    const initial = window.setTimeout(() => {
      if (!disposed) refresh();
    }, 0);

    const onScrollResize = () => {
      if (!disposed) refresh();
    };
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);

    let resizeObserver: ResizeObserver | null = null;
    const observed = document.querySelector<HTMLElement>(
      `[data-guide-id="${targetId}"]`,
    );
    if (observed && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(onScrollResize);
      resizeObserver.observe(observed);
    }

    return () => {
      disposed = true;
      window.clearTimeout(initial);
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
      mutation.disconnect();
      resizeObserver?.disconnect();
    };
  }, [targetId, refresh]);

  return state;
}
