# Worker Runtime & Queue Contract

Implements feature/05-build-functional-worker-runtime-and-queue-contract.

## Overview

The background worker (`workers/`) now runs a resilient, queue-backed job
runtime. Product modules enqueue work through a stable `JobDispatcher` port and
never import BullMQ/Redis directly. Handlers are registered in a typed registry
and validated at execution time.

## Architecture

```
api/src/modules/jobs        → API-side producer (JobDispatcher port)
workers/src/contracts       → shared contract (envelope, port, adapters, registry, retry)
workers/src/jobs            → handler registry assembly + sample job
workers/src/runtime.ts      → wires Redis/Mongo, selects adapter, readiness, shutdown
```

The API depends only on `workers/contracts` (type + schema, no runtime), so the
workspaces have no circular runtime dependency.

## Job Envelope (versioned, traceable, idempotent)

| Field            | Type      | Notes |
|------------------|-----------|-------|
| `jobType`        | string    | router key, `[a-zA-Z0-9_.:-]+` |
| `schemaVersion`  | enum      | `"1.0.0"` |
| `tenantId`       | string    | derived from auth context on the API side |
| `actorId`        | string    | user that initiated the job |
| `traceId`        | string    | shared across enqueue/execute/retry/dead-letter logs |
| `idempotencyKey` | string    | same key enqueued twice must not execute twice |
| `payload`        | unknown   | product data; validated by the handler's schema; capped at 256 KiB |
| `createdAt`      | datetime  | set by producer |
| `priority`       | int?      | higher = sooner |
| `scheduledFor`   | datetime? | delayed-until |
| `displayName`    | string?   | non-secret label |

## Adapters

- **InMemoryQueue** — process-local, vendor-free. Implements the full port
  (enqueue, dedup, retry, dead-letter) for parallel feature development.
- **BullMQQueue** — production adapter (Redis). Dedup via `jobId = dedupKey`.
  Retry classification delegated to the handler registry; permanent failures
  are retained as dead letters (`removeOnFail: false`).

Both adapters are covered by the same contract tests in
`workers/src/contracts/*.test.ts`.

## Security & Multi-Tenancy

- **No secrets / raw document content in job IDs or logs.** Job IDs are
  `dedupKey`/`job:` UUIDs. Logs are redacted via the existing pino redaction
  rules.
- **Tenant identity is derived from the auth context** (`req.auth.tenantId`),
  never from the request body.
- **Handlers revalidate tenant/actor identifiers** and never trust payload
  authorization.
- **Inspection / replay / cancel APIs are Super Admin only** (`authorize("SUPER_ADMIN")`).
- **Payload schemas are validated and size-capped** (256 KiB).

## API Contracts (API side)

All routes require `authenticate`. Base path `/`.

### `POST /jobs/enqueue`
- **Auth:** any authenticated role (tenant/actor derived server-side).
- **Body:** partial envelope (`jobType`, `idempotencyKey`, `payload`, optional
  `traceId`, `priority`, `scheduledFor`, `displayName`). `schemaVersion` and
  `createdAt` defaulted by the producer.
- **Success:** `202` `{ success, data: { jobId, idempotencyKey, deduplicated } }`.
- **Failure:** `422` `{ error: "JOB_ENVELOPE_INVALID", message }` on schema/size
  violation. `401` if unauthenticated.
- **Idempotency:** duplicate `idempotencyKey` returns the existing `jobId` with
  `deduplicated: true`.

### `GET /platform/jobs/metrics`
- **Auth:** `SUPER_ADMIN`.
- **Returns:** `{ queue, waiting, active, delayed, completed, failed, retrying, avgProcessingMs }`.

### `GET /platform/jobs/:jobId`
- **Auth:** `SUPER_ADMIN`.
- **Returns:** `JobStatus` (jobId, jobType, tenantId, actorId, traceId,
  idempotencyKey, state, attemptsMade, maxAttempts, timestamps, failedReason).

### `POST /platform/jobs/:jobId/replay`
- **Auth:** `SUPER_ADMIN`.
- **Behavior:** re-adds a `failed` job. `202` on success, `409` if not replayable.

## Worker Health

- `GET /healthz` — liveness (always 200).
- `GET /readyz` — dependency-aware readiness. Returns `503` and a `checks`
  object when Redis, MongoDB, handler registration, or the consumer are not
  healthy.
- `GET /metrics` — current queue metrics snapshot (Super Admin diagnostic view).

## Running locally

```bash
docker compose up --build        # api + app + worker + redis + mongo
npm run dev:workers              # worker only (needs REDIS_URL + MONGODB_URI)
```

With no Redis available the worker degrades to the in-memory adapter but
readiness still reports Redis as unavailable.

## Testing

```bash
REDIS_URL=redis://127.0.0.1:6379 npm run test:workers   # unit + contract + bullmq integration
npm run test:api                 # includes api/modules/jobs tests
```

Coverage: envelope validation, handler registry, retry policy, idempotency,
in-memory contract (enqueue/execute/retry/dedup/dead-letter), BullMQ contract
(enqueue/execute/dedup/dead-letter/replay), graceful shutdown, and API
producer validation/dedup.
