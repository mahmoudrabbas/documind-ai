## Relevant files for workers/contracts architecture issue

### `package.json`
```json
{
  "name": "documind-ai",
  "version": "1.0.0",
  "private": true,
  "packageManager": "npm@10.9.8",
  "description": "DocuMind AI monorepo — Next.js frontend, Express backend, and background workers.",
  "workspaces": [
    "api",
    "app",
    "workers"
  ],
  "scripts": {
    "dev": "docker compose up --build",
    "dev:api": "npm run dev --workspace api",
    "dev:app": "npm run dev --workspace app",
    "dev:workers": "npm run dev --workspace workers",
    "build": "node scripts/run-workspaces.mjs build",
    "build:api": "npm run build --workspace api",
    "build:app": "npm run build --workspace app",
    "build:workers": "npm run build --workspace workers",
    "lint": "node scripts/run-workspaces.mjs lint",
    "lint:root": "eslint . --ignore-pattern api --ignore-pattern app --ignore-pattern workers",
    "lint:api": "npm run lint --workspace api",
    "lint:app": "npm run lint --workspace app",
    "lint:workers": "npm run lint --workspace workers",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "node scripts/run-workspaces.mjs typecheck",
    "typecheck:api": "npm run typecheck --workspace api",
    "typecheck:app": "npm run typecheck --workspace app",
    "typecheck:workers": "npm run typecheck --workspace workers",
    "test": "node scripts/run-workspaces.mjs test",
    "test:security": "node --test scripts/*.test.mjs",
    "test:api": "npm run test --workspace api",
    "test:app": "npm run test --workspace app",
    "test:workers": "npm run test --workspace workers",
    "security:secrets": "node scripts/check-committed-secrets.mjs",
    "ci:validate": "npm run security:secrets && npm run lint && npm run typecheck && npm test && npm run build",
    "install:all": "npm install --workspaces --include-workspace-root"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "@playwright/test": "^1.61.1",
    "eslint": "^9.39.4",
    "eslint-config-prettier": "^10.1.8",
    "prettier": "^3.9.4",
    "typescript-eslint": "^8.62.1"
  },
  "engines": {
    "node": ">=22.0.0 <23.0.0",
    "npm": ">=10.0.0 <11.0.0"
  },
  "keywords": [
    "docsai",
    "documind",
    "ai",
    "rag",
    "monorepo"
  ],
  "license": "UNLICENSED"
}
```

### `tsconfig.base.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "ignoreDeprecations": "6.0"
  }
}
```

### `api/package.json`
```json
{
  "name": "api",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "lint": "eslint src eslint.config.mjs",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "test": "node ../scripts/run-api-tests.mjs",
    "test:local": "find src -name '*.test.ts' -print0 | xargs -0 -n 1 env MONGODB_URI='mongodb://127.0.0.1:27017/docsai' REDIS_URL='redis://127.0.0.1:6379' node --import tsx --test",
    "test:compose": "find src -name '*.test.ts' -print0 | xargs -0 -n 1 env MONGODB_URI='mongodb://mongodb:27017/docsai' REDIS_URL='redis://redis:6379' node --import tsx --test",
    "seed:super-admin": "tsx src/scripts/seed-super-admin.ts"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "dependencies": {
    "argon2": "^0.44.0",
    "bullmq": "^5.80.5",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "express-rate-limit": "^8.5.2",
    "ioredis": "^5.11.1",
    "mongoose": "^9.7.3",
    "multer": "^2.0.0",
    "nodemailer": "^9.0.3",
    "pino": "^10.3.1",
    "rate-limit-redis": "^5.0.0",
    "workers": "file:../workers",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.4",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/mongoose": "^5.11.96",
    "@types/multer": "^2.2.0",
    "@types/node": "^26.1.0",
    "@types/nodemailer": "^8.0.1",
    "eslint": "^9.39.4",
    "eslint-config-prettier": "^10.1.8",
    "mongodb-memory-server": "^11.2.0",
    "nodemon": "^3.1.14",
    "pino-pretty": "^13.1.3",
    "tsx": "^4.23.0",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.62.1"
  }
}
```

### `api/tsconfig.json`
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "baseUrl": "./src",
    "paths": {
      "@/*": ["./*"]
    },
    "ignoreDeprecations": "6.0"
  },
  "include": ["src"]
}
```

