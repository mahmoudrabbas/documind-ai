# Document Policy Audit V1

## Event catalog

Taxonomy events: `DOCUMENT_CATEGORY_CREATED`, `DOCUMENT_CATEGORY_UPDATED`, `DOCUMENT_CATEGORY_ARCHIVED`, `DOCUMENT_CATEGORY_RESTORED`, corresponding `DOCUMENT_DEPARTMENT_*` events, and corresponding `DOCUMENT_CLASSIFICATION_*` events.

Policy events: `DOCUMENT_POLICY_PREVIEWED`, `DOCUMENT_POLICY_APPLIED`, `DOCUMENT_POLICY_BATCH_PREVIEWED`, `DOCUMENT_POLICY_BATCH_APPLIED`, and `DOCUMENT_POLICY_SENSITIVE_BROADENING_CONFIRMED`.

Authorization events: `DOCUMENT_ACCESS_DENIED` and `DOCUMENT_ACCESS_STALE_POLICY_REJECTED`.

Propagation events: `DOCUMENT_POLICY_PROPAGATION_REQUESTED`, `DOCUMENT_POLICY_PROPAGATION_DISPATCHED`, `DOCUMENT_POLICY_PROPAGATION_COMPLETED`, `DOCUMENT_POLICY_PROPAGATION_FAILED`, `DOCUMENT_POLICY_PROPAGATION_SUPERSEDED`, `DOCUMENT_POLICY_REINDEX_REQUESTED`, `DOCUMENT_POLICY_REINDEX_COMPLETED`, and `DOCUMENT_POLICY_REINDEX_FAILED`.

## Safe payload

Events may contain authoritative tenant/actor/document/policy/taxonomy identifiers, old/new versions, direction, aggregate counts, sensitive-confirmation state, event/generation/correlation IDs, result, stable reason code, and timestamp. They exclude content, extracted text, names, rules, email addresses, preview tokens, request bodies, configuration, stack traces, and raw infrastructure responses.

The propagation-requested record is durable in the policy transaction. Existing taxonomy, preview/apply, denial, dispatch, and worker lifecycle events follow the repository's redacting best-effort audit writer or safe worker audit insertion. Audit failure never turns a denial into an allow and public denials remain hidden 404 responses.

Idempotent apply replay does not emit another applied/requested event. Duplicate worker completion is conditionally suppressed.
