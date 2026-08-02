import type { BaseRole } from "../../common/auth/baseRoles.js";
import { logger } from "../../common/logger/logger.js";
import { getAuditWriter } from "../../common/observability/index.js";

// ── Entitlement denial audit ──────────────────────────────────────────────────
//
// Fire-and-forget audit of entitlement denials. When a guard converts an
// entitlement failure into HTTP 429 (ENTITLEMENT_EXCEEDED) or 503
// (ENTITLEMENT_UNAVAILABLE) the middleware records an event in the existing
// `audit_logs` collection via getAuditWriter(). Audit write failures are
// swallowed and logged — they must NEVER block or alter the HTTP response.

export type EntitlementDenialType = 429 | 503;

export interface EntitlementDenialInput {
  /** Counter dimension or capability key that was denied, e.g. "documents". */
  dimension: string;
  /** HTTP status of the denial response: 429 quota exceeded, 503 unavailable. */
  denialType: EntitlementDenialType;
  /** Tenant the denial applies to; omitted when the request is not scoped. */
  tenantId?: string;
  /** Authenticated actor id; omitted when the request is unauthenticated. */
  actorId?: string;
  actorEmail?: string | null;
  actorRole?: BaseRole | null;
  /**
   * Id of the quota resource being denied. Defaults to
   * `<dimension>:<period>` (e.g. "documents:2026-07").
   */
  resourceId?: string;
  /** Request trace id, when the request carries one. */
  traceId?: string;
  // ── Denial payload (429 only) ─────────────────────────────────────────────
  current?: number;
  limit?: number;
  remaining?: number;
  canUpgrade?: boolean;
  periodReset?: string | null;
}

/** Quota period key (`YYYY-MM`) for the resource id of a denial event. */
function currentPeriodKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Records an entitlement denial as an audit event, then returns immediately.
 *
 * The write is fire-and-forget: this function never awaits the writer and
 * never throws, so an audit failure (or a failing writer) can never block the
 * guarded request. Failures are logged with the repo logger.
 */
export function logEntitlementDenial(input: EntitlementDenialInput): void {
  const metadata: Record<string, unknown> = {
    dimension: input.dimension,
    denialType: input.denialType,
  };
  if (input.traceId !== undefined) metadata.traceId = input.traceId;
  if (input.current !== undefined) metadata.current = input.current;
  if (input.limit !== undefined) metadata.limit = input.limit;
  if (input.remaining !== undefined) metadata.remaining = input.remaining;
  if (input.canUpgrade !== undefined) metadata.canUpgrade = input.canUpgrade;
  if (input.periodReset !== undefined) metadata.periodReset = input.periodReset;

  try {
    // The action/resourceType strings are not members of the AuditAction /
    // AuditResourceType unions (same `as never` pattern as importBatch.service.ts).
    // The denial write must never throw — attach a catch that logs and swallows.
    void getAuditWriter()
      .write({
        action: "entitlement.denial" as never,
        resourceType: input.dimension as never,
        resourceId:
          input.resourceId ?? `${input.dimension}:${currentPeriodKey()}`,
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorEmail: input.actorEmail,
        actorRole: input.actorRole,
        outcome: "DENIED",
        metadata,
      })
      .catch((error: unknown) => {
        logger.warn(
          { err: error, dimension: input.dimension, denialType: input.denialType },
          "[EntitlementDenial] Audit write failed — denial response unaffected",
        );
      });
  } catch (error) {
    logger.warn(
      { err: error, dimension: input.dimension, denialType: input.denialType },
      "[EntitlementDenial] Audit write failed synchronously — denial response unaffected",
    );
  }

  // Analytics usage event — runs independently of the audit write so that
  // an audit failure cannot prevent denial events from being recorded, and
  // an analytics failure cannot surface as an audit error.
  if (input.tenantId) {
    import("../analytics/adapters/mongo-usage-event-writer.js")
      .then(({ MongoUsageEventWriter }) => {
        const writer = new MongoUsageEventWriter();
        void writer.record({
          tenantId: input.tenantId!,
          actorId: input.actorId,
          eventType: "entitlement_denial",
          units: 1,
          success: false,
          errorCode: `ENTITLEMENT_${input.denialType}`,
          traceId: input.traceId,
          metadata: {
            dimension: input.dimension,
            denialType: input.denialType,
            limit: input.limit,
            current: input.current,
          },
        }).catch((err) => {
          logger.warn({ err, dimension: input.dimension }, "[EntitlementDenial] UsageEvent write failed");
        });
      })
      .catch((err) => {
        logger.warn({ err, dimension: input.dimension }, "[EntitlementDenial] UsageEvent module import failed");
      });
  }
}
