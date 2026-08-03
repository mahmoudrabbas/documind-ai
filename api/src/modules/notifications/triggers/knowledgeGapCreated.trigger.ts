/**
 * knowledge_gap_created trigger producer (T18) — the API-side emitter fired by
 * the knowledge-gaps service the moment a NEW gap + first occurrence are
 * persisted (reportCandidate new-gap branch). Recurrences of an existing gap
 * never reach this producer (the service calls it only after createGap).
 *
 * DIP (T10): depends ONLY on the narrow OutboxTriggerPort — no service call,
 * no outbox model, no dispatcher internals. The caller injects the port (the
 * wired singleton from getNotificationOutboxDispatcher()).
 *
 * Envelope contract (verified against the API factory):
 *  - payload.metadata = { topic, severity, questionPreview } — the STRICT
 *    knowledgeGapMetadataSchema shape. `department` (present on the gap) is
 *    carried at the payload TOP LEVEL, never inside metadata: the factory
 *    schema is z.strictObject and rejects unknown keys with a ZodError.
 *  - dedupEventId = gap id (the business entity the notification is about);
 *    sliding-window dedup window for knowledge_gap_created (168h).
 *  - recipient = the reporting actor (mirrors processing_failed's
 *    actor-directed envelope); a "system" actor yields NO recipients (the
 *    "system" sentinel is not a real user — no orphan notification).
 */
import { randomUUID } from "node:crypto";
import { buildNotificationDedupKey, DEDUP_WINDOW_HOURS } from "workers/contracts";
import type { OutboxTriggerPort } from "../ports/outboxTrigger.port.js";
import type { KnowledgeGapSeverity } from "../factory/metadata.schemas.js";

export interface KnowledgeGapCreatedTriggerInput {
  tenantId: string;
  /** User who reported the candidate (recipient; "system" → no recipient). */
  actorId: string;
  /** The new gap id — the business entity this notification is about. */
  gapId: string;
  topic: string;
  severity: KnowledgeGapSeverity;
  /** Reporting question; truncated to the 80-char factory cap here. */
  question: string;
  /** The gap's department, carried at payload top level (see module doc). */
  department?: string | null;
  traceId?: string;
}

export async function publishKnowledgeGapCreatedTrigger(
  port: OutboxTriggerPort,
  input: KnowledgeGapCreatedTriggerInput,
): Promise<void> {
  await port.publishTrigger({
    eventId: randomUUID(),
    type: "knowledge_gap_created",
    tenantId: input.tenantId,
    actorId: input.actorId,
    dedupKey: buildNotificationDedupKey(
      "knowledge_gap_created",
      input.gapId,
      new Date(),
      DEDUP_WINDOW_HOURS.knowledge_gap_created,
    ),
    recipientUserIds: input.actorId !== "system" ? [input.actorId] : [],
    payload: {
      metadata: {
        topic: input.topic,
        severity: input.severity,
        questionPreview: input.question.slice(0, 80),
      },
      dedupEventId: input.gapId,
      actorId: input.actorId,
      source: {
        type: "knowledge_gap",
        id: input.gapId,
        displayName: input.topic,
      },
      ...(input.department ? { department: input.department } : {}),
      ...(input.traceId ? { traceIds: { traceId: input.traceId } } : {}),
    },
  });
}
