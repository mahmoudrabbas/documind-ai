/**
 * quota_exceeded trigger producer (T18) — the API-side emitter fired by the
 * entitlement capability guard the moment a fail-closed quota denial (429 /
 * ENTITLEMENT_EXCEEDED) is issued. Publishing is a fire-and-forget side
 * effect: a dead outbox must never affect the denial response.
 *
 * DIP (T10): depends ONLY on the narrow OutboxTriggerPort — no service call,
 * no outbox model, no dispatcher internals. The caller injects the port (the
 * entitlement middleware's triggerPort option).
 *
 * Envelope contract (verified against the API factory):
 *  - payload.metadata = { quotaType, usage, limit, resetAt } — the STRICT
 *    quotaExceededMetadataSchema shape (z.strictObject: unknown keys are
 *    rejected with a ZodError). resetAt MUST be an ISO-8601 string; the
 *    middleware skips publishing when the period reset could not be resolved
 *    (null) rather than emit a schema-invalid trigger.
 *  - dedupEventId = the capability key (the denied feature); 24h dedup window
 *    (DEDUP_WINDOW_HOURS.quota_exceeded).
 *  - recipient = the requesting actor (mirrors the actor-directed envelope of
 *    the sibling producers); a "system" actor yields NO recipients (the
 *    sentinel is not a real user — no orphan notification).
 */
import { randomUUID } from "node:crypto";
import { buildNotificationDedupKey, DEDUP_WINDOW_HOURS } from "workers/contracts";
import type { OutboxTriggerPort } from "../ports/outboxTrigger.port.js";

export interface QuotaExceededTriggerInput {
  tenantId: string;
  /** The requesting user whose request was denied (recipient). */
  actorId: string;
  /** The denied capability key (e.g. "allowedModels") — dedup + source entity. */
  capability: string;
  /** Current usage at denial time (counter value). */
  usage: number;
  /** The plan limit for the capability. */
  limit: number;
  /** ISO-8601 period reset; the strict metadata schema requires it. */
  resetAt: string;
  traceId?: string;
  correlationId?: string;
  causationId?: string;
}

export async function publishQuotaExceededTrigger(
  port: OutboxTriggerPort,
  input: QuotaExceededTriggerInput,
): Promise<void> {
  await port.publishTrigger({
    eventId: randomUUID(),
    type: "quota_exceeded",
    tenantId: input.tenantId,
    actorId: input.actorId,
    dedupKey: buildNotificationDedupKey(
      "quota_exceeded",
      input.capability,
      new Date(),
      DEDUP_WINDOW_HOURS.quota_exceeded,
    ),
    recipientUserIds: input.actorId !== "system" ? [input.actorId] : [],
    payload: {
      metadata: {
        quotaType: input.capability,
        usage: input.usage,
        limit: input.limit,
        resetAt: input.resetAt,
      },
      dedupEventId: input.capability,
      actorId: input.actorId,
      source: {
        type: "entitlement",
        id: input.capability,
        displayName: input.capability,
      },
      ...(input.traceId || input.correlationId || input.causationId
        ? {
            traceIds: {
              ...(input.traceId ? { traceId: input.traceId } : {}),
              ...(input.correlationId
                ? { correlationId: input.correlationId }
                : {}),
              ...(input.causationId ? { causationId: input.causationId } : {}),
            },
          }
        : {}),
    },
  });
}
