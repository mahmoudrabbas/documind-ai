/**
 * Guide overlay geometry — pure, DOM-free helpers.
 *
 * Logical placement values (`top`/`bottom`/`start`/`end`/`auto`) are mapped to
 * physical CSS sides based on the document direction (`ltr`/`rtl`) so the
 * spotlight arrow and tooltip behave correctly in Arabic. All coordinates are
 * viewport-relative (client rects), matching the values consumed by a fixed
 * portal overlay.
 */

import type { GuidePlacement } from "./copilot-types";

export type PhysicalSide = "top" | "right" | "bottom" | "left";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const PLACEMENT_OFFSET = 12;

/** Logical → physical side for a given text direction. */
export function resolvePlacement(
  placement: GuidePlacement,
  dir: "ltr" | "rtl",
): PhysicalSide {
  switch (placement) {
    case "top":
      return "top";
    case "bottom":
      return "bottom";
    case "start":
      return dir === "rtl" ? "right" : "left";
    case "end":
      return dir === "rtl" ? "left" : "right";
    case "auto":
    default:
      // Auto defaults to the "end" side (right in LTR, left in RTL) — natural
      // for sidebar/nav targets; the overlay may flip if it does not fit.
      return dir === "rtl" ? "left" : "right";
  }
}

/** Clamp a rectangle fully inside the viewport (keeping its size). */
export function clampToViewport(rect: Rect, viewport: Viewport): Rect {
  const left = Math.max(
    0,
    Math.min(rect.left, Math.max(0, viewport.width - rect.width)),
  );
  const top = Math.max(
    0,
    Math.min(rect.top, Math.max(0, viewport.height - rect.height)),
  );
  return { ...rect, left, top };
}

export interface TooltipPlacement {
  /** Top-left position of the tooltip card (viewport-relative, clamped). */
  top: number;
  left: number;
  /** The tooltip side that sits against the target (arrow points at target). */
  side: PhysicalSide;
  /** Arrow tip position, relative to the target's outer edge. */
  anchor: { top: number; left: number };
}

/**
 * Compute where a tooltip card of `tooltip` size should sit relative to
 * `target`, clamped inside the viewport. `side` is the resolved physical side
 * (already RTL-aware via `resolvePlacement`). `offset` is the gap between the
 * target edge and the tooltip edge.
 */
export function computeTooltipPlacement(
  target: Rect,
  tooltip: Size,
  side: PhysicalSide,
  viewport: Viewport,
  offset: number = PLACEMENT_OFFSET,
): TooltipPlacement {
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;

  let top = 0;
  let left = 0;
  let anchor: { top: number; left: number };

  switch (side) {
    case "top":
      left = targetCenterX - tooltip.width / 2;
      top = target.top - tooltip.height - offset;
      anchor = { top: target.top, left: targetCenterX };
      break;
    case "bottom":
      left = targetCenterX - tooltip.width / 2;
      top = target.top + target.height + offset;
      anchor = { top: target.top + target.height, left: targetCenterX };
      break;
    case "left":
      left = target.left - tooltip.width - offset;
      top = targetCenterY - tooltip.height / 2;
      anchor = { top: targetCenterY, left: target.left };
      break;
    case "right":
      left = target.left + target.width + offset;
      top = targetCenterY - tooltip.height / 2;
      anchor = { top: targetCenterY, left: target.left + target.width };
      break;
  }

  const clamped = clampToViewport(
    { top, left, width: tooltip.width, height: tooltip.height },
    viewport,
  );

  return {
    top: clamped.top,
    left: clamped.left,
    side,
    anchor: {
      top: Math.max(0, Math.min(anchor.top, viewport.height)),
      left: Math.max(0, Math.min(anchor.left, viewport.width)),
    },
  };
}

/** Expand a target rect by `padding` for the spotlight box. */
export function expandRect(target: Rect, padding: number): Rect {
  return {
    top: target.top - padding,
    left: target.left - padding,
    width: target.width + padding * 2,
    height: target.height + padding * 2,
  };
}

/** A rect with zero width/height (target hidden or missing). */
export function isZeroArea(rect: Rect): boolean {
  return rect.width <= 0 || rect.height <= 0;
}
