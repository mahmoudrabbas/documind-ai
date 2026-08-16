/**
 * Guide overlay geometry — pure, DOM-free helpers.
 *
 * Logical placement values (`top`/`bottom`/`start`/`end`/`auto`) are mapped to
 * physical CSS sides based on the document direction (`ltr`/`rtl`) so the
 * spotlight arrow and tooltip behave correctly in Arabic. All coordinates are
 * viewport-relative (client rects), matching the values consumed by a fixed
 * portal overlay.
 *
 * Tooltip placement is collision-aware: the step's requested side is a
 * *preferred* placement, not an unconditional one. Candidates are evaluated in
 * a deterministic fallback order and the first side that both fits inside the
 * viewport (keeping a margin) and does not intersect the target rect is chosen.
 * A candidate is never clamped *onto* the target — clamping only happens as a
 * last resort when no side can fit the viewport at all (e.g. an oversized
 * tooltip).
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

/** Gap between the target edge and the tooltip edge. */
export const PLACEMENT_OFFSET = 12;
/** Minimum distance a tooltip must keep from a viewport edge. */
export const VIEWPORT_MARGIN = 8;

export interface TooltipPlacementOptions {
  /** Gap between the target edge and the tooltip edge. */
  offset?: number;
  /** Minimum clearance from the viewport edges. */
  margin?: number;
}

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

/** True when two rects share any interior point. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

interface RawPlacement {
  top: number;
  left: number;
  anchor: { top: number; left: number };
}

/** Unclamped tooltip top-left + arrow anchor for a single side. */
function placeOnSide(
  target: Rect,
  tooltip: Size,
  side: PhysicalSide,
  offset: number,
): RawPlacement {
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;

  switch (side) {
    case "top":
      return {
        top: target.top - tooltip.height - offset,
        left: targetCenterX - tooltip.width / 2,
        anchor: { top: target.top, left: targetCenterX },
      };
    case "bottom":
      return {
        top: target.top + target.height + offset,
        left: targetCenterX - tooltip.width / 2,
        anchor: { top: target.top + target.height, left: targetCenterX },
      };
    case "left":
      return {
        top: targetCenterY - tooltip.height / 2,
        left: target.left - tooltip.width - offset,
        anchor: { top: targetCenterY, left: target.left },
      };
    case "right":
      return {
        top: targetCenterY - tooltip.height / 2,
        left: target.left + target.width + offset,
        anchor: { top: targetCenterY, left: target.left + target.width },
      };
  }
}

/** True when a rect sits fully inside the viewport with `margin` clearance. */
function fitsViewport(rect: Rect, viewport: Viewport, margin: number): boolean {
  return (
    rect.left >= margin &&
    rect.top >= margin &&
    rect.left + rect.width <= viewport.width - margin &&
    rect.top + rect.height <= viewport.height - margin
  );
}

/** Free space between the target edge and the viewport edge on `side`. */
function availableSpaceOnSide(
  target: Rect,
  side: PhysicalSide,
  viewport: Viewport,
  offset: number,
): number {
  switch (side) {
    case "top":
      return Math.max(0, target.top - offset);
    case "bottom":
      return Math.max(0, viewport.height - (target.top + target.height) - offset);
    case "left":
      return Math.max(0, target.left - offset);
    case "right":
      return Math.max(0, viewport.width - (target.left + target.width) - offset);
  }
}

function clampAnchor(
  anchor: { top: number; left: number },
  viewport: Viewport,
): { top: number; left: number } {
  return {
    top: Math.max(0, Math.min(anchor.top, viewport.height)),
    left: Math.max(0, Math.min(anchor.left, viewport.width)),
  };
}

/** Preferred side → deterministic fallback order. */
const FALLBACK_ORDER: Record<PhysicalSide, readonly PhysicalSide[]> = {
  top: ["top", "bottom", "left", "right"],
  bottom: ["bottom", "top", "left", "right"],
  left: ["left", "right", "top", "bottom"],
  right: ["right", "left", "top", "bottom"],
};

/**
 * Collision-aware placement for a preferred physical side: walk the fallback
 * order and return the first candidate that stays inside the viewport and does
 * not intersect the target. If no side qualifies, keep the candidate with the
 * most free space on its side and clamp it into the viewport as a last resort.
 */
