/**
 * Shared notification dedup contract (T5) — pure + portable.
 *
 * Lives in workers/src/contracts/ so BOTH workspaces compute the IDENTICAL
 * key: the API service (T6) and the worker trigger producers (T9/T18/T25) all
 * import this module through the "workers/contracts" barrel. NO api imports,
 * NO DB, NO I/O of any kind — the service (T6) performs the lookup using the
 * query builder below.
 *
 * TWO DISTINCT IDS (review round 3) — do not conflate:
 *   (a) dedupEventId — the BUSINESS entity id embedded in the dedupKey (e.g.
 *       documentId for processing_failed). Stable per business entity; a
 *       document re-failing within the window version++s instead of
 *       duplicating.
 *   (b) OUTBOX occurrence id — the per-occurrence outbox eventId
 *       (`${jobIdempotencyKey}:${stage}`, T10). Not this module's concern.
 *
 * Dedup model (review round 4 #5):
 *   - buildNotificationDedupKey produces the BUCKETED key used ONLY as the DB
 *     unique-index guard for same-bucket concurrent inserts (E11000 → re-read
 *     + update). It is NOT the primary dedup mechanism.
 *   - buildDedupRangeQuery is the PRIMARY gate: a SLIDING-window range query
 *     over dedupEventId + deduplicatedAt. Two genuinely-duplicate events 1s
 *     apart straddling a bucket edge land in different buckets under the old
 *     bucketed-key lookup and would both produce notifications; the range
 *     query catches the straddle.
 *   - resolveDedup decides, for the doc the range query found, whether the
 *     incoming event updates/ignores it (within window) or is 'expired'
 *     (outside window → a new doc is allowed).
 */

import type { NotificationType } from "./notificationTransport.js";

/** Per-type dedup window in hours. knowledge_gap_created and welcome use a
 *  168h (7-day) window; every other type dedups across 24h. */
export const DEDUP_WINDOW_HOURS: Record<NotificationType, number> = {
  processing_failed: 24,
  processing_complete: 24,
  quota_exceeded: 24,
  knowledge_gap_created: 168,
  invitation_accepted: 24,
  welcome: 168,
  role_changed: 24,
  document_uploaded: 24,
};

const HOUR_MS = 3600e3;

/**
 * Bucketed dedup key: `${type}:${dedupEventId}:${bucket}`. The bucket is the
 * epoch window (`Math.floor(now / (windowHours * 3600e3))`), so the key is
 * stable within a window and rotates at each boundary. Used ONLY as the DB
 * unique-index guard for same-bucket concurrent inserts — NOT the primary
 * dedup gate (that is buildDedupRangeQuery).
 */
export function buildNotificationDedupKey(
  type: NotificationType,
  dedupEventId: string,
  now: Date = new Date(),
  windowHours: number = 24,
): string {
  const bucket = Math.floor(now.getTime() / (windowHours * HOUR_MS));
  return `${type}:${dedupEventId}:${bucket}`;
}

/**
 * The PRIMARY dedup gate: a SLIDING-window range query over
 * `{tenantId, userId, type, dedupEventId, deduplicatedAt: {$gt: now - windowHours}}`
 * ordered by deduplicatedAt desc, limit 1. Fixes the fixed-bucket boundary
 * hole: two duplicate events straddling a bucket edge land in different
 * buckets (the bucketed key would not catch them), but the $gt window over
 * deduplicatedAt still finds the first. `TId` is generic so both string ids
 * (workers raw driver) and mongoose ObjectIds (api repository) pass through
 * without importing mongoose into this pure module.
 */
export interface DedupRangeQuery<TId> {
  filter: {
    tenantId: TId;
    userId: TId;
    type: NotificationType;
    dedupEventId: string;
    deduplicatedAt: { $gt: Date };
  };
  sort: { deduplicatedAt: -1 };
  limit: 1;
}

export interface DedupRangeQueryInput<TId> {
  tenantId: TId;
  userId: TId;
  type: NotificationType;
  dedupEventId: string;
  now: Date;
  windowHours: number;
}

