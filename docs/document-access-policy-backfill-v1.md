# Document access policy backfill v1

This document covers Issue 18 Phase 4 only. The backfill prepares existing documents for later authorization enforcement; it does not change document list, detail, download, mutation, processing, query, or retrieval visibility. It is an internal operational script, not a public API.

## Data and decisions

Documents gain optional tenant-owned `categoryId`, `departmentId`, and `classificationId` references. The existing `owner`, free-text `category`, `department`, and `classification`, file `version`, `versionLabel`, and active-policy fields remain intact. Application routes do not depend on the new references in this phase.

Owner resolution preserves an existing same-tenant active user. Otherwise it uses the authoritative `uploadedBy` only when that user is same-tenant and active. Pending, disabled, malformed, missing, and cross-tenant users are ineligible and cause `OWNER_UNRESOLVED`; no administrator or first-user fallback exists.

Category and department values use the Phase 2 whitespace/case normalization and reuse an active tenant identity. Blank values remain null. Missing identities are planned in dry-run and created idempotently in apply. An archived normalized identity is a quarantine conflict and is never restored. Raw legacy values are never reported.

Canonical classification identities are `Internal` (`internal`), `Restricted` (`restricted`), `Confidential` (`confidential`), and `Highly Confidential` (`highly_confidential`). Missing, blank, `public`, malformed, or unsupported values default to Restricted with `DEFAULTED_TO_RESTRICTED`. Archived canonical conflicts quarantine the document.

## Running safely

Dry-run is always the default. `--apply` is the only write switch and is an operationally privileged action. A tenant is mandatory. Batches are capped at 250 and the run limit at 10,000. Ordering is ascending document `_id`; `--after-id` and `--checkpoint` resume strictly after a terminal result and cannot be combined.

```sh
npm --workspace api run migrate:document-policy:v1 -- --tenant-id=<tenant-object-id> --batch-size=50 --limit=500
npm --workspace api run migrate:document-policy:v1:apply -- --tenant-id=<tenant-object-id> --checkpoint=<last-document-object-id>
```

Dry-run performs no taxonomy, policy, or document writes. Apply uses the same planner. Taxonomy creation uses tenant unique identities and reloads after duplicate-key races. For each eligible document, a transaction conditionally matches the scanned source state, assigns owner/references, inserts immutable policy version 1, and sets the active pointer and `policyChangedAt`. A transaction-capable replica set is required; there is no non-transactional fallback. Source changes abort and roll back the document/policy work, leaving the document retryable. Existing active policies are skipped and histories are never overwritten.

The fail-closed default snapshot grants only `discover`, `read`, and `download` to the owner. It creates no tenant-member, employee-wide, `use_in_ai`, `manage_access`, lifecycle-mutation, replace, or reprocess grant and remains subject to coarse permission denial.

## Reports and recovery

Per-document output is restricted to tenant/document IDs, status, reason code, checkpoint, resolved taxonomy IDs, and created policy ID/version. Aggregate counts and elapsed milliseconds are included. It excludes titles, filenames, descriptions, tags, content, extracted text, raw taxonomy values, emails, names, and raw database errors. Exit code 0 means success, 2 means quarantine/source-change partial completion, and 1 means fatal/failed work.

Recovery uses placeholders only:

```sh
# Repeat inspection
npm --workspace api run migrate:document-policy:v1 -- --tenant-id=<tenant-object-id>
# Resume committed apply work
npm --workspace api run migrate:document-policy:v1:apply -- --tenant-id=<tenant-object-id> --checkpoint=<last-terminal-document-id>
# Retry a corrected quarantined item and later documents
npm --workspace api run migrate:document-policy:v1 -- --tenant-id=<tenant-object-id> --after-id=<preceding-document-id> --limit=1
```

Use the report `reasonCounts` for aggregate inspection. A quarantined result is a checkpoint terminal result for that run but remains retryable after source correction. Do not advance a recovery checkpoint past an unprocessed document.

Later phases own synchronous API enforcement, production evaluator/query filters, policy management and preview/apply APIs, sensitive-broadening confirmation, propagation/reindex/audit, retrieval/citations, and frontend UI.
