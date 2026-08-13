/**
 * Behavioral guide triggers: map "stuck" UI situations to a matching guide
 * flow so the launcher can proactively offer help (e.g. a document search
 * with zero results → "How to search documents").
 *
 * The pure core (`evaluateTrigger`) is framework-free for unit tests; the
 * module singleton keeps per-session fire/dismiss state and fans suggestions
 * out to subscribers.
 */

export type GuideTriggerEvent =
  | "documents.search_zero_results"
  | "documents.upload_failed";

export interface GuideTriggerRule {
  event: GuideTriggerEvent;
  flowId: string;
  /** How long the suggestion stays visible before auto-hiding. */
  cooldownMs: number;
  /** Fire at most once per browser session. */
  oncePerSession: boolean;
}

export interface GuideTriggerState {
  fired: GuideTriggerEvent[];
  dismissed: GuideTriggerEvent[];
  lastEmittedAt: Partial<Record<GuideTriggerEvent, number>>;
}

export interface GuideSuggestion {
  event: GuideTriggerEvent;
  flowId: string;
}

export const GUIDE_TRIGGER_RULES: readonly GuideTriggerRule[] = [
  {
    event: "documents.search_zero_results",
    flowId: "documents.search",
    cooldownMs: 12_000,
    oncePerSession: true,
  },
  {
    event: "documents.upload_failed",
    flowId: "documents.upload",
    cooldownMs: 12_000,
    oncePerSession: true,
  },
];

export function getTriggerRule(
  event: GuideTriggerEvent,
): GuideTriggerRule | undefined {
  return GUIDE_TRIGGER_RULES.find((rule) => rule.event === event);
}

export function createInitialTriggerState(): GuideTriggerState {
  return { fired: [], dismissed: [], lastEmittedAt: {} };
}

export function dismissTrigger(
  state: GuideTriggerState,
  event: GuideTriggerEvent,
): GuideTriggerState {
  if (state.dismissed.includes(event)) return state;
  return { ...state, dismissed: [...state.dismissed, event] };
}

export function evaluateTrigger(
  state: GuideTriggerState,
  event: GuideTriggerEvent,
  now: number,
): { state: GuideTriggerState; suggestion: GuideSuggestion | null } {
  const rule = getTriggerRule(event);
  if (!rule) return { state, suggestion: null };
  if (state.dismissed.includes(event)) return { state, suggestion: null };
  if (rule.oncePerSession && state.fired.includes(event)) {
    return { state, suggestion: null };
  }
  const last = state.lastEmittedAt[event];
  if (
    rule.cooldownMs > 0 &&
    last !== undefined &&
    now - last < rule.cooldownMs
  ) {
    return { state, suggestion: null };
  }
  return {
    state: {
      ...state,
      fired: [...state.fired, event],
      lastEmittedAt: { ...state.lastEmittedAt, [event]: now },
    },
    suggestion: { event, flowId: rule.flowId },
  };
}

type TriggerListener = (suggestion: GuideSuggestion) => void;

let listeners = new Set<TriggerListener>();
let sessionState = createInitialTriggerState();

export function subscribeGuideTriggers(listener: TriggerListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitGuideTrigger(event: GuideTriggerEvent): void {
  const result = evaluateTrigger(sessionState, event, Date.now());
  sessionState = result.state;
  if (result.suggestion) {
    for (const listener of listeners) listener(result.suggestion);
  }
}

export function dismissGuideTrigger(event: GuideTriggerEvent): void {
  sessionState = dismissTrigger(sessionState, event);
}

export function resetGuideTriggers(): void {
  sessionState = createInitialTriggerState();
  listeners = new Set<TriggerListener>();
}