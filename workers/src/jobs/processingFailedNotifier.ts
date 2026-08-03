import { ObjectId } from "mongodb";
import { logger } from "../logger.js";
import { getMongoClient } from "../db/mongo.js";
import type { JobHandlerContext, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { PermanentJobError, RetryableJobError } from "../contracts/retryPolicy.js";
import type {
  OutboxTriggerPort,
  TriggerEnvelope,
} from "../contracts/notificationOutboxPort.js";
import { buildNotificationDedupKey } from "../contracts/notificationDedup.js";

/**
 * processing_failed trigger wiring (T9) — shared wrapper used by the
 * extraction and OCR jobs to emit ONE outbox trigger entry on TERMINAL
 * failure only.
 *
 * Terminal = PermanentJobError thrown, OR RetryableJobError on the FINAL
 * attempt (`ctx.attemptsMade + 1 >= ctx.maxAttempts` — mirrors the existing
 * dead-letter decision in handlerRegistry.executeHandler). A retryable
 * (non-terminal) failure emits nothing: the job will be retried, and the
 * notification must not be created prematurely.
 *
 * The wrapper is best-effort and non-interrupting: any failure to emit (DB
 * down, port error) is logged and swallowed, and the ORIGINAL error is always
 * rethrown so the job's normal retry/dead-letter path is unchanged.
 *
 * Envelope contract (verified against the API factory):
 *   - eventId = `${jobEnvelope.idempotencyKey}:${stage}` (stable per
 *     occurrence — a job retry re-writing the same eventId E11000s the unique
 *     {tenantId, eventId} outbox index and is skipped, so re-running the same
 *     job never writes a second entry).
 *   - payload.metadata = { documentId, documentTitle, errorCode, stage,
 *     retryable } — the STRICT processingFailedMetadataSchema shape (no
 *     traceId inside metadata); traceId rides at the payload top level.
 */
export function isTerminalFailure(
  ctx: Pick<JobHandlerContext, "attemptsMade" | "maxAttempts">,
  error: unknown,
): boolean {
  if (error instanceof PermanentJobError) return true;
  if (error instanceof RetryableJobError) {
    return ctx.attemptsMade + 1 >= ctx.maxAttempts;
  }
  return false;
}

const ERROR_CODE_KEYWORDS: Array<[RegExp, string]> = [
  [/encrypted/i, "encrypted"],
  [/unsupported/i, "unsupported"],
  [/malformed/i, "malformed"],
  [/not found|ENOENT/i, "resource_limit"],
  [/tim(e|ed)\s*out|abort/i, "timeout"],
];

/** Derives a stable errorCode from the thrown error, with a stage default. */
export function deriveErrorCode(error: unknown, stage: string): string {
  if (error instanceof Error) {
    for (const [re, code] of ERROR_CODE_KEYWORDS) {
      if (re.test(error.message)) return code;
    }
  }
  return stage === "ocr" ? "ocr_failed" : "extraction_failed";
}

export interface ProcessingFailedNotifierOptions<TPayload> {
  outbox: OutboxTriggerPort;
  /** Pipeline stage that failed — "extraction" | "ocr". */
  stage: string;
  handle: (
    payload: TPayload,
    ctx: JobHandlerContext,
  ) => Promise<JobHandlerResult | void>;
  /** Optional errorCode override; defaults to deriveErrorCode(error, stage). */
  resolveErrorCode?: (error: unknown) => string;
}

export function withProcessingFailedOutbox<TPayload>(opts: ProcessingFailedNotifierOptions<TPayload>) {
  const { outbox, stage, handle, resolveErrorCode } = opts;
  return async (
    payload: TPayload,
    ctx: JobHandlerContext,
  ): Promise<JobHandlerResult | void> => {
    try {
      return await handle(payload, ctx);
    } catch (error) {
      if (isTerminalFailure(ctx, error)) {
        try {
          await emitProcessingFailed(outbox, stage, payload, ctx, error, resolveErrorCode);
        } catch (emitErr) {
          // Best-effort — never interrupt job processing on a notify failure.
          logger.error(
            { err: emitErr, stage, traceId: ctx.traceId },
            "failed to emit processing_failed outbox trigger",
          );
        }
      }
      throw error;
    }
  };
}

async function emitProcessingFailed(
  outbox: OutboxTriggerPort,
  stage: string,
  payload: unknown,
  ctx: JobHandlerContext,
  error: unknown,
  resolveErrorCode?: (error: unknown) => string,
): Promise<void> {
  const documentId = (payload as { documentId?: unknown }).documentId;
  if (typeof documentId !== "string" || documentId.length === 0) {
    logger.warn(
      { stage, traceId: ctx.traceId },
      "cannot emit processing_failed: payload has no documentId",
    );
    return;
  }

  // Best-effort document title lookup (mirrors the job's own record read).
  let documentTitle = "Document";
  try {
    const db = getMongoClient()?.db();
    const doc = db
      ? await db.collection("documents").findOne({
          _id: new ObjectId(documentId),
          tenantId: new ObjectId(ctx.envelope.tenantId),
        })
      : null;
    documentTitle =
      (doc as { metadata?: { title?: string } } | null)?.metadata?.title ??
      (doc as { fileName?: string } | null)?.fileName ??
      documentTitle;
  } catch {
    // Title lookup is best-effort; fall back to the default.
  }

  const retryable = error instanceof RetryableJobError;
  const errorCode = resolveErrorCode ? resolveErrorCode(error) : deriveErrorCode(error, stage);
  const now = new Date();

  const envelope: TriggerEnvelope = {
    eventId: `${ctx.envelope.idempotencyKey}:${stage}`,
    type: "processing_failed",
    tenantId: ctx.envelope.tenantId,
    actorId: ctx.envelope.actorId,
    dedupKey: buildNotificationDedupKey("processing_failed", documentId, now),
    recipientUserIds: [ctx.envelope.actorId],
    payload: {
      // STRICT factory schema — retryable required, NO traceId inside metadata.
      metadata: { documentId, documentTitle, errorCode, stage, retryable },
      traceId: ctx.traceId,
    },
  };

  await outbox.publishTrigger(envelope);
}
