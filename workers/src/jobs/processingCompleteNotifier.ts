import { ObjectId } from "mongodb";
import { logger } from "../logger.js";
import { getMongoClient } from "../db/mongo.js";
import type { JobHandlerContext, JobHandlerResult } from "../contracts/jobDispatcher.js";
import type {
  OutboxTriggerPort,
  TriggerEnvelope,
} from "../contracts/notificationOutboxPort.js";
import { buildNotificationDedupKey } from "../contracts/notificationDedup.js";

/**
 * processing_complete trigger wiring (T18) — shared wrapper that emits ONE
 * outbox trigger entry when the wrapped handler TERMINATES SUCCESSFULLY
 * (`{ summary: { success: true, ... } }`).
 *
 * Emission is strict: only a resolved, non-null object whose
 * `summary.success === true` triggers a write. Discarded summaries
 * (`{ summary: { discarded: true } }`), skip/idempotent summaries
 * (`{ summary: { skipped: true } }`) and thrown errors emit NOTHING — a job
 * occurrence that did not actually complete its processing must never notify
 * the uploader. The wrapper is best-effort and non-interrupting: any failure
 * to emit (DB down, port error) is logged and swallowed, and the handler's
 * result is ALWAYS relayed unchanged.
 *
 * Envelope contract (verified against the API factory):
 *   - eventId = `${jobEnvelope.idempotencyKey}:complete` (stable per
 *     occurrence; distinct `:complete` suffix so a single run of the same job
 *     never collides with the failure notifier's `${key}:${stage}` eventId, and
 *     a re-run of the same occurrence E11000s the unique {tenantId, eventId}
 *     outbox index and is skipped).
 *   - actorId = "system" — the pipeline, not a real user (rides at the ENVELOPE
 *     level per the builder contract).
 *   - The default recipient is the document uploader (`documents.uploadedBy`),
 *     carried via metadata.recipients.userIds (RecipientResolver fallback) AND
 *     envelope recipientUserIds (outbox dispatcher extractRecipientUserIds
 *     path); falls back to ctx.envelope.actorId when the lookup fails.
 *   - payload.metadata = { documentId, version, outcome: "success",
 *     completedAt, recipients } — the STRICT processingCompleteMetadataSchema
 *     shape (no traceId inside metadata); traceId rides at the payload top
 *     level.
 */
export interface ProcessingCompleteNotifierOptions<TPayload> {
  outbox: OutboxTriggerPort;
  handle: (
    payload: TPayload,
    ctx: JobHandlerContext,
  ) => Promise<JobHandlerResult | void>;
}

function isSuccessSummary(
  result: JobHandlerResult | void,
): result is JobHandlerResult & { summary: { success: true } } {
  if (typeof result !== "object" || result === null) return false;
  const summary = (result as { summary?: unknown }).summary;
  if (typeof summary !== "object" || summary === null) return false;
  return (summary as { success?: unknown }).success === true;
}

export function withProcessingCompleteOutbox<TPayload>(
  opts: ProcessingCompleteNotifierOptions<TPayload>,
) {
  const { outbox, handle } = opts;
  return async (
    payload: TPayload,
    ctx: JobHandlerContext,
  ): Promise<JobHandlerResult | void> => {
    const result = await handle(payload, ctx);
    if (isSuccessSummary(result)) {
      try {
        await emitProcessingComplete(outbox, payload, ctx);
      } catch (emitErr) {
        // Best-effort — never interrupt job processing on a notify failure.
        logger.error(
          { err: emitErr, traceId: ctx.traceId },
          "failed to emit processing_complete outbox trigger",
        );
      }
    }
    return result;
  };
}

async function emitProcessingComplete<TPayload>(
  outbox: OutboxTriggerPort,
  payload: TPayload,
  ctx: JobHandlerContext,
): Promise<void> {
  const documentId = (payload as { documentId?: unknown }).documentId;
  if (typeof documentId !== "string" || documentId.length === 0) {
    logger.warn(
      { traceId: ctx.traceId },
      "cannot emit processing_complete: payload has no documentId",
    );
    return;
  }

  const documentVersion = (payload as { documentVersion?: unknown }).documentVersion;

  // Best-effort uploader lookup (mirrors the failed notifier's title lookup).
  let resolvedUploaderId: string | null = null;
  try {
    const db = getMongoClient()?.db();
    const doc = db
      ? await db.collection("documents").findOne({
          _id: new ObjectId(documentId),
          tenantId: new ObjectId(ctx.envelope.tenantId),
        })
      : null;
    const uploadedBy = (doc as { uploadedBy?: unknown } | null)?.uploadedBy;
    if (uploadedBy !== undefined && uploadedBy !== null) {
      resolvedUploaderId = uploadedBy.toString();
    }
  } catch {
    // Uploader lookup is best-effort; fall back to ctx.envelope.actorId.
  }

  const recipientUserId = resolvedUploaderId ?? ctx.envelope.actorId;
  const now = new Date();

  const envelope: TriggerEnvelope = {
    eventId: `${ctx.envelope.idempotencyKey}:complete`,
    type: "processing_complete",
    tenantId: ctx.envelope.tenantId,
    actorId: "system",
    dedupKey: buildNotificationDedupKey("processing_complete", documentId, now),
    recipientUserIds: [recipientUserId],
    payload: {
      // STRICT factory schema — NO traceId inside metadata.
      metadata: {
        documentId,
        version: documentVersion,
        outcome: "success",
        completedAt: now.toISOString(),
        recipients: { userIds: [recipientUserId] },
      },
      traceId: ctx.traceId,
    },
  };

  await outbox.publishTrigger(envelope);
}