export function buildDedupRangeQuery<TId>(
  input: DedupRangeQueryInput<TId>,
): DedupRangeQuery<TId> {
  const cutoff = new Date(input.now.getTime() - input.windowHours * HOUR_MS);
  return {
    filter: {
      tenantId: input.tenantId,
      userId: input.userId,
      type: input.type,
      dedupEventId: input.dedupEventId,
      deduplicatedAt: { $gt: cutoff },
    },
    sort: { deduplicatedAt: -1 },
    limit: 1,
  };
}

export type UpdateRule = "replace" | "merge" | "ignore";

/** Minimal draft shape the update rules understand — a mirror of the T3
 *  NotificationDraft in api/src/modules/notifications/lifecycle/lifecycle.ts. */
export interface DedupDraft {
  version: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DedupUpdateResult {
  action: "update" | "ignore";
  next: DedupDraft | null;
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
 * LOCAL PURE MIRROR of lifecycle.applyUpdateRule (T3). The real one lives in
 * api/src/modules/notifications/lifecycle/lifecycle.ts, which workers MUST NOT
 * import (guardrail 16: no api modules in workers). Semantics are identical:
 * `replace` overwrites with incoming content + version++, `merge` deep-merges
 * metadata (existing keys preserved, incoming keys win on conflict, all other
 * fields replace) + version++, `ignore` drops the update. T6 wires the REAL
 * lifecycle.applyUpdateRule at the service layer; this mirror exists only so
 * the shared contract can express the same 'replace'|'merge'|'ignore' decision
 * portably for worker-side callers (T9/T18/T25).
 */
export function applyDedupUpdateRule(
  rule: UpdateRule,
  existing: DedupDraft,
  incoming: DedupDraft,
): DedupUpdateResult {
  if (rule === "ignore") {
    return { action: "ignore", next: null };
  }
  const next: DedupDraft =
    rule === "merge"
      ? {
          ...incoming,
          metadata: deepMerge(existing.metadata ?? {}, incoming.metadata ?? {}),
          version: existing.version + 1,
        }
      : { ...incoming, version: existing.version + 1 };
  return { action: "update", next };
}

/** The existing doc the service's range lookup found (null when none). */
export interface DedupExistingDoc extends DedupDraft {
  deduplicatedAt?: Date | string | number | null;
}

export interface ResolveDedupWindow {
  /** Defaults to `new Date()`. */
  now?: Date;
  /** Defaults to 24; pass DEDUP_WINDOW_HOURS[type] for non-24h types. */
  windowHours?: number;
}

export interface DedupResolution {
  /** 'update'/'ignore' per rule (within window); 'expired' → new doc allowed. */
  action: "update" | "ignore" | "expired";
  next: DedupDraft | null;
}

/**
 * Window resolution — pure, no DB. No existing doc OR an existing doc whose
 * deduplicatedAt is outside the sliding window → 'expired' (a new doc is
 * allowed). Existing within the window → delegate to the update-rule decision
 * ('update' with version++ / 'ignore'). The service (T6) owns the lookup and
 * the actual persistence.
 */
export function resolveDedup(
  existing: DedupExistingDoc | null | undefined,
  incoming: DedupDraft,
  rule: UpdateRule,
  window: ResolveDedupWindow = {},
): DedupResolution {
  const now = window.now ?? new Date();
  const windowHours = window.windowHours ?? 24;
  if (!existing) {
    return { action: "expired", next: null };
  }
  const at = existing.deduplicatedAt;
  const atMs =
    at instanceof Date
      ? at.getTime()
      : typeof at === "string" || typeof at === "number"
        ? new Date(at).getTime()
        : Number.NaN;
  const withinWindow =
    !Number.isNaN(atMs) && atMs > now.getTime() - windowHours * HOUR_MS;
  if (!withinWindow) {
    return { action: "expired", next: null };
  }
  return applyDedupUpdateRule(rule, existing, incoming);
}
