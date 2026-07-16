/**
 * Error classification and retry policy.
 *
 * Errors thrown by handlers are classified as `retryable` or `permanent`.
 * Retryable errors are retried with exponential backoff; permanent errors
 * fail the job immediately and (if attempts are exhausted) dead-letter it.
 */
export type ErrorSeverity = "retryable" | "permanent";

export class RetryableJobError extends Error {
  readonly severity: ErrorSeverity = "retryable";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RetryableJobError";
  }
}

export class PermanentJobError extends Error {
  readonly severity: ErrorSeverity = "permanent";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PermanentJobError";
  }
}

export interface RetryPolicy {
  /** Maximum number of attempts (including the first). */
  maxAttempts: number;
  /** Base delay between attempts in ms. */
  baseDelayMs: number;
  /** Backoff multiplier applied per attempt. */
  backoffFactor: number;
  /** Upper bound on delay between attempts in ms. */
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  backoffFactor: 2,
  maxDelayMs: 60_000,
};

/**
 * Classifies an arbitrary thrown error into a retry severity.
 *
 * - `PermanentJobError` => permanent
 * - timeout / abort => permanent (do not spin while shutting down)
 * - well-known transient error classes (network, redis, mongo, ECONNRESET…) =>
 *   retryable
 * - anything else => retryable by default (failures are transient by assumption
 *   until proven otherwise, but capped by the policy)
 */
export function classifyError(error: unknown): ErrorSeverity {
  if (error instanceof PermanentJobError) return "permanent";
  if (error instanceof RetryableJobError) return "retryable";

  if (error instanceof Error) {
    const name = error.name;
    const code = (error as { code?: string }).code;

    if (
      name === "AbortError" ||
      name === "TimeoutError" ||
      code === "ETIMEDOUT" ||
      code === "ABORT_ERR"
    ) {
      // Timeouts/aborts during shutdown must not loop — treat as permanent.
      return "permanent";
    }

    if (
      code === "ECONNRESET" ||
      code === "EPIPE" ||
      code === "ETIMEDOUT" ||
      name === "MongoNetworkError" ||
      name === "MongoTimeoutError" ||
      name === "RedisError"
    ) {
      return "retryable";
    }
  }

  return "retryable";
}

/**
 * Computes the backoff delay (ms) before the next attempt.
 * `attempt` is 1-based (the attempt that just failed).
 */
export function computeBackoffMs(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): number {
  const exponent = Math.max(0, attempt - 1);
  const delay = policy.baseDelayMs * policy.backoffFactor ** exponent;
  return Math.min(Math.round(delay), policy.maxDelayMs);
}