### `api/src/modules/jobs/jobDispatcher.ts`
```ts
import { Queue } from "bullmq";
import { type Redis } from "ioredis";
import { logger } from "../../common/logger/logger.js";
import { getRedisClient } from "../../db/redis.js";
import {
  jobEnvelopeSchema,
  validateJobEnvelope,
  buildDedupKey,
  type JobEnvelope,
  type JobStatus,
  type QueueMetrics,
} from "workers/contracts";

export const JOBS_QUEUE_NAME = "documind-jobs";

/**
 * API-side producer implementing the JobDispatcher port.
 *
 * The API never imports the worker's runtime — it depends only on the shared
 * contract (`workers/contracts`) for envelope types/validation and emits the
 * same envelope shape the worker consumes. This keeps the workspaces free of
 * circular runtime dependencies.
 */
export class ApiJobDispatcher {
  private queue: Queue;

  constructor(queue?: Queue) {
    if (queue) {
      this.queue = queue;
      return;
    }
    const redis: Redis = getRedisClient() as unknown as Redis;
    this.queue = new Queue(JOBS_QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 5000,
        removeOnFail: false,
      },
    });
  }

  /**
   * Validates the caller-supplied envelope, derives the dedup jobId, and
   * enqueues. Duplicate idempotency keys are suppressed at the Redis layer.
   */
  async enqueue(input: unknown): Promise<{
    ok: boolean;
    jobId?: string;
    idempotencyKey?: string;
    deduplicated?: boolean;
    error?: string;
  }> {
    // Normalize producer-boundary defaults before contract validation.
    const normalized = {
      schemaVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      ...(input as Record<string, unknown>),
    };

    const validation = validateJobEnvelope(normalized);
    if (!validation.ok || !validation.value) {
      return { ok: false, error: validation.error };
    }

    const env = validation.value;
    const jobId = buildDedupKey(env.jobType, env.idempotencyKey);

    const existing = await this.queue.getJob(jobId);
    if (existing) {
      logger.info(
        { jobType: env.jobType, jobId, traceId: env.traceId },
        "duplicate job suppressed (idempotency key)",
      );
      return {
        ok: true,
        jobId,
        idempotencyKey: env.idempotencyKey,
        deduplicated: true,
      };
    }

    const job = await this.queue.add(env.jobType, env, {
      jobId,
      priority: env.priority,
      delay: env.scheduledFor
        ? Math.max(0, Date.parse(env.scheduledFor) - Date.now())
        : undefined,
    });

    logger.info(
      { jobType: env.jobType, jobId: job.id, traceId: env.traceId },
      "job enqueued",
    );

    return {
      ok: true,
      jobId: job.id ?? jobId,
      idempotencyKey: env.idempotencyKey,
      deduplicated: false,
    };
  }

  /** Read-only status lookup (Super Admin context only, enforced by route). */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    const state = (await job.getState()) as JobStatus["state"];
    return {
      jobId,
      jobType: (job.data as JobEnvelope).jobType,
      tenantId: (job.data as JobEnvelope).tenantId,
      actorId: (job.data as JobEnvelope).actorId,
      traceId: (job.data as JobEnvelope).traceId,
      idempotencyKey: (job.data as JobEnvelope).idempotencyKey,
      state,
      attemptsMade: job.attemptsMade ?? 0,
      maxAttempts: job.opts?.attempts ?? 5,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      processedAt: job.processedOn
        ? new Date(job.processedOn).toISOString()
        : null,
      finishedAt: job.finishedOn
        ? new Date(job.finishedOn).toISOString()
        : null,
      failedReason:
        (job.failedReason as string | undefined)?.slice(0, 512) ?? null,
      displayName: ((job.data as JobEnvelope).displayName as string) ?? null,
    };
  }

  async getMetrics(): Promise<QueueMetrics> {
    const counts = await this.queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
    );
    return {
      queue: JOBS_QUEUE_NAME,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      retrying: 0,
      avgProcessingMs: 0,
    };
  }

  /** Replay a dead-lettered job (Super Admin only). */
  async replayJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    if ((await job.getState()) !== "failed") return false;
    await job.retry();
    return true;
  }
}

let singleton: ApiJobDispatcher | null = null;

export function getApiJobDispatcher(): ApiJobDispatcher {
  if (!singleton) singleton = new ApiJobDispatcher();
  return singleton;
}

export { jobEnvelopeSchema };
```

