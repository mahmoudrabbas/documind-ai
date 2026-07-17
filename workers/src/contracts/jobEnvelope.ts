import { z } from "zod";

/**
 * Maximum allowed job payload size in bytes (256 KiB).
 * Protects the queue/Redis from oversized messages and enforces the
 * "cap payload size" security requirement.
 */
export const MAX_JOB_PAYLOAD_BYTES = 256 * 1024;

/**
 * Schema versions this worker runtime understands. Bump the union when a
 * backward-incompatible envelope change lands; old versions remain accepted
 * until explicitly removed.
 */
export const JOB_SCHEMA_VERSIONS = ["1.0.0"] as const;
export type JobSchemaVersion = (typeof JOB_SCHEMA_VERSIONS)[number];

/**
 * The versioned, traceable, idempotent job envelope.
 *
 * Product modules must NOT extend this envelope with product-specific fields.
 * Product data belongs in `payload`, validated by the handler's own schema.
 */
export const jobEnvelopeSchema = z.object({
  /** Discriminator the handler registry uses to route the job. */
  jobType: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_.:-]+$/, "jobType must be alphanumeric with _ . : -"),

  /** Envelope schema version, for forward/backward compatibility. */
  schemaVersion: z.enum(JOB_SCHEMA_VERSIONS),

  /** Tenant the job is scoped to. Never trusted blindly by handlers. */
  tenantId: z.string().min(1).max(128),

  /** Actor (user) that initiated the job, for audit and authorization. */
  actorId: z.string().min(1).max(128),

  /** Correlation id shared across enqueue/execute/retry/dead-letter logs. */
  traceId: z.string().min(1).max(128),

  /** Idempotency key. Same key enqueued twice must not execute twice. */
  idempotencyKey: z.string().min(1).max(256),

  /** Opaque, product-defined payload. Validated by the handler. */
  payload: z.unknown(),

  /** ISO-8601 creation timestamp set by the producer. */
  createdAt: z.string().datetime({ offset: true }),

  /** Optional numeric priority (higher = sooner). Range-aligned with BullMQ. */
  priority: z.number().int().min(1).max(20_000_000).optional(),

  /** Optional ISO-8601 delayed-until timestamp. */
  scheduledFor: z.string().datetime({ offset: true }).optional(),

  /** Optional caller-supplied descriptive label (never a secret). */
  displayName: z.string().max(256).optional(),
});

export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;

/**
 * Validates a raw job envelope with the size cap applied. Returns a typed
 * result so callers can surface structured validation failures without
 * leaking raw payloads into logs.
 */
export function validateJobEnvelope(input: unknown): {
  ok: boolean;
  value?: JobEnvelope;
  error?: string;
} {
  const parsed = jobEnvelopeSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((i) => `${i.path.join(".") || "envelope"}: ${i.message}`)
        .join("; "),
    };
  }

  if (!isPayloadWithinSizeLimit(parsed.data.payload)) {
    return {
      ok: false,
      error: `payload exceeds maximum size of ${MAX_JOB_PAYLOAD_BYTES} bytes`,
    };
  }

  return { ok: true, value: parsed.data };
}

export function isPayloadWithinSizeLimit(payload: unknown): boolean {
  try {
    const serialized = payload === undefined ? "0" : JSON.stringify(payload);
    return Buffer.byteLength(serialized, "utf8") <= MAX_JOB_PAYLOAD_BYTES;
  } catch {
    // Un-serializable payloads are rejected by the schema anyway; treat as
    // oversized to be safe rather than silently accepting.
    return false;
  }
}

/**
 * Standard lifecycle states for an enqueued job. Mirrors BullMQ's states
 * while remaining adapter-agnostic.
 */
export const JOB_STATES = [
  "waiting",
  "active",
  "delayed",
  "completed",
  "failed",
  "repeat",
] as const;
export type JobState = (typeof JOB_STATES)[number];

/**
 * Read model returned by queue adapters for diagnostic/status views.
 * Contains no secrets or raw payload content per the security contract.
 */
export const jobStatusSchema = z.object({
  jobId: z.string(),
  jobType: z.string(),
  tenantId: z.string(),
  actorId: z.string(),
  traceId: z.string(),
  idempotencyKey: z.string(),
  state: z.enum(JOB_STATES),
  attemptsMade: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  createdAt: z.string().datetime({ offset: true }).nullable(),
  processedAt: z.string().datetime({ offset: true }).nullable(),
  finishedAt: z.string().datetime({ offset: true }).nullable(),
  failedReason: z.string().max(512).nullable(),
  displayName: z.string().max(256).nullable(),
});

export type JobStatus = z.infer<typeof jobStatusSchema>;

/**
 * Aggregate queue metrics surfaced to the Super Admin status adapter.
 */
export interface QueueMetrics {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  /** Moving 1-minute average processing duration in ms (0 if no data). */
  avgProcessingMs: number;
  /** Count of jobs currently retrying (active with attemptsMade > 0). */
  retrying: number;
}

/**
 * Aggregate status of the worker runtime used by /readyz and diagnostics.
 */
export interface WorkerReadiness {
  ready: boolean;
  checks: {
    redis: boolean;
    mongodb: boolean;
    handlersRegistered: boolean;
    consumerRunning: boolean;
  };
  details?: Record<string, unknown>;
}
