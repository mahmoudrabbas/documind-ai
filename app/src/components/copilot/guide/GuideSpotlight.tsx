"use client";

import type { Rect } from "@/lib/copilot/placement";
import { expandRect } from "@/lib/copilot/placement";

const SPOTLIGHT_PADDING = 8;

/**
 * Spotlight box rendered inside the fixed overlay. A huge box-shadow with a
 * transparent center punches a "hole" around the target rect while dimming the
 * rest of the page. Pure presentational component; pointer events pass through.
 */
export function GuideSpotlight({ rect }: { rect: Rect }) {
  const box = expandRect(rect, SPOTLIGHT_PADDING);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed"
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        boxShadow:
          "0 0 0 9999px rgba(0, 0, 0, 0.55), 0 0 0 2px var(--color-primary, #1d4ed8), 0 0 0 4px rgba(255, 255, 255, 0.9)",
        borderRadius: 12,
        transition:
          "top 160ms ease, left 160ms ease, width 160ms ease, height 160ms ease",
        zIndex: 82,
      }}
    />
  );
}