### `workers/package.json`
```json
{
  "name": "workers",
  "version": "1.0.0",
  "private": true,
  "description": "DocuMind AI background workers — document processing, embeddings, and queue consumers.",
  "type": "module",
  "main": "dist/index.js",
  "exports": {
    "./contracts": {
      "types": "./dist/contracts/index.d.ts",
      "import": "./dist/contracts/index.js"
    }
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "find src -name '*.test.ts' -print0 | xargs -0 -r -n 1 node --import tsx --test"
  },
  "dependencies": {
    "bullmq": "^5.80.5",
    "dotenv": "^17.4.2",
    "ioredis": "^5.11.1",
    "mongodb": "^6.21.0",
    "pino": "^10.3.1",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.23.0",
    "typescript": "^6.0.3"
  }
}
```

### `workers/tsconfig.json`
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "baseUrl": "./src",
    "ignoreDeprecations": "6.0",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

### `workers/src/contracts/index.ts`
```ts
export * from "./jobEnvelope.js";
export * from "./jobDispatcher.js";
export * from "./retryPolicy.js";
export * from "./idempotency.js";
export * from "./metrics.js";
export * from "./handlerRegistry.js";
export * from "./inMemoryQueue.js";
export * from "./bullmqQueue.js";
```

### `workers/src/contracts/jobEnvelope.ts`
```ts
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
    const serialized =
      payload === undefined ? "0" : JSON.stringify(payload);
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
```

### `workers/src/contracts/idempotency.ts`
```ts
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
```

### `workers/src/contracts/jobDispatcher.ts`
```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";
import type { JobEnvelope, JobStatus, QueueMetrics } from "./jobEnvelope.js";

/**
 * The stable, vendor-agnostic dispatch port.
 *
 * Product modules depend ONLY on this interface (and `JobEnvelope`) — never on
 * BullMQ or any queue adapter directly. This satisfies the parallel-safety
 * contract: feature teams can build typed jobs against `JobDispatcher` before
 * the real worker consumer is merged.
 */
export interface EnqueueOptions {
  /** Override numeric priority (higher = sooner). */
  priority?: number;
  /** ISO-8601 delayed-until timestamp. */
  scheduledFor?: string;
  /** Optional caller label (never a secret). */
  displayName?: string;
}

export interface EnqueueResult {
  /** Queue-native job id (never contains secrets or payloads). */
  jobId: string;
  /** Echo of the idempotency key used for dedup. */
  idempotencyKey: string;
  /** True when the job was a duplicate and was suppressed. */
  deduplicated: boolean;
}

export interface JobDispatcher {
  /**
   * Enqueue a versioned, traceable, idempotent job.
   *
   * Idempotency is enforced by `idempotencyKey`: a duplicate dispatch with the
   * same key (and jobType) must not create a second executing job.
   */
  enqueue(
    input: Omit<
      JobEnvelope,
      "schemaVersion" | "createdAt" | "payload"
    > & {
      schemaVersion?: JobEnvelope["schemaVersion"];
      payload?: unknown;
      options?: EnqueueOptions;
    },
  ): Promise<EnqueueResult>;

  /**
   * Inspect the current status of a job. Restricted to Super Admin contexts
   * by the API layer; the dispatcher itself only performs reads.
   */
  getJobStatus(jobId: string): Promise<JobStatus | null>;

  /** Aggregate metrics for the queue (Super Admin diagnostic view). */
  getMetrics(): Promise<QueueMetrics>;
}

/**
 * Base context passed to every handler at execution time.
 * Handlers MUST revalidate tenantId/resource identifiers from this context
 * and never trust the envelope payload's authorization claims.
 */
export interface JobHandlerContext {
  envelope: JobEnvelope;
  traceId: string;
  /** True when this is a retry attempt (attemptsMade > 0). */
  isRetry: boolean;
  attemptsMade: number;
  maxAttempts: number;
  /** Abort signal fired on graceful shutdown / job cancellation. */
  signal: AbortSignal;
  /** Record a structured progress event (same traceId is attached). */
  progress(message: string, data?: Record<string, unknown>): void;
}

export interface JobHandlerResult {
  /** Optional small, non-secret summary stored on completion. */
  summary?: Record<string, unknown>;
}

/**
 * A typed job handler registration. The `payloadSchema` provides runtime
 * validation before execution; invalid payloads fail permanently (no retry).
 */
export interface JobHandlerDefinition<TPayload = unknown> {
  jobType: string;
  /** Human-readable description (no secrets). */
  description: string;
  /** Zod schema validating the envelope payload at execution time. */
  payloadSchema: z.ZodType<TPayload>;
  /** Handler implementation. May be async; must respect `signal`. */
  handle: (
    payload: TPayload,
    ctx: JobHandlerContext,
  ) => Promise<JobHandlerResult | void>;
  /**
   * Number of attempts before dead-lettering. Defaults to the queue default
   * when omitted.
   */
  maxAttempts?: number;
}

export interface JobHandlerRegistry {
  register(definition: JobHandlerDefinition<any>): void;
  get(jobType: string): JobHandlerDefinition<any> | undefined;
  has(jobType: string): boolean;
  list(): ReadonlyArray<JobHandlerDefinition<any>>;
}

```

