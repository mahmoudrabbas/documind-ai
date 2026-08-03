/**
 * document_uploaded trigger producer (T18) — the API-side entry point that
 * fires a notification trigger the moment a document upload succeeds.
 *
 * DIP (T10): this producer depends ONLY on the narrow OutboxTriggerPort — it
 * never calls service.create / NotificationService directly and never touches
 * the outbox model or dispatcher internals. The caller injects the port
 * (the wired singleton from getNotificationOutboxDispatcher()).
 *
 * Emission:
 *   - document_uploaded → the uploader only. Category documents, priority
 *     normal, View action → GET /documents/:id, dedupEventId = document id
 *     (a re-upload within the 24h window version++s instead of duplicating).
 */
import { randomUUID } from "node:crypto";
import { buildNotificationDedupKey, DEDUP_WINDOW_HOURS } from "workers/contracts";
import type { OutboxTriggerPort } from "../ports/outboxTrigger.port.js";

export interface DocumentUploadedTriggerInput {
  tenantId: string;
  actorId: string;
  /** Persisted document id — the dedup entity for this trigger type. */
  documentId: string;
  /** Fresh persisted document title (null → omitted from payload). */
  documentTitle: string | null;
  /** Fresh persisted department (null/undefined → omitted). */
  department?: string | null;
  /** Fresh persisted classification (null/undefined → omitted). */
  classification?: string | null;
}

/**
 * Best-effort publish of the document_uploaded trigger. Callers MUST wrap this
 * in try/catch (a notification outbox failure must never fail the completed
 * upload — the outbox scheduler retries pending entries asynchronously).
 */
export async function publishDocumentUploadedTrigger(
  port: OutboxTriggerPort,
  input: DocumentUploadedTriggerInput,
): Promise<void> {
  const metadata: Record<string, unknown> = {
    documentId: input.documentId,
    documentTitle: input.documentTitle ?? "",
  };
  if (input.department) metadata.department = input.department;
  if (input.classification) metadata.classification = input.classification;

  const source = {
    type: "document" as const,
    id: input.documentId,
    displayName: input.documentTitle ?? "",
  };

  await port.publishTrigger({
    eventId: randomUUID(),
    type: "document_uploaded",
    tenantId: input.tenantId,
    actorId: input.actorId,
    dedupKey: buildNotificationDedupKey(
      "document_uploaded",
      input.documentId,
      new Date(),
      DEDUP_WINDOW_HOURS.document_uploaded,
    ),
    recipientUserIds: [input.actorId],
    payload: {
      metadata,
      dedupEventId: input.documentId,
      actorId: input.actorId,
      source,
    },
  });
}
