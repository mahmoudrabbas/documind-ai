import type { NotificationType } from "./notificationTransport.js";

/**
 * Outbox trigger port (T9) — worker-side mirror of the canonical API contract
 * (api/src/modules/notifications/ports/outboxTrigger.port.ts). SAME interface,
 * SAME field names: the worker producer (RawOutboxWriter) and the API producer
 * (NotificationOutboxDispatcher) are interchangeable callers of the trigger
 * contract (Liskov Substitution). Jobs depend on this narrow port, never on the
 * mongodb driver directly (Dependency Inversion, round-11).
 *
 * Worker-side producers do NOT import api modules (guardrail 16); this pure
 * port plus the raw-driver adapter in providers/ is the entire worker surface.
 */
export interface TriggerEnvelope {
  /** Stable per-occurrence id. `${jobIdempotencyKey}:${stage}` for worker
   *  trigger entries (idempotent across job retries), uuid for API-produced. */
  eventId: string;
  type: NotificationType;
  tenantId: string;
  actorId: string;
  /** Bucketed notification dedupKey — informational in the outbox. */
  dedupKey?: string;
  /** Recipients this trigger fans out to (resolved by the producer). */
  recipientUserIds: string[];
  /** Raw domain event consumed by the notification factory (T4). */
  payload: Record<string, unknown>;
}

export interface OutboxTriggerPort {
  /** Persist a trigger entry to the outbox. Idempotent on eventId: a
   *  duplicate write (E11000) resolves as already-written. */
  publishTrigger(event: TriggerEnvelope): Promise<void>;
}