### `workers/src/contracts/handlerRegistry.ts`
```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from "../logger.js";
import type {
  JobHandlerContext,
  JobHandlerDefinition,
  JobHandlerRegistry,
} from "./jobDispatcher.js";
import {
  classifyError,
  computeBackoffMs,
  DEFAULT_RETRY_POLICY,
  PermanentJobError,
  type RetryPolicy,
} from "./retryPolicy.js";
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
      // Permanent error or final attempt exhausted => dead-letter for replay.
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
```

### `workers/src/contracts/bullmqQueue.ts`
```ts
import { Queue, Worker, type Job, type Processor } from "bullmq";
import type { Redis } from "ioredis";
import { logger } from "../logger.js";
import type { JobDispatcher } from "./jobDispatcher.js";
import type { JobEnvelope, JobStatus, QueueMetrics } from "./jobEnvelope.js";
import type { JobHandlerDefinition } from "./jobDispatcher.js";
import { buildDedupKey, generateTraceId } from "./idempotency.js";
import {
  DEFAULT_RETRY_POLICY,
  RetryableJobError,
  PermanentJobError,
  type RetryPolicy,
} from "./retryPolicy.js";
import { ProcessingDurationTracker, publishJobEvent } from "./metrics.js";
import { executeHandler, type ExecutionOutcome } from "./handlerRegistry.js";

export interface BullMQAdapterOptions {
  queueName: string;
  connection: Redis;
  policy?: RetryPolicy;
  /** Retention: keep completed/failed jobs for dead-letter & replay. */
  removeOnComplete?: number | boolean;
  removeOnFail?: number | boolean;
  concurrency?: number;
}

/**
 * Production queue adapter backed by BullMQ/Redis.
 *
 * Implements the `JobDispatcher` port (producer) and runs a BullMQ `Worker`
 * (consumer). Idempotency is enforced by mapping `jobId` to the dedup key, so
 * Redis rejects duplicate dispatches atomically. Retry classification is
 * delegated to the handler registry: retryable failures bubble up as
 * `RetryableJobError` (BullMQ retries with our backoff policy); permanent
 * failures bubble as `PermanentJobError` and are retained as dead letters.
 */
export class BullMQQueue implements JobDispatcher {
  readonly queue: Queue;
  private worker: Worker | null = null;
  private readonly policy: RetryPolicy;
  private readonly handlers = new Map<string, JobHandlerDefinition>();
  private readonly processing = new ProcessingDurationTracker();
  private readonly queueName: string;
  private readonly connection: Redis;
  private readonly removeOnComplete: number | boolean;
  private readonly removeOnFail: number | boolean;
  private readonly concurrency: number;
  private consumerRunning = false;

  constructor(opts: BullMQAdapterOptions) {
    this.queueName = opts.queueName;
    this.connection = opts.connection;
    this.policy = opts.policy ?? DEFAULT_RETRY_POLICY;
    this.removeOnComplete = opts.removeOnComplete ?? 5000;
    this.removeOnFail = opts.removeOnFail ?? false;
    this.concurrency = opts.concurrency ?? 1;
    this.queue = new Queue(this.queueName, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: this.policy.maxAttempts,
        backoff: { type: "custom" },
        removeOnComplete: this.removeOnComplete,
        removeOnFail: this.removeOnFail,
        // Enforce size cap at the queue layer too (bytes).
        sizeLimit: 256 * 1024,
      },
    });
  }

  registerHandler(definition: JobHandlerDefinition): void {
    this.handlers.set(definition.jobType, definition);
  }

  async enqueue(
    input: Parameters<JobDispatcher["enqueue"]>[0],
  ): Promise<{ jobId: string; idempotencyKey: string; deduplicated: boolean }> {
    const jobId = buildDedupKey(input.jobType, input.idempotencyKey);

    const envelope: JobEnvelope = {
      jobType: input.jobType,
      schemaVersion: input.schemaVersion ?? "1.0.0",
      tenantId: input.tenantId,
      actorId: input.actorId,
      traceId: input.traceId || generateTraceId(),
      idempotencyKey: input.idempotencyKey,
      payload: input.payload ?? {},
      createdAt: new Date().toISOString(),
      priority: input.options?.priority ?? input.priority,
      scheduledFor: input.options?.scheduledFor ?? input.scheduledFor,
      displayName: input.options?.displayName ?? input.displayName,
    };

    // BullMQ rejects duplicate `jobId`s within the queue (dedup at source).
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      publishJobEvent({
        traceId: envelope.traceId,
        jobType: envelope.jobType,
        tenantId: envelope.tenantId,
        actorId: envelope.actorId,
        event: "enqueue",
        data: { deduplicated: true, jobId },
      });
      return { jobId, idempotencyKey: envelope.idempotencyKey, deduplicated: true };
    }

    const job = await this.queue.add(input.jobType, envelope, {
      jobId,
      priority: envelope.priority,
      delay: envelope.scheduledFor
        ? Math.max(0, Date.parse(envelope.scheduledFor) - Date.now())
        : undefined,
    });

    publishJobEvent({
      traceId: envelope.traceId,
      jobType: envelope.jobType,
      tenantId: envelope.tenantId,
      actorId: envelope.actorId,
      event: "enqueue",
      data: { deduplicated: false, jobId: job.id },
    });

    return {
      jobId: job.id ?? jobId,
      idempotencyKey: envelope.idempotencyKey,
      deduplicated: false,
    };
  }

  /**
   * Starts the BullMQ worker. `signal` triggers graceful shutdown: the worker
   * closes (waits for in-flight jobs up to `close()` timeout) and stops
   * accepting new jobs.
   */
  start(signal?: AbortSignal): void {
    if (this.worker) return;

    const processor: Processor<JobEnvelope> = async (job: Job) => {
      const handler = this.handlers.get(job.data.jobType);
      if (!handler) {
        throw new PermanentJobError(
          `no handler registered for ${job.data.jobType}`,
        );
      }

      const start = Date.now();
      const ctx = {
        envelope: job.data,
        traceId: job.data.traceId,
        isRetry: (job.attemptsMade ?? 0) > 0,
        attemptsMade: job.attemptsMade ?? 0,
        maxAttempts: this.policy.maxAttempts,
        signal: signal ?? new AbortController().signal,
        progress: (message: string, data?: Record<string, unknown>) =>
          publishJobEvent({
            traceId: job.data.traceId,
            jobType: job.data.jobType,
            tenantId: job.data.tenantId,
            actorId: job.data.actorId,
            event: "progress",
            attemptsMade: job.attemptsMade ?? 0,
            data: { message, ...data },
          }),
      };

      const outcome: ExecutionOutcome = await executeHandler(
        handler,
        ctx,
        this.policy,
      );

      this.processing.record(Date.now() - start);

      if (outcome.ok) {
        // Resolved => completed.
        return;
      }

      if (outcome.deadLettered) {
        // Permanent failure (or final attempt) => stop retries and retain as a
        // dead letter. `job.discard()` tells BullMQ not to reschedule, so the
        // thrown error moves the job straight to the failed set.
        try {
          await job.discard();
        } catch {
          // discard is best-effort; the throw below still finalizes the job.
        }
        throw new PermanentJobError(outcome.failedReason ?? "dead-lettered");
      }

      // Retryable => let BullMQ retry with our backoff policy.
      throw new RetryableJobError(outcome.failedReason ?? "retryable failure");
    };

    this.worker = new Worker(this.queueName, processor, {
      connection: this.connection,
      concurrency: this.concurrency,
      // Map BullMQ's computed backoff to our policy via the attempt number.
      settings: {
        backoffStrategy: (attemptsMade: number) =>
          computeBackoff(attemptsMade, this.policy),
      },
    });

    this.worker.on("completed", (job) => {
      publishJobEvent({
        traceId: (job.data as JobEnvelope).traceId,
        jobType: (job.data as JobEnvelope).jobType,
        tenantId: (job.data as JobEnvelope).tenantId,
        actorId: (job.data as JobEnvelope).actorId,
        event: "success",
        attemptsMade: job.attemptsMade,
      });
    });

    this.worker.on("failed", (job, err) => {
      if (!job) return;
      const data = job.data as JobEnvelope;
      const attemptsMade = job.attemptsMade ?? 0;
      const willRetry = attemptsMade < this.policy.maxAttempts;
      publishJobEvent({
        traceId: data.traceId,
        jobType: data.jobType,
        tenantId: data.tenantId,
        actorId: data.actorId,
        event: willRetry ? "retry" : "dead-letter",
        attemptsMade,
        data: { reason: err?.message },
      });
    });

    this.consumerRunning = true;
    logger.info(
      { queue: this.queueName, concurrency: this.concurrency },
      "bullmq worker started",
    );
  }

  async stop(): Promise<void> {
    this.consumerRunning = false;
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    logger.info({ queue: this.queueName }, "bullmq worker stopped");
  }

  isConsumerRunning(): boolean {
    return this.consumerRunning && this.worker !== null;
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = (await job.getState()) as JobStatus["state"];
    const attemptsMade = job.attemptsMade ?? 0;
    const failedReason =
      (job.failedReason as string | undefined)?.slice(0, 512) ?? null;

    return {
      jobId,
      jobType: (job.data as JobEnvelope).jobType,
      tenantId: (job.data as JobEnvelope).tenantId,
      actorId: (job.data as JobEnvelope).actorId,
      traceId: (job.data as JobEnvelope).traceId,
      idempotencyKey: (job.data as JobEnvelope).idempotencyKey,
      state,
      attemptsMade,
      maxAttempts: attemptsMade + (job.opts?.attempts ?? this.policy.maxAttempts),
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      processedAt: job.processedOn
        ? new Date(job.processedOn).toISOString()
        : null,
      finishedAt: job.finishedOn
        ? new Date(job.finishedOn).toISOString()
        : null,
      failedReason,
      displayName: ((job.data as JobEnvelope).displayName as string) ?? null,
    };
  }

  async getMetrics(): Promise<QueueMetrics> {
    const counts = await this.queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
    );

    // Count jobs currently retrying (active attempts > 0) — approximate via
    // active jobs where attemptsMade > 0 is not directly queryable, so we
    // report active jobs that have been attempted at least once.
    let retrying = 0;
    try {
      const active = await this.queue.getJobs("active", 0, 50);
      for (const j of active) {
        if ((j.attemptsMade ?? 0) > 0) retrying += 1;
      }
    } catch {
      retrying = 0;
    }

    return {
      queue: this.queueName,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      retrying,
      avgProcessingMs: this.processing.average(),
    };
  }

  /** Dead-letter replay: re-add a failed job by id. Super Admin only (API). */
  async replayJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    if (state !== "failed") return false;
    await job.retry();
    return true;
  }

  async close(): Promise<void> {
    await this.stop();
    await this.queue.close();
    // The ioredis connection is owned by the adapter; release it so processes
    // (and tests) do not hang on open handles.
    try {
      if (this.connection.status !== "end") {
        this.connection.disconnect();
      }
    } catch {
      // best-effort teardown
    }
  }
}

function computeBackoff(attemptsMade: number, policy: RetryPolicy): number {
  const exponent = Math.max(0, attemptsMade);
  const delay = policy.baseDelayMs * policy.backoffFactor ** exponent;
  return Math.min(Math.round(delay), policy.maxDelayMs);
}

```

