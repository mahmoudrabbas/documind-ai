import { describe, it, expect } from "vitest";
import {
  clampToViewport,
  computeTooltipPlacement,
  expandRect,
  isZeroArea,
  rectsOverlap,
  resolveGuideTooltipPosition,
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

  it("falls back to the right side instead of clamping a left tooltip over the target", () => {
    const tip = computeTooltipPlacement(
      target,
      { width: 200, height: 60 },
      "left",
      viewport,
    );
    // raw left = 200 - 200 - 12 = -12 → overflows the left edge → rejected; the
    // right side fits and does not cover the target.
    expect(tip.side).toBe("right");
    expect(tip.left).toBe(200 + 200 + 12);
    expect(tip.top).toBe(100 + 25 - 30);
    expect(tip.left).toBeGreaterThanOrEqual(0);
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

describe("collision-aware placement (regression: roles-create-button)", () => {
  const desktop = { width: 1366, height: 768 };

  it("Test 1 — keeps the preferred top placement when the target has room above", () => {
    const tip = computeTooltipPlacement(
      { top: 240, left: 400, width: 120, height: 40 },
      { width: 320, height: 200 },
      "top",
      desktop,
    );
    expect(tip.side).toBe("top");
    expect(tip.top).toBe(240 - 200 - 12);
    // tooltip bottom stays above the target top (12px gap).
    expect(tip.top + 200).toBeLessThan(240);
  });

  it("Test 2 — top-right target: preferred top is rejected and a safe side is chosen", () => {
    const target: Rect = { top: 210, left: 1210, width: 120, height: 40 };
    const tip = computeTooltipPlacement(
      target,
      { width: 320, height: 220 },
      "top",
      desktop,
    );
    // raw top = 210 - 220 - 12 < 8 → would overflow; must not be clamped on top.
    expect(tip.side).not.toBe("top");
    // inside the viewport with the margin.
    expect(tip.left).toBeGreaterThanOrEqual(8);
    expect(tip.top).toBeGreaterThanOrEqual(8);
    expect(tip.left + 320).toBeLessThanOrEqual(desktop.width - 8);
    expect(tip.top + 220).toBeLessThanOrEqual(desktop.height - 8);
    // the tooltip must not cover the target.
    expect(
      rectsOverlap({ top: tip.top, left: tip.left, width: 320, height: 220 }, target),
    ).toBe(false);
  });

  it("Test 3 — bottom edge: preferred bottom falls back when there is no room below", () => {
    const target: Rect = { top: 720, left: 600, width: 100, height: 40 };
    const tip = computeTooltipPlacement(
      target,
      { width: 300, height: 180 },
      "bottom",
      desktop,
    );
    expect(tip.side).not.toBe("bottom");
    expect(tip.top).toBeGreaterThanOrEqual(8);
    expect(tip.top + 180).toBeLessThanOrEqual(desktop.height - 8);
    expect(
      rectsOverlap({ top: tip.top, left: tip.left, width: 300, height: 180 }, target),
    ).toBe(false);
  });

  it("Test 4 — left edge: preferred left falls back to the right", () => {
    const target: Rect = { top: 300, left: 0, width: 60, height: 40 };
    const tip = computeTooltipPlacement(
      target,
      { width: 300, height: 160 },
      "left",
      desktop,
    );
    expect(tip.side).toBe("right");
    expect(tip.left).toBeGreaterThanOrEqual(8);
    expect(tip.left + 300).toBeLessThanOrEqual(desktop.width - 8);
    expect(
      rectsOverlap({ top: tip.top, left: tip.left, width: 300, height: 160 }, target),
    ).toBe(false);
  });

  it("Test 4 — right edge: preferred right falls back to the left", () => {
    const target: Rect = { top: 300, left: 1306, width: 60, height: 40 };
    const tip = computeTooltipPlacement(
      target,
      { width: 300, height: 160 },
      "right",
      desktop,
    );
    expect(tip.side).toBe("left");
    expect(tip.left).toBeGreaterThanOrEqual(8);
    expect(tip.left + 300).toBeLessThanOrEqual(desktop.width - 8);
    expect(
      rectsOverlap({ top: tip.top, left: tip.left, width: 300, height: 160 }, target),
    ).toBe(false);
  });

  it("Test 5 — auto keeps the end side when it has the most room", () => {
    const tip = resolveGuideTooltipPosition(
      { top: 600, left: 533, width: 120, height: 40 },
      { width: 300, height: 160 },
      "auto",
      "ltr",
      desktop,
    );
    expect(tip.side).toBe("right");
    expect(tip.left).toBeGreaterThanOrEqual(8);
    expect(tip.top).toBeGreaterThanOrEqual(8);
    expect(tip.left + 300).toBeLessThanOrEqual(desktop.width - 8);
    expect(tip.top + 160).toBeLessThanOrEqual(desktop.height - 8);
    expect(
      rectsOverlap({ top: tip.top, left: tip.left, width: 300, height: 160 }, {
        top: 600,
        left: 533,
        width: 120,
        height: 40,
      }),
    ).toBe(false);
  });

  it("Test 5 — auto picks the side with the most room over the end default", () => {
    const tip = resolveGuideTooltipPosition(
      { top: 300, left: 1100, width: 60, height: 40 },
      { width: 120, height: 140 },
      "auto",
      "ltr",
      desktop,
    );
    // right is valid but has little room; left has far more space.
    expect(tip.side).toBe("left");
    expect(
      rectsOverlap({ top: tip.top, left: tip.left, width: 120, height: 140 }, {
        top: 300,
        left: 1100,
        width: 60,
        height: 40,
      }),
    ).toBe(false);
  });

  it("Test 6 — RTL 'end' (physical left) falls back safely near the left edge", () => {
    const target: Rect = { top: 300, left: 20, width: 60, height: 40 };
    const tip = resolveGuideTooltipPosition(
      target,
      { width: 300, height: 160 },
      "end",
      "rtl",
      desktop,
    );
    expect(tip.side).not.toBe("left");
    expect(tip.left).toBeGreaterThanOrEqual(8);
    expect(tip.left + 300).toBeLessThanOrEqual(desktop.width - 8);
    expect(
      rectsOverlap({ top: tip.top, left: tip.left, width: 300, height: 160 }, target),
    ).toBe(false);
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
