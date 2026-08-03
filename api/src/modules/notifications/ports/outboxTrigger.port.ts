import type { NotificationType } from "../../../db/models/notification.model.js";

/**
 * Outbox trigger port (T10) — DIP: THE only entry producers call to submit a
 * raw notification trigger. Producers depend on this narrow port, never on the
 * dispatcher class or the outbox model directly (Interface Segregation +
 * Dependency Inversion). `NotificationOutboxDispatcher` is the only implementer.
 *
 * Worker-side producers (T9/T18/T25) do NOT import this file — guardrail 16
 * forbids api modules in workers; they write raw-driver trigger entries that
 * this port's dispatcher consumes. API-side producers (T18/T25) call
 * `publishTrigger` and the dispatcher persists the entry.
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