### `workers/src/contracts/inMemoryQueue.ts`
```ts
import { randomUUID } from "node:crypto";
import type { JobDispatcher } from "./jobDispatcher.js";
import type { JobEnvelope, JobStatus, QueueMetrics } from "./jobEnvelope.js";
import type { JobHandlerDefinition } from "./jobDispatcher.js";
import { buildDedupKey } from "./idempotency.js";
import { DEFAULT_RETRY_POLICY, type RetryPolicy } from "./retryPolicy.js";
import { ProcessingDurationTracker, publishJobEvent } from "./metrics.js";
import { executeHandler, type ExecutionOutcome } from "./handlerRegistry.js";

interface StoredJob {
  jobId: string;
  envelope: JobEnvelope;
  deduplicated: boolean;
  attemptsMade: number;
  maxAttempts: number;
  state: JobStatus["state"];
  createdAt: string | null;
  processedAt: string | null;
  finishedAt: string | null;
  failedReason: string | null;
}

/**
 * Vendor-free, process-local queue adapter.
 *
 * Implements the `JobDispatcher` port AND the consumer loop, so feature teams
 * can develop typed jobs end-to-end without Redis/Mongo. It mirrors the
 * production BullMQ adapter's contract (enqueue, dedup, retry, dead-letter)
 * which is asserted by the shared contract tests.
 */
export class InMemoryQueue implements JobDispatcher {
  private readonly jobs = new Map<string, StoredJob>();
  private readonly dedup = new Set<string>();
  private readonly handlers = new Map<string, JobHandlerDefinition>();
  private readonly processing = new ProcessingDurationTracker();
  private consumerTimer: NodeJS.Timeout | null = null;
  private readonly abortController = new AbortController();
  private running = false;
  private readonly queueName: string;

  constructor(
    private readonly policy: RetryPolicy = DEFAULT_RETRY_POLICY,
    queueName = "inmemory",
  ) {
    this.queueName = queueName;
  }

  registerHandler(definition: JobHandlerDefinition): void {
    this.handlers.set(definition.jobType, definition);
  }

  async enqueue(input: Parameters<JobDispatcher["enqueue"]>[0]): Promise<{
    jobId: string;
    idempotencyKey: string;
    deduplicated: boolean;
  }> {
    const key = buildDedupKey(input.jobType, input.idempotencyKey);
    const deduplicated = this.dedup.has(key);

    const envelope: JobEnvelope = {
      jobType: input.jobType,
      schemaVersion: input.schemaVersion ?? "1.0.0",
      tenantId: input.tenantId,
      actorId: input.actorId,
      traceId: input.traceId,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload ?? {},
      createdAt: new Date().toISOString(),
      priority: input.options?.priority ?? input.priority,
      scheduledFor: input.options?.scheduledFor ?? input.scheduledFor,
      displayName: input.options?.displayName ?? input.displayName,
    };

    if (deduplicated) {
      publishJobEvent({
        traceId: envelope.traceId,
        jobType: envelope.jobType,
        tenantId: envelope.tenantId,
        actorId: envelope.actorId,
        event: "enqueue",
        data: { deduplicated: true },
      });
      const existing = [...this.jobs.values()].find(
        (j) => j.envelope.idempotencyKey === envelope.idempotencyKey,
      );
      return {
        jobId: existing?.jobId ?? `dup:${randomUUID()}`,
        idempotencyKey: envelope.idempotencyKey,
        deduplicated: true,
      };
    }

    this.dedup.add(key);
    const jobId = `job:${randomUUID()}`;
    this.jobs.set(jobId, {
      jobId,
      envelope,
      deduplicated: false,
      attemptsMade: 0,
      maxAttempts: this.policy.maxAttempts,
      state: envelope.scheduledFor ? "delayed" : "waiting",
      createdAt: envelope.createdAt,
      processedAt: null,
      finishedAt: null,
      failedReason: null,
    });

    publishJobEvent({
      traceId: envelope.traceId,
      jobType: envelope.jobType,
      tenantId: envelope.tenantId,
      actorId: envelope.actorId,
      event: "enqueue",
      data: { deduplicated: false, jobId },
    });

    return { jobId, idempotencyKey: envelope.idempotencyKey, deduplicated: false };
  }

  /**
   * Starts the in-process consumer loop. The loop respects the abort signal
   * for graceful shutdown.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (this.abortController.signal.aborted) return;
      void this.drain().finally(() => {
        if (!this.abortController.signal.aborted) {
          this.consumerTimer = setTimeout(tick, 50);
        }
      });
    };
    this.consumerTimer = setTimeout(tick, 0);
  }

  stop(): void {
    this.running = false;
    this.abortController.abort();
    if (this.consumerTimer) clearTimeout(this.consumerTimer);
    this.consumerTimer = null;
  }

  isConsumerRunning(): boolean {
    return this.running && !this.abortController.signal.aborted;
  }

  private async drain(): Promise<void> {
    for (const job of this.jobs.values()) {
      if (this.abortController.signal.aborted) return;
      if (job.state !== "waiting" && job.state !== "delayed") continue;
      if (job.envelope.scheduledFor) {
        const due = Date.parse(job.envelope.scheduledFor);
        if (Number.isFinite(due) && due > Date.now()) continue;
      }
      await this.processOne(job);
    }
  }

  private async processOne(job: StoredJob): Promise<void> {
    const handler = this.handlers.get(job.envelope.jobType);
    if (!handler) {
      job.state = "failed";
      job.finishedAt = new Date().toISOString();
      job.failedReason = `no handler registered for ${job.envelope.jobType}`;
      return;
    }

    job.state = "active";
    job.processedAt = new Date().toISOString();
    const start = Date.now();

    const ctx = {
      envelope: job.envelope,
      traceId: job.envelope.traceId,
      isRetry: job.attemptsMade > 0,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.maxAttempts,
      signal: this.abortController.signal,
      progress: (message: string, data?: Record<string, unknown>) =>
        publishJobEvent({
          traceId: job.envelope.traceId,
          jobType: job.envelope.jobType,
          tenantId: job.envelope.tenantId,
          actorId: job.envelope.actorId,
          event: "progress",
          attemptsMade: job.attemptsMade,
          data: { message, ...data },
        }),
    };

    const outcome: ExecutionOutcome = await executeHandler(handler, ctx, this.policy);
    const durationMs = Date.now() - start;
    this.processing.record(durationMs);

    job.attemptsMade += 1;

    if (outcome.ok) {
      job.state = "completed";
      job.finishedAt = new Date().toISOString();
    } else if (outcome.deadLettered) {
      job.state = "failed";
      job.finishedAt = new Date().toISOString();
      job.failedReason = outcome.failedReason ?? "dead-lettered";
    } else if (outcome.shouldRetry) {
      job.state = "waiting";
      job.failedReason = outcome.failedReason ?? null;
    }
  }

  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return this.toStatus(job);
  }

  async getMetrics(): Promise<QueueMetrics> {
    let waiting = 0;
    let active = 0;
    let delayed = 0;
    let completed = 0;
    let failed = 0;
    let retrying = 0;

    for (const job of this.jobs.values()) {
      switch (job.state) {
        case "waiting":
          waiting += 1;
          break;
        case "active":
          active += 1;
          break;
        case "delayed":
          delayed += 1;
          break;
        case "completed":
          completed += 1;
          break;
        case "failed":
          failed += 1;
          break;
      }
      if (job.state === "active" && job.attemptsMade > 0) retrying += 1;
    }

    return {
      queue: this.queueName,
      waiting,
      active,
      delayed,
      completed,
      failed,
      retrying,
      avgProcessingMs: this.processing.average(),
    };
  }

  private toStatus(job: StoredJob): JobStatus {
    return {
      jobId: job.jobId,
      jobType: job.envelope.jobType,
      tenantId: job.envelope.tenantId,
      actorId: job.envelope.actorId,
      traceId: job.envelope.traceId,
      idempotencyKey: job.envelope.idempotencyKey,
      state: job.state,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.maxAttempts,
      createdAt: job.createdAt,
      processedAt: job.processedAt,
      finishedAt: job.finishedAt,
      failedReason: job.failedReason,
      displayName: job.envelope.displayName ?? null,
    };
  }
}
```

