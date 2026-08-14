import { describe, it, expect } from "vitest";
import {
  clampToViewport,
  computeTooltipPlacement,
  expandRect,
  isZeroArea,
  resolvePlacement,
  type Rect,
} from "@/lib/copilot/placement";

const viewport = { width: 1000, height: 800 };

describe("resolvePlacement (logical → physical, RTL-aware)", () => {
  it("keeps top/bottom physical in both directions", () => {
    expect(resolvePlacement("top", "ltr")).toBe("top");
    expect(resolvePlacement("top", "rtl")).toBe("top");
    expect(resolvePlacement("bottom", "ltr")).toBe("bottom");
    expect(resolvePlacement("bottom", "rtl")).toBe("bottom");
  });

  it("maps start/end by direction", () => {
    expect(resolvePlacement("start", "ltr")).toBe("left");
    expect(resolvePlacement("start", "rtl")).toBe("right");
    expect(resolvePlacement("end", "ltr")).toBe("right");
    expect(resolvePlacement("end", "rtl")).toBe("left");
  });

  it("defaults auto to the end side per direction", () => {
    expect(resolvePlacement("auto", "ltr")).toBe("right");
    expect(resolvePlacement("auto", "rtl")).toBe("left");
  });
});

describe("computeTooltipPlacement", () => {
  const target: Rect = { top: 100, left: 200, width: 200, height: 50 };

  it("places a top tooltip above the target with the anchor at the target top edge", () => {
    const tip = computeTooltipPlacement(
      target,
      { width: 300, height: 80 },
      "top",
      viewport,
    );
    expect(tip.side).toBe("top");
    expect(tip.top).toBe(100 - 80 - 12);
    expect(tip.left).toBe(200 + 100 - 150);
    expect(tip.anchor).toEqual({ top: 100, left: 300 });
  });

  it("places a bottom tooltip below the target", () => {
    const tip = computeTooltipPlacement(
      target,
      { width: 300, height: 80 },
      "bottom",
      viewport,
    );
    expect(tip.top).toBe(100 + 50 + 12);
    expect(tip.anchor).toEqual({ top: 150, left: 300 });
  });

  it("places a right tooltip to the right of the target", () => {
    const tip = computeTooltipPlacement(
      target,
      { width: 200, height: 60 },
      "right",
      viewport,
    );
    expect(tip.left).toBe(200 + 200 + 12);
    expect(tip.top).toBe(100 + 25 - 30);
    expect(tip.anchor).toEqual({ top: 125, left: 400 });
  });

  it("places a left tooltip to the left of the target (unclamped when space allows)", () => {
    const rightTarget: Rect = { top: 100, left: 600, width: 100, height: 50 };
    const tip = computeTooltipPlacement(
      rightTarget,
      { width: 200, height: 60 },
      "left",
      viewport,
    );
    expect(tip.left).toBe(600 - 200 - 12);
    expect(tip.anchor).toEqual({ top: 125, left: 600 });
  });

  it("clamps a left tooltip that would overflow the left edge", () => {
    const tip = computeTooltipPlacement(
      target,
      { width: 200, height: 60 },
      "left",
      viewport,
    );
    expect(tip.left).toBe(0);
    expect(tip.left + 200).toBeLessThanOrEqual(viewport.width);
  });

  it("clamps into the viewport when the target is near the edge", () => {
    const nearEdge: Rect = { top: 4, left: 0, width: 40, height: 20 };
    const tip = computeTooltipPlacement(
      nearEdge,
      { width: 300, height: 80 },
      "top",
      viewport,
    );
    expect(tip.left).toBeGreaterThanOrEqual(0);
    expect(tip.left + 300).toBeLessThanOrEqual(viewport.width);
    expect(tip.top).toBeGreaterThanOrEqual(0);
  });

  it("clamps a bottom tooltip taller than the remaining space", () => {
    const lowTarget: Rect = { top: 790, left: 500, width: 40, height: 10 };
    const tip = computeTooltipPlacement(
      lowTarget,
      { width: 300, height: 80 },
      "bottom",
      viewport,
    );
    expect(tip.top).toBeGreaterThanOrEqual(0);
    expect(tip.top + 80).toBeLessThanOrEqual(viewport.height);
  });
});

describe("clampToViewport / expandRect / isZeroArea", () => {
  it("clamps overflowing rects", () => {
    const clamped = clampToViewport(
      { top: -10, left: -5, width: 100, height: 50 },
      viewport,
    );
    expect(clamped.top).toBe(0);
    expect(clamped.left).toBe(0);
  });

  it("clamps oversized rects to origin", () => {
    const clamped = clampToViewport(
      { top: 10, left: 10, width: 5000, height: 5000 },
      viewport,
    );
    expect(clamped.left).toBe(0);
    expect(clamped.top).toBe(0);
  });

  it("expands rects by a symmetric padding", () => {
    const rect = expandRect({ top: 10, left: 20, width: 30, height: 40 }, 8);
    expect(rect).toEqual({ top: 2, left: 12, width: 46, height: 56 });
  });

  it("detects zero-area rects", () => {
    expect(isZeroArea({ top: 0, left: 0, width: 0, height: 100 })).toBe(true);
    expect(isZeroArea({ top: 0, left: 0, width: 100, height: 0 })).toBe(true);
    expect(isZeroArea({ top: 0, left: 0, width: 10, height: 10 })).toBe(false);
  });
});
