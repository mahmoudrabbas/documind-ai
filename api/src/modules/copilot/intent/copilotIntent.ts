import type { PlanMode } from "../copilot.types.js";

export type ModeInput = "guide" | "action" | "auto";

export interface IntentResolution {
  mode: PlanMode;
  source: "explicit" | "auto";
}

const GUIDE_SIGNALS: RegExp[] = [
  /\bhow\s+(do|to|can|should)\b/i,
  /\bshow\s+me\s+(how|the steps)\b/i,
  /\bguide\s+me\b/i,
  /\bwalk\s+me\s+through\b/i,
  /\bstep[- ]by[- ]step\b/i,
  /\bteach\s+me\b/i,
  /\bhelp\s+me\s+(understand|learn|do)\b/i,
  /\b(?:quick\s+)?(?:demo|tutorial|walkthrough)\b/i,
  /كيف/,
  /أرشدني/,
  /علمني/,
  /خطوة\s+بخطوة/,
  /اشرح\s+لي/,
  /دلني/,
];

/**
 * Resolves the execution mode for a copilot request. An explicit mode from the
 * caller wins. Otherwise the query is classified deterministically: coaching
 * phrasing (how-to / walk-me-through) maps to guide mode; everything else
 * defaults to action mode.
 */
export function detectIntentMode(input: {
  query: string;
  mode?: ModeInput;
}): IntentResolution {
  if (input.mode === "guide" || input.mode === "action") {
    return { mode: input.mode, source: "explicit" };
  }

  const query = input.query.trim();
  const isGuide = GUIDE_SIGNALS.some((signal) => signal.test(query));
  return { mode: isGuide ? "guide" : "action", source: "auto" };
}
