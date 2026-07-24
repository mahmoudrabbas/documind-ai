# Document Policy Propagation V1

## Scope and security boundary

Phase 7 propagates policy and taxonomy identity into derived records. Phase 5 synchronous authorization remains authoritative immediately after policy activation. Queue availability, generation status, derived metadata, retries, and dead letters never grant direct document access.

No retrieval engine, vector provider, notification channel, or frontend is introduced here.

## Transactional outbox

A changed policy commits its immutable snapshot, document pointer CAS, Phase 6 idempotency result, desired generation, one deterministic outbox event, and the durable propagation-requested audit record in the same Mongo transaction. A conflict, rollback, no-change, or idempotent replay creates no new event.

Outbox states are `pending`, `dispatching`, `dispatched`, `processing`, `completed`, `retry_pending`, `failed`, `dead_letter`, and `superseded`. Claims and transitions are conditional. Payloads contain identifiers, versions, taxonomy IDs, direction, safe correlation, and timestamps only.

## Dispatch and job V1

The dispatcher claims at most 50 eligible records, publishes `document.policy.propagate`, and uses the event ID as both queue idempotency key and deterministic job identity. A crash after publish is safe because duplicate queue publication is deduplicated and the same outbox event is conditionally resumed.

The payload uses `schemaVersion: 1`, is strictly validated and size bounded, and contains placeholder-shaped tenant, document, document-version, policy, taxonomy, generation, event, direction, reason, and correlation fields.

## Worker authority and stale jobs

The worker reloads the tenant-scoped document, active pointer, current document version, lifecycle state, exact immutable snapshot, taxonomy identities, and desired generation. It never treats queue values as current authority.

An older policy or document-version event becomes `superseded` and cannot overwrite newer metadata. A newer-than-current event, cross-tenant mismatch, missing snapshot, taxonomy mismatch, or invalid state fails closed without derived writes.

## Retry, dead letter, and recovery

Transient storage or target failures use the existing bounded five-attempt exponential-backoff queue behavior. Malformed or authoritative-state failures are terminal. Only stable codes are persisted; stack traces and provider responses are excluded.

Dead-letter generations remain non-current and Phase 5 enforcement continues. Operational recovery uses the existing restricted queue replay/internal dispatcher conventions; no public replay endpoint is added.

Authorized policy managers can read safe state through `GET /documents/:id/access-policy/propagation-status`. It exposes desired/applied versions, state, attempts, timestamps, reindex requirement, and a stable failure code only.

Classification level changes and classification archive/restore discover affected documents in pages of 50 and create deterministic taxonomy propagation work. Display-only category and department names are not copied into derived metadata and do not create security grants.

Phase 8 UI and later retrieval/citation work remain outside this contract.
