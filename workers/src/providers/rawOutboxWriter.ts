import { MongoServerError, ObjectId } from "mongodb";
import { logger } from "../logger.js";
import { getMongoClient } from "../db/mongo.js";
import type {
  OutboxTriggerPort,
  TriggerEnvelope,
} from "../contracts/notificationOutboxPort.js";

/**
 * Raw-driver implementation of the outbox trigger port (T9).
 *
 * Writes a `trigger` entry to the `notificationoutboxes` collection through the
 * raw mongodb driver — the worker NEVER imports api modules (guardrail 16), so
 * this adapter is the worker-side twin of the API-side producer
 * (NotificationOutboxDispatcher.publishTrigger). It mirrors that writer's
 * document shape field-for-field so the two producers are interchangeable
 * (Liskov Substitution — see the port contract in contracts/).
 *
 * Insert idempotency: the unique {tenantId, eventId} index
 * (uniq_notification_outbox_event) makes a job retry that re-writes the same
 * occurrence E11000. That is treated as already-written (log + skip), never an
 * error — no double-enqueue.
 *
 * Best-effort: a missing connection or a write failure is logged and swallowed
 * so a notification side-effect can never interrupt the job that triggered it.
 */
export class RawOutboxWriter implements OutboxTriggerPort {
  async publishTrigger(event: TriggerEnvelope): Promise<void> {
    const db = getMongoClient()?.db();
    if (!db) {
      logger.warn("Cannot publish outbox trigger: MongoDB not connected");
      return;
    }

    const now = new Date();
    try {
      await db.collection("notificationoutboxes").insertOne({
        tenantId: new ObjectId(event.tenantId),
        eventId: event.eventId,
        kind: "trigger",
        notificationType: event.type,
        dedupKey: event.dedupKey ?? null,
        actorId: event.actorId,
        payload: {
          ...event.payload,
          type: event.type,
          recipientUserIds: event.recipientUserIds,
        },
        attempts: 0,
        state: "pending",
        nextAttemptAt: now,
        claimExpiresAt: null,
        failureCode: null,
        failedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      // A job retry re-writing the same occurrence E11000s the unique
      // {tenantId, eventId} index → already-written, idempotent, no
      // double-enqueue.
      if (error instanceof MongoServerError && error.code === 11000) {
        logger.debug(
          { tenantId: event.tenantId, eventId: event.eventId },
          "Outbox trigger already written (E11000); skipping duplicate",
        );
        return;
      }
      logger.error(
        { err: error, tenantId: event.tenantId, eventId: event.eventId },
        "Failed to write outbox trigger",
      );
    }
  }
}