function selectPlacement(
  target: Rect,
  tooltip: Size,
  viewport: Viewport,
  side: PhysicalSide,
  options: TooltipPlacementOptions,
): TooltipPlacement {
  const offset = options.offset ?? PLACEMENT_OFFSET;
  const margin = options.margin ?? VIEWPORT_MARGIN;
  const candidates = FALLBACK_ORDER[side] ?? [side, "bottom", "left", "right"];

  let fallback: TooltipPlacement | null = null;
  let fallbackSpace = -Infinity;

  for (const candidateSide of candidates) {
    const raw = placeOnSide(target, tooltip, candidateSide, offset);
    const rect = {
      top: raw.top,
      left: raw.left,
      width: tooltip.width,
      height: tooltip.height,
    };
    if (fitsViewport(rect, viewport, margin) && !rectsOverlap(rect, target)) {
      return {
        top: rect.top,
        left: rect.left,
        side: candidateSide,
        anchor: clampAnchor(raw.anchor, viewport),
      };
    }
    const space = availableSpaceOnSide(target, candidateSide, viewport, offset);
    if (space > fallbackSpace) {
      fallbackSpace = space;
      fallback = {
        top: rect.top,
        left: rect.left,
        side: candidateSide,
        anchor: clampAnchor(raw.anchor, viewport),
      };
    }
  }

  if (!fallback) {
    const raw = placeOnSide(target, tooltip, side, offset);
    fallback = {
      top: raw.top,
      left: raw.left,
      side,
      anchor: clampAnchor(raw.anchor, viewport),
    };
  }
  const clamped = clampToViewport(
    { top: fallback.top, left: fallback.left, width: tooltip.width, height: tooltip.height },
    viewport,
  );
  return {
    top: clamped.top,
    left: clamped.left,
    side: fallback.side,
    anchor: fallback.anchor,
  };
}

/**
 * Compute where a tooltip card of `tooltip` size should sit relative to
 * `target`. `side` is the resolved physical side (already RTL-aware via
 * `resolvePlacement`). Collision-aware: falls back to adjacent sides when the
 * preferred side would overflow the viewport or cover the target.
 */
export function computeTooltipPlacement(
  target: Rect,
  tooltip: Size,
  side: PhysicalSide,
  viewport: Viewport,
  offset: number = PLACEMENT_OFFSET,
  margin: number = VIEWPORT_MARGIN,
): TooltipPlacement {
  return selectPlacement(target, tooltip, viewport, side, { offset, margin });
}

/**
 * Deterministic order used for space-based `auto` selection (ties → earlier).
 * The end side is first so `auto` stays natural for LTR/RTL nav targets.
 */
const AUTO_ORDER: readonly PhysicalSide[] = ["right", "left", "bottom", "top"];

/**
 * Space-based placement for `auto`: among the sides that fit the viewport and
 * avoid the target, pick the one with the most free space on its side. Falls
 * back to the best-fitting side when nothing fits cleanly.
 */
function selectAutoPlacement(
  target: Rect,
  tooltip: Size,
  viewport: Viewport,
  options: TooltipPlacementOptions,
): TooltipPlacement {
  const offset = options.offset ?? PLACEMENT_OFFSET;
  const margin = options.margin ?? VIEWPORT_MARGIN;

  let best: TooltipPlacement | null = null;
  let bestSpace = -Infinity;
  let fallback: TooltipPlacement | null = null;
  let fallbackSpace = -Infinity;

  for (const side of AUTO_ORDER) {
    const raw = placeOnSide(target, tooltip, side, offset);
    const rect = {
      top: raw.top,
      left: raw.left,
      width: tooltip.width,
      height: tooltip.height,
    };
    const space = availableSpaceOnSide(target, side, viewport, offset);
    const valid = fitsViewport(rect, viewport, margin) && !rectsOverlap(rect, target);
    if (valid && space > bestSpace) {
      bestSpace = space;
      best = {
        top: rect.top,
        left: rect.left,
        side,
        anchor: clampAnchor(raw.anchor, viewport),
      };
    }
    if (space > fallbackSpace) {
      fallbackSpace = space;
      fallback = {
        top: rect.top,
        left: rect.left,
        side,
        anchor: clampAnchor(raw.anchor, viewport),
      };
    }
  }

  if (best) return best;
  if (fallback) {
    const clamped = clampToViewport(
      { top: fallback.top, left: fallback.left, width: tooltip.width, height: tooltip.height },
      viewport,
    );
    return { ...fallback, top: clamped.top, left: clamped.left };
  }
  return selectPlacement(target, tooltip, viewport, "right", options);
}

/**
 * Collision-aware tooltip placement for a logical guide placement.
 * `top`/`bottom`/`start`/`end` resolve to a physical preferred side and fall
 * back through a deterministic order; `auto` picks the side with the most free
 * viewport space among those that fit without overlapping the target.
 */
export function resolveGuideTooltipPosition(
  target: Rect,
  tooltip: Size,
  placement: GuidePlacement,
  dir: "ltr" | "rtl",
  viewport: Viewport,
  options: TooltipPlacementOptions = {},
): TooltipPlacement {
  if (placement === "auto") {
    return selectAutoPlacement(target, tooltip, viewport, options);
  }
  return selectPlacement(
    target,
    tooltip,
    viewport,
    resolvePlacement(placement, dir),
    options,
  );
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