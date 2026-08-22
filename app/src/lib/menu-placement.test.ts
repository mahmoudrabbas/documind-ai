import { describe, it, expect } from "vitest";

import {
  computeMenuPlacement,
  MENU_OFFSET,
  MENU_VIEWPORT_MARGIN,
} from "./menu-placement";

const VIEWPORT = { width: 1000, height: 800 };
const MENU = { width: 176, height: 100 };

describe("computeMenuPlacement", () => {
  it("opens below the trigger and aligns the end edges in LTR", () => {
    const trigger = { top: 200, left: 500, width: 32, height: 32 };
    const placement = computeMenuPlacement(trigger, MENU, VIEWPORT, "ltr");

    expect(placement.side).toBe("below");
    expect(placement.top).toBe(200 + 32 + MENU_OFFSET);
    // End edge in LTR is the right edge: 500 + 32 - 176.
    expect(placement.left).toBe(356);
  });

  it("aligns the end edges from the other side in RTL", () => {
    const trigger = { top: 200, left: 500, width: 32, height: 32 };
    const placement = computeMenuPlacement(trigger, MENU, VIEWPORT, "rtl");

    expect(placement.side).toBe("below");
    expect(placement.left).toBe(500);
  });

  it("flips above the trigger when opening below would overflow the viewport", () => {
    // Bottom of a scrolled list: below needs 800 - 760 - 32 - 6 = far less than
    // the menu height, while above has 760 - 100 - 6 = 654px of room.
    const trigger = { top: 760, left: 500, width: 32, height: 32 };
    const placement = computeMenuPlacement(trigger, MENU, VIEWPORT, "ltr");

    expect(placement.side).toBe("above");
    expect(placement.top).toBe(760 - 100 - MENU_OFFSET);
  });

  it("stays below and clamps when neither side has room", () => {
    // A menu taller than the viewport must not be flipped off the top edge.
    const tall = { width: 176, height: 900 };
    const trigger = { top: 400, left: 500, width: 32, height: 32 };
    const placement = computeMenuPlacement(trigger, tall, VIEWPORT, "ltr");

    expect(placement.side).toBe("below");
    expect(placement.top).toBe(MENU_VIEWPORT_MARGIN);
  });

  it("keeps the menu inside the viewport when the trigger sits near an edge", () => {
    const nearStart = { top: 200, left: 4, width: 32, height: 32 };
    const startPlacement = computeMenuPlacement(
      nearStart,
      MENU,
      VIEWPORT,
      "ltr",
    );
    expect(startPlacement.left).toBe(MENU_VIEWPORT_MARGIN);

    const nearEnd = { top: 200, left: 980, width: 32, height: 32 };
    const endPlacement = computeMenuPlacement(nearEnd, MENU, VIEWPORT, "rtl");
    expect(endPlacement.left).toBe(
      VIEWPORT.width - MENU.width - MENU_VIEWPORT_MARGIN,
    );
  });
});
