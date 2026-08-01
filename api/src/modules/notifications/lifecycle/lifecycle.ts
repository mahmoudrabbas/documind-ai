/**
 * Pure notification lifecycle state machine + versioning update rules.
 *
 * PURE LOGIC ONLY — no DB, no queue, no I/O of any kind. This module is
 * consumed by the service (T6) and the dispatch worker (T11); anything
 * touching persistence or the queue lives outside this file.
 *
 * State machine (mirrors the email message lifecycle pattern in
 * api/src/db/models/emailMessage.model.ts; the const-array enum style mirrors
 * JOB_STATES in workers/src/contracts/jobEnvelope.ts):
 *
 *   CREATED → QUEUED → DISPATCHED → VISIBLE → SEEN → READ → ARCHIVED | EXPIRED
 *                                                       ↕
 *   (VISIBLE → READ without SEEN is legal)
 *   any state → DELETED
 */

export const NOTIFICATION_LIFECYCLE_STATES = [
  "CREATED",
  "QUEUED",
  "DISPATCHED",
  "VISIBLE",
  "SEEN",
  "READ",
  "ARCHIVED",
  "EXPIRED",
  "DELETED",
] as const;
export type LifecycleState = (typeof NOTIFICATION_LIFECYCLE_STATES)[number];

/** Delivery outcome statuses: pending → delivered | failed. */
export const DELIVERY_STATES = ["pending", "delivered", "failed"] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

/**
 * Lifecycle events: the actions that drive transitions. Each event has a
 * legal `from` set defined in TRANSITIONS; applying one from any other state
 * throws IllegalLifecycleTransitionError.
 */
export const LIFECYCLE_EVENTS = [
  "enqueue",
  "dispatch",
  "deliver",
  "markSeen",
  "markRead",
  "archive",
  "expire",
  "delete",
] as const;
export type LifecycleEvent = (typeof LIFECYCLE_EVENTS)[number];

/** Thrown when a lifecycle event is applied from an illegal current state. */
export class IllegalLifecycleTransitionError extends Error {
  readonly current: LifecycleState;
  readonly event: LifecycleEvent;

  constructor(current: LifecycleState, event: LifecycleEvent) {
    super(`Illegal lifecycle transition: cannot apply "${event}" from "${current}"`);
    this.name = "IllegalLifecycleTransitionError";
    this.current = current;
    this.event = event;
  }
}

interface TransitionRule {
  from: readonly LifecycleState[];
  to: LifecycleState;
}

/** The transition table — data, not a switch (OCP). */
const TRANSITIONS: Record<LifecycleEvent, TransitionRule> = {
  // CREATED → QUEUED → DISPATCHED → VISIBLE → SEEN → READ
  enqueue: { from: ["CREATED"], to: "QUEUED" },
  dispatch: { from: ["QUEUED"], to: "DISPATCHED" },
  // VISIBLE requires prior DISPATCHED.
  deliver: { from: ["DISPATCHED"], to: "VISIBLE" },
  markSeen: { from: ["VISIBLE"], to: "SEEN" },
  // READ requires prior VISIBLE or SEEN (READ directly after VISIBLE is legal).
  markRead: { from: ["VISIBLE", "SEEN"], to: "READ" },
  // READ → ARCHIVED | EXPIRED
  archive: { from: ["READ"], to: "ARCHIVED" },
  expire: { from: ["READ"], to: "EXPIRED" },
  // Any state → DELETED (idempotent on DELETED itself).
  delete: { from: NOTIFICATION_LIFECYCLE_STATES, to: "DELETED" },
};

export function transitionLifecycle(
  current: LifecycleState,
  event: LifecycleEvent,
): LifecycleState {
  const rule = TRANSITIONS[event];
  if (!rule.from.includes(current)) {
    throw new IllegalLifecycleTransitionError(current, event);
  }
  return rule.to;
}

/**
 * Notification types. Defined here (no shared types file exists yet in
 * api/src/modules/notifications/); exported so later todos reuse this union
 * instead of re-declaring it.
 */
export const NOTIFICATION_TYPES = [
  "processing_failed",
  "processing_complete",
  "quota_exceeded",
  "knowledge_gap_created",
  "invitation_accepted",
  "welcome",
  "role_changed",
  "document_uploaded",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type UpdateRule = "replace" | "merge" | "ignore";

/**
 * Per-type versioning update rules — a data map, not a switch (OCP).
 * Round-9 trigger types (invitation_accepted, welcome, role_changed,
 * document_uploaded) are all `replace`: latest state wins.
 */
export const UPDATE_RULES: Record<NotificationType, UpdateRule> = {
  processing_failed: "replace",
  processing_complete: "replace",
  quota_exceeded: "merge",
  knowledge_gap_created: "merge",
  invitation_accepted: "replace",
  welcome: "replace",
  role_changed: "replace",
  document_uploaded: "replace",
};

/**
 * Minimal draft shape consumed by the update rules. Full drafting (localized
 * title/body, actions) lands in the T4 factory; the rules only need `version`
 * and `metadata` and pass every other field through unchanged.
 */
export interface NotificationDraft {
  version: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UpdateRuleResult {
  action: "update" | "ignore";
  next: NotificationDraft | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep-ish merge: plain objects merged recursively, everything else replaced. */
function deepMerge(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * Apply a per-type update rule when a duplicate notification arrives within
 * its dedup window. `replace` overwrites the draft with incoming content;
 * `merge` merges metadata (existing keys preserved, incoming keys win on
 * conflict, all other fields replace); `ignore` drops the update entirely.
 * Every `update` action increments the version by exactly one.
 */
export function applyUpdateRule(
  rule: UpdateRule,
  existing: NotificationDraft,
  incoming: NotificationDraft,
): UpdateRuleResult {
  if (rule === "ignore") {
    return { action: "ignore", next: null };
  }
  const next: NotificationDraft =
    rule === "merge"
      ? {
          ...incoming,
          metadata: deepMerge(existing.metadata ?? {}, incoming.metadata ?? {}),
          version: existing.version + 1,
        }
      : { ...incoming, version: existing.version + 1 };
  return { action: "update", next };
}
