import { z } from "zod";
import { logger } from "../logger.js";
import type { JobHandlerDefinition } from "../contracts/jobDispatcher.js";
import { RetryableJobError } from "../contracts/retryPolicy.js";

/**
 * SAMPLE job — NO business impact.
 *
 * Purpose: prove the full runtime works (enqueue → execute → retry →
 * duplicate suppression → tracing) without touching product features.
 * Feature teams build their own typed jobs against the same port.
 *
 * This handler deliberately honors an opt-in "failOnce" input so tests can
 * exercise the retry/backoff path. It NEVER reads or writes document content
 * or any product data.
 */
export const sampleJobPayloadSchema = z.object({
  /** Free-form label for the diagnostic run (no secrets). */
  label: z.string().max(128).optional(),
  /** When true, the first attempt throws a retryable error (test hook). */
  failOnce: z.boolean().optional(),
  /** Opaque iteration counter used to verify idempotent re-run behavior. */
  nonce: z.string().max(64).optional(),
});

export const sampleJobHandler: JobHandlerDefinition<
  z.infer<typeof sampleJobPayloadSchema>
> = {
  jobType: "system.sample.noop",
  description: "Diagnostic no-op job used to exercise the queue runtime.",
  payloadSchema: sampleJobPayloadSchema,
  handle: async (payload, ctx) => {
    // Authorization re-validation contract: handlers must never trust the
    // envelope's payload for authorization. We re-validate the tenant/actor
    // identifiers are present and well-formed (no resource access here).
    const tenantId = ctx.envelope.tenantId;
    const actorId = ctx.envelope.actorId;
    if (!tenantId || !actorId) {
      throw new RetryableJobError(
        "missing tenant/actor context in envelope; cannot proceed",
      );
    }

    if (payload.failOnce && ctx.attemptsMade === 0) {
      logger.warn(
        { traceId: ctx.traceId, jobType: ctx.envelope.jobType },
        "sample job intentionally failing first attempt (retry test)",
      );
      throw new RetryableJobError("sample retry trigger");
    }

    ctx.progress("sample job completed successfully", {
      label: payload.label,
      nonce: payload.nonce,
    });

    return {
      summary: {
        processed: true,
        label: payload.label ?? null,
        nonce: payload.nonce ?? null,
      },
    };
  },
};
