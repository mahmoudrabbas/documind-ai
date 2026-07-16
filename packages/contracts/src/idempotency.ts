import { createHash, randomUUID } from "node:crypto";

/**
 * Deterministic idempotency key derivation.
 *
 * Product modules pass a stable, business-meaningful key (e.g. derived from
 * tenant + resource id + action). This helper makes a safe key when none is
 * supplied, but callers SHOULD supply their own to get true dedup semantics.
 *
 * Keys never contain secrets or raw document content — only ids and a hash.
 */
export function deriveIdempotencyKey(parts: {
  tenantId: string;
  jobType: string;
  /** Stable business identifier, e.g. document id. */
  resourceId: string;
  /** Optional action suffix to distinguish multiple ops on the same resource. */
  action?: string;
}): string {
  const base = [
    parts.tenantId,
    parts.jobType,
    parts.resourceId,
    parts.action ?? "default",
  ].join("|");
  return `idem:${hashString(base)}`;
}

export function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Generates a fresh trace id. Prefer an inbound trace id from the auth/request
 * context; this is the fallback for jobs created outside a request scope.
 */
export function generateTraceId(): string {
  return `trace:${randomUUID()}`;
}

/**
 * Builds a stable dedup key for the queue adapter. Combines jobType so that
 * two distinct job types with the same business idempotencyKey do not collide.
 */
export function buildDedupKey(jobType: string, idempotencyKey: string): string {
  return `${jobType}::${idempotencyKey}`;
}