### `workers/src/contracts/retryPolicy.ts`
```ts
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
```

### `workers/src/contracts/metrics.ts`
```ts
import { logger } from "../logger.js";
import type { QueueMetrics } from "./jobEnvelope.js";

/**
 * Rolling-window tracker for processing durations. Kept in-memory per worker
 * process; the adapter reports the running average via getMetrics().
 */
export class ProcessingDurationTracker {
  private readonly samples: number[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = 100) {
    this.maxSamples = maxSamples;
  }

  record(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.samples.push(ms);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  average(): number {
    if (this.samples.length === 0) return 0;
    const sum = this.samples.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / this.samples.length);
  }
}

/**
 * Publishes queue metrics in a consistent, adapter-agnostic way.
 * Metrics are emitted as structured logs with the same metric names the
 * Super Admin status endpoint consumes.
 */
export function publishQueueMetrics(metrics: QueueMetrics): void {
  logger.info(
    {
      metric: "queue.metrics",
      queue: metrics.queue,
      waiting: metrics.waiting,
      active: metrics.active,
      delayed: metrics.delayed,
      completed: metrics.completed,
      failed: metrics.failed,
      retrying: metrics.retrying,
      avgProcessingMs: metrics.avgProcessingMs,
    },
    "queue metrics snapshot",
  );
}

export function publishJobEvent(params: {
  traceId: string;
  jobType: string;
  tenantId: string;
  actorId: string;
  event:
    | "enqueue"
    | "start"
    | "progress"
    | "success"
    | "failure"
    | "retry"
    | "dead-letter";
  attemptsMade?: number;
  data?: Record<string, unknown>;
}): void {
  logger.info(
    {
      metric: `job.${params.event}`,
      traceId: params.traceId,
      jobType: params.jobType,
      tenantId: params.tenantId,
      actorId: params.actorId,
      attemptsMade: params.attemptsMade,
      ...params.data,
    },
    `job ${params.event}`,
  );
}
```

