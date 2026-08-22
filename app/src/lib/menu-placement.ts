/**
 * Viewport placement for a trigger-anchored dropdown menu.
 *
 * `NotificationActionMenu` renders its dropdown in a portal with
 * `position: fixed` because both of its call sites nest it inside clipping
 * ancestors: the bell's popover (`overflow-hidden`) and its scrolling list
 * (`overflow-y-auto`, which per the CSS overflow computed-value rule clips the
 * inline axis too), and the notifications page's `DashboardPanel padding="none"`
 * (`overflow-hidden`). An absolutely-positioned descendant cannot escape a
 * clipping ancestor and `z-index` has no effect on overflow clipping, so the
 * menu has to leave the subtree entirely and be positioned against the viewport.
 *
 * All coordinates are viewport-relative (client rects), matching the values a
 * `position: fixed` element consumes.
 */

export interface MenuRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface MenuSize {
  width: number;
  height: number;
}

export interface MenuViewport {
  width: number;
  height: number;
}

/** Which side of the trigger the menu was placed on. */
export type MenuSide = "below" | "above";

export interface MenuPlacement {
  /** Top-left of the menu box, viewport-relative and clamped. */
  top: number;
  left: number;
  side: MenuSide;
}

/** Gap between the trigger edge and the menu edge (was `mt-1.5`). */
export const MENU_OFFSET = 6;
/** Minimum clearance the menu keeps from the viewport edges. */
export const MENU_VIEWPORT_MARGIN = 8;

/**
 * Clamp into `[min, max]`. An oversized menu makes `max < min`; pin to `min` so
 * it stays anchored at the start edge instead of being pushed off-screen.
 */
function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Place a menu of `menu` size against `trigger`.
 *
 * Prefers below the trigger (what `top-full` did) and flips above only when
 * below would overflow the viewport *and* above actually has room — so a menu
 * taller than the viewport still opens downward and is clamped, rather than
 * being flipped off the top edge.
 *
 * Alignment is on the inline-end edge (what `end-0` did): the menu's end edge
 * lines up with the trigger's end edge, which is the right edge in LTR and the
 * left edge in RTL.
 */
export function computeMenuPlacement(
  trigger: MenuRect,
  menu: MenuSize,
  viewport: MenuViewport,
  dir: "ltr" | "rtl",
  offset: number = MENU_OFFSET,
  margin: number = MENU_VIEWPORT_MARGIN,
): MenuPlacement {
  const below = trigger.top + trigger.height + offset;
  const above = trigger.top - menu.height - offset;
  const overflowsBelow = below + menu.height > viewport.height - margin;
  const side: MenuSide = overflowsBelow && above >= margin ? "above" : "below";

  const rawTop = side === "above" ? above : below;
  const rawLeft =
    dir === "rtl" ? trigger.left : trigger.left + trigger.width - menu.width;

  return {
    top: clamp(rawTop, margin, viewport.height - menu.height - margin),
    left: clamp(rawLeft, margin, viewport.width - menu.width - margin),
    side,
  };
}
