/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from "../logger.js";
import type {
  JobHandlerContext,
  JobHandlerDefinition,
  JobHandlerRegistry,
  RetryPolicy,
} from "@documind/contracts";
import {
  classifyError,
  computeBackoffMs,
  DEFAULT_RETRY_POLICY,
  PermanentJobError,
} from "@documind/contracts";
import { publishJobEvent } from "./metrics.js";

/**
 * In-process registry of typed job handlers.
 *
 * Handlers are registered at startup. The consumer resolves a handler by
 * `jobType` and validates the envelope payload against the handler's schema
 * before execution. A missing or mismatched handler fails readiness.
 */
export class InMemoryJobHandlerRegistry implements JobHandlerRegistry {
  private readonly handlers = new Map<string, JobHandlerDefinition<any>>();

  register(definition: JobHandlerDefinition<any>): void {
    if (this.handlers.has(definition.jobType)) {
      throw new Error(
        `Job handler already registered for type: ${definition.jobType}`,
      );
    }
    this.handlers.set(definition.jobType, definition);
    logger.info(
      { jobType: definition.jobType, description: definition.description },
      "registered job handler",
    );
  }

  get(jobType: string): JobHandlerDefinition<any> | undefined {
    return this.handlers.get(jobType);
  }

  has(jobType: string): boolean {
    return this.handlers.has(jobType);
  }

  list(): ReadonlyArray<JobHandlerDefinition> {
    return [...this.handlers.values()];
  }
}

/**
 * Executes a handler for a given envelope, applying: payload validation,
 * retry policy, error classification, abort handling, and event logging.
 *
 * Returns `{ ok, deadLettered }`. `deadLettered` is true when attempts are
 * exhausted and the job is sent to the dead-letter retention store.
 */
export interface ExecutionOutcome {
  ok: boolean;
  deadLettered: boolean;
  attemptsMade: number;
  failedReason?: string;
  shouldRetry: boolean;
  nextDelayMs: number;
}

export async function executeHandler(
  handler: JobHandlerDefinition,
  ctx: JobHandlerContext,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<ExecutionOutcome> {
  const { envelope, attemptsMade } = ctx;

  // 1. Validate payload at execution time (never trust envelope content).
  const payloadResult = handler.payloadSchema.safeParse(envelope.payload);
  if (!payloadResult.success) {
    publishJobEvent({
      traceId: ctx.traceId,
      jobType: envelope.jobType,
      tenantId: envelope.tenantId,
      actorId: envelope.actorId,
      event: "dead-letter",
      attemptsMade,
      data: { reason: "payload_validation_failed" },
    });
    return {
      ok: false,
      deadLettered: true,
      attemptsMade,
      failedReason: `payload validation failed: ${payloadResult.error.issues
        .map((i) => i.message)
        .join("; ")}`,
      shouldRetry: false,
      nextDelayMs: 0,
    };
  }

  publishJobEvent({
    traceId: ctx.traceId,
    jobType: envelope.jobType,
    tenantId: envelope.tenantId,
    actorId: envelope.actorId,
    event: attemptsMade === 0 ? "start" : "retry",
    attemptsMade,
  });

  try {
    await withAbort(handler.handle(payloadResult.data, ctx), ctx.signal);

    publishJobEvent({
      traceId: ctx.traceId,
      jobType: envelope.jobType,
      tenantId: envelope.tenantId,
      actorId: envelope.actorId,
      event: "success",
      attemptsMade,
    });

    return { ok: true, deadLettered: false, attemptsMade, shouldRetry: false, nextDelayMs: 0 };
  } catch (error) {
    const severity = classifyError(error);
    const isLastAttempt = attemptsMade >= policy.maxAttempts;
    const shouldRetry = severity === "retryable" && !isLastAttempt;

    const failedReason =
      error instanceof Error ? error.message : "unknown error";

    publishJobEvent({
      traceId: ctx.traceId,
      jobType: envelope.jobType,
      tenantId: envelope.tenantId,
      actorId: envelope.actorId,
      event: shouldRetry ? "retry" : "dead-letter",
      attemptsMade,
      data: { severity, reason: failedReason },
    });

    if (!shouldRetry) {
      return {
        ok: false,
        deadLettered: true,
        attemptsMade,
        failedReason,
        shouldRetry: false,
        nextDelayMs: 0,
      };
    }

    return {
      ok: false,
      deadLettered: false,
      attemptsMade,
      failedReason,
      shouldRetry: true,
      nextDelayMs: computeBackoffMs(attemptsMade + 1, policy),
    };
  }
}

function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (!signal.aborted) return promise;
  return Promise.reject(new PermanentJobError("job aborted before start"));
}
