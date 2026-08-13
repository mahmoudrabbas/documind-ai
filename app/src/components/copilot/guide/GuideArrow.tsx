"use client";

import type { CSSProperties } from "react";
import type { PhysicalSide } from "@/lib/copilot/placement";

interface GuideArrowProps {
  side: PhysicalSide;
  /** Arrow tip position (viewport coords) — used to align along the axis. */
  anchor: { top: number; left: number };
  /** Tooltip rect (viewport coords) so the arrow stays glued to the tooltip edge. */
  tooltip: { top: number; left: number; width: number; height: number };
}

const ARROW = 10;

/**
 * Small diamond-shaped arrow on the tooltip edge pointing at the target.
 * Positioned relative to the tooltip element; the edge (`side`) mirrors the
 * tooltip's placement side.
 */
export function GuideArrow({ side, anchor, tooltip }: GuideArrowProps) {
  let style: CSSProperties = {};
  switch (side) {
    case "top": // tooltip above target → arrow on the bottom edge, pointing down
      style = {
        bottom: -ARROW + 1,
        left: anchor.left - tooltip.left - ARROW,
      };
      break;
    case "bottom":
      style = {
        top: -ARROW + 1,
        left: anchor.left - tooltip.left - ARROW,
      };
      break;
    case "left":
      style = {
        right: -ARROW + 1,
        top: anchor.top - tooltip.top - ARROW,
      };
      break;
    case "right":
      style = {
        left: -ARROW + 1,
        top: anchor.top - tooltip.top - ARROW,
      };
      break;
  }

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute h-0 w-0"
      style={{
        ...style,
        border: `${ARROW}px solid transparent`,
        borderTopColor:
          side === "top" ? "var(--color-surface-bright, #fff)" : undefined,
        borderBottomColor:
          side === "bottom" ? "var(--color-surface-bright, #fff)" : undefined,
        borderLeftColor:
          side === "left" ? "var(--color-surface-bright, #fff)" : undefined,
        borderRightColor:
          side === "right" ? "var(--color-surface-bright, #fff)" : undefined,
      }}
    />
  );
}
